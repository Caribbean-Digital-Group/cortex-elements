import type { OcrResult } from '../types/ocr'
import type { IdentityResult } from '../types/identity'
import type { SignatureResult } from '../types/signature'

export const DEFAULT_API_URL = 'https://api.cortexverify.com'

const REQUEST_TIMEOUT_MS = 30_000

// ─── Error type ──────────────────────────────────────────────────────────────

export class CortexApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CortexApiError'
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function withTimeout(
  url: string,
  init: RequestInit,
  ms = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CortexApiError('TIMEOUT', 'La solicitud tardó demasiado. Intenta de nuevo.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Extract a human-readable message without exposing raw server internals
    let msg = `Error del servidor (HTTP ${res.status}).`
    try {
      const body = (await res.json()) as Record<string, unknown>
      if (typeof body['message'] === 'string' && body['message'].length < 256) {
        msg = body['message']
      } else if (typeof body['error'] === 'string' && body['error'].length < 256) {
        msg = body['error']
      }
    } catch {
      /* ignore parse errors — use default message */
    }
    throw new CortexApiError(`HTTP_${res.status}`, msg)
  }
  return res.json() as Promise<T>
}

// ─── ApiClient ────────────────────────────────────────────────────────────────

export class ApiClient {
  private readonly base: string
  // Stored as the full header value to avoid reconstructing it on every request
  private readonly authHeader: string

  constructor(apiKey: string, apiUrl = DEFAULT_API_URL) {
    this.base = apiUrl.replace(/\/$/, '')
    this.authHeader = `Bearer ${apiKey}`
  }

  private get commonHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      Accept: 'application/json',
    }
  }

  // ── OCR ────────────────────────────────────────────────────────────────────

  async ocrDocument(file: File): Promise<OcrResult> {
    const form = new FormData()
    form.append('file', file)
    const res = await withTimeout(`${this.base}/ocr/document`, {
      method: 'POST',
      headers: this.commonHeaders,
      body: form,
    })
    return parseResponse<OcrResult>(res)
  }

  async ocrDocumentBase64(image: string): Promise<OcrResult> {
    const res = await withTimeout(`${this.base}/ocr/document/base64`, {
      method: 'POST',
      headers: { ...this.commonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    })
    return parseResponse<OcrResult>(res)
  }

  // ── Face / Identity ────────────────────────────────────────────────────────

  async faceCompareBase64(image1: string, image2: string): Promise<IdentityResult> {
    const res = await withTimeout(`${this.base}/face/compare/base64`, {
      method: 'POST',
      headers: { ...this.commonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image1, image2 }),
    })
    return parseResponse<IdentityResult>(res)
  }

  // ── Signature ──────────────────────────────────────────────────────────────

  async signatureCompare(reference: File, sample: File | Blob): Promise<SignatureResult> {
    const form = new FormData()
    form.append('reference', reference)
    // Ensure the blob has a filename so the server can infer MIME type
    form.append('sample', sample, 'sample.png')
    const res = await withTimeout(`${this.base}/signature/compare`, {
      method: 'POST',
      headers: this.commonHeaders,
      body: form,
    })
    return parseResponse<SignatureResult>(res)
  }
}
