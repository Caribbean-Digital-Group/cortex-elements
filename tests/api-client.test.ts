import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, CortexApiError } from '../src/core/api-client'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

afterEach(() => vi.unstubAllGlobals())

describe('ApiClient', () => {
  it('envía el contrato de /ocr/extract con Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { document_type: 'ine' }))
    vi.stubGlobal('fetch', fetchMock)

    await new ApiClient('ck_live_test', 'http://localhost:8000/').extractDocument('QUJD', 'ine')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://localhost:8000/ocr/extract')
    expect(init.headers.Authorization).toBe('Bearer ck_live_test')
    expect(JSON.parse(init.body)).toEqual({ file_base64: 'QUJD', document_type: 'ine', engine: 'auto' })
  })

  it('expone detail y code del backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(402, { detail: 'Límite mensual alcanzado', code: 'MONTHLY_QUOTA_EXCEEDED' })),
    )
    const error = await new ApiClient('ck_live_test').signatureCompare('a', 'b').catch((e) => e)
    expect(error).toBeInstanceOf(CortexApiError)
    expect(error.code).toBe('MONTHLY_QUOTA_EXCEEDED')
    expect(error.message).toBe('Límite mensual alcanzado')
    expect(error.status).toBe(402)
  })

  it('usa un mensaje por defecto si el cuerpo no es JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 403 })))
    const error = await new ApiClient('ck_live_test').signatureCompare('a', 'b').catch((e) => e)
    expect(error.message).toMatch(/no está autorizado/)
  })

  it('reintenta una vez ante 503 con Retry-After corto', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { detail: 'ocupado', code: 'PROVIDER_BUSY' }, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse(200, { authentic: true }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = new ApiClient('ck_live_test').signatureCompare('a', 'b')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(pending).resolves.toEqual({ authentic: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('envía el origen de la muestra y la referencia externa de la firma', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { authentic: true }))
    vi.stubGlobal('fetch', fetchMock)
    await new ApiClient('ck_live_test').signatureCompare('a', 'b', { sampleSource: 'canvas', externalId: 'CTR-1' })
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      reference: 'a', sample: 'b', threshold: null, sample_source: 'canvas', external_id: 'CTR-1',
    })
  })

  it('traduce errores de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await new ApiClient('ck_live_test').signatureCompare('a', 'b').catch((e) => e)
    expect(error.code).toBe('NETWORK_ERROR')
  })
})

describe('ApiClient engine', () => {
  it('envía el motor de OCR elegido', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await new ApiClient('ck_live_test').extractDocument('QUJD', 'curp', 'glm')
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ file_base64: 'QUJD', document_type: 'curp', engine: 'glm' })
    vi.unstubAllGlobals()
  })

  it('pre-procesa la INE y verifica solo con la selfie', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { document_session: 'ses-1', expires_in: 600 }))
      .mockResolvedValueOnce(jsonResponse(200, { verified: true }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient('ck_live_test', 'http://localhost:8000')

    const prep = await client.prepareIdentityDocument('INE', { extractDocument: true })
    await client.verifyIdentity(null, 'SELFIE', { documentSession: prep.document_session, externalId: 'EXP-1' })

    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:8000/face/document')
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ document_image: 'INE', extract_document: true, ocr_engine: 'auto' })
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body)
    expect(body.document_session).toBe('ses-1')
    expect(body).not.toHaveProperty('document_image') // la INE no vuelve a viajar
    expect(body.selfie_image).toBe('SELFIE')
    expect(body.external_id).toBe('EXP-1')
  })
})
