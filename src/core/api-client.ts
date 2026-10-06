import type { DocumentType, OcrEngine, OcrResult } from '../types/ocr'
import type { IdentityResult } from '../types/identity'
import type { SignatureResult, SignatureSampleSource } from '../types/signature'

/**
 * URL del backend usada cuando el element no define `api-url`.
 * Se fija al compilar desde VITE_CORTEX_API_URL (.env / .env.production); vite.config.ts la valida.
 */
export const DEFAULT_API_URL: string = import.meta.env.VITE_CORTEX_API_URL.replace(/\/+$/, '')

// OCR y biometría pueden tardar (modelos de IA); se da margen suficiente
const TIMEOUT_MS = { ocr: 90_000, face: 60_000, signature: 30_000 }

// Reintento automático único cuando el servidor indica saturación temporal
const RETRYABLE_STATUS = new Set([503])
const MAX_RETRY_AFTER_S = 10

// ─── Error type ──────────────────────────────────────────────────────────────

export class CortexApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'CortexApiError'
  }
}

// Mensajes de respaldo cuando el servidor no envía uno legible
const STATUS_MESSAGES: Record<number, string> = {
  401: 'API key inválida o revocada.',
  402: 'Se alcanzó el límite mensual de verificaciones del plan.',
  403: 'Este sitio no está autorizado para usar esta API key.',
  413: 'El archivo es demasiado grande.',
  415: 'Formato de archivo no soportado.',
  429: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  503: 'El servicio está saturado. Intenta de nuevo en unos segundos.',
}

// ─── Internals ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CortexApiError('TIMEOUT', 'La solicitud tardó demasiado. Intenta de nuevo.')
    }
    throw new CortexApiError('NETWORK_ERROR', 'No se pudo conectar con Cortex. Revisa tu conexión.')
  } finally {
    clearTimeout(timer)
  }
}

async function toApiError(res: Response): Promise<CortexApiError> {
  let code = `HTTP_${res.status}`
  let message = STATUS_MESSAGES[res.status] ?? `Error del servidor (HTTP ${res.status}).`
  try {
    const body = (await res.json()) as Record<string, unknown>
    // Formato del backend: { detail: string, code: string }
    const detail = body['detail'] ?? body['message'] ?? body['error']
    if (typeof detail === 'string' && detail.length < 300) message = detail
    if (typeof body['code'] === 'string') code = body['code']
  } catch {
    /* cuerpo no JSON — se usa el mensaje por defecto */
  }
  return new CortexApiError(code, message, res.status)
}

// ─── ApiClient ────────────────────────────────────────────────────────────────

export class ApiClient {
  private readonly base: string
  // Se guarda el header completo para no reconstruirlo en cada request
  private readonly authHeader: string

  constructor(apiKey: string, apiUrl = DEFAULT_API_URL) {
    this.base = apiUrl.replace(/\/$/, '')
    this.authHeader = `Bearer ${apiKey}`
  }

  private async post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }

    let res = await fetchWithTimeout(`${this.base}${path}`, init, timeoutMs)
    if (RETRYABLE_STATUS.has(res.status)) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '3')
      if (Number.isFinite(retryAfter) && retryAfter <= MAX_RETRY_AFTER_S) {
        await sleep(Math.max(1, retryAfter) * 1000)
        res = await fetchWithTimeout(`${this.base}${path}`, init, timeoutMs)
      }
    }
    if (!res.ok) throw await toApiError(res)
    return res.json() as Promise<T>
  }

  /** Extracción estructurada de INE, CURP, CFDI (imagen/PDF/XML) o Constancia de Situación Fiscal. */
  extractDocument(
    fileBase64: string,
    documentType: DocumentType = 'auto',
    engine: OcrEngine = 'auto',
  ): Promise<OcrResult> {
    return this.post<OcrResult>(
      '/ocr/extract',
      { file_base64: fileBase64, document_type: documentType, engine },
      TIMEOUT_MS.ocr,
    )
  }

  /** Verificación facial: identificación vs selfie, con liveness y extracción opcional de la INE. */
  verifyIdentity(
    documentImage: string,
    selfieImage: string,
    options: {
      checkLiveness?: boolean
      threshold?: number | null
      extractDocument?: boolean
      ocrEngine?: OcrEngine
      externalId?: string | null
    } = {},
  ): Promise<IdentityResult> {
    return this.post<IdentityResult>(
      '/face/verify',
      {
        document_image: documentImage,
        selfie_image: selfieImage,
        check_liveness: options.checkLiveness ?? true,
        threshold: options.threshold ?? null,
        extract_document: options.extractDocument ?? false,
        ocr_engine: options.ocrEngine ?? 'auto',
        external_id: options.externalId ?? null,
      },
      options.extractDocument ? TIMEOUT_MS.ocr : TIMEOUT_MS.face,
    )
  }

  /** Compara una firma de referencia contra una muestra adjunta o dibujada. */
  signatureCompare(
    reference: string,
    sample: string,
    options: { threshold?: number | null; sampleSource?: SignatureSampleSource | null; externalId?: string | null } = {},
  ): Promise<SignatureResult> {
    return this.post<SignatureResult>(
      '/signature/compare',
      {
        reference,
        sample,
        threshold: options.threshold ?? null,
        sample_source: options.sampleSource ?? null,
        external_id: options.externalId ?? null,
      },
      TIMEOUT_MS.signature,
    )
  }
}
