import type { OcrResult } from './ocr'

export interface IdentityResult {
  verified: boolean
  face_match: boolean
  /** Confianza calibrada 0–1; > 0.5 indica misma persona. */
  similarity: number
  threshold: number
  distance: number
  /** null cuando el servidor no tiene liveness habilitado. */
  liveness: boolean | null
  liveness_score: number | null
  face_detected: { document: boolean; selfie: boolean }
  model: string
  warnings: string[]
  /** Datos de la INE cuando se usa extract-document. */
  document?: OcrResult | null
}
