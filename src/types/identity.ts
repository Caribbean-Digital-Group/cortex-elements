import type { OcrResult } from './ocr'

export interface IdentityResult {
  /** Id del registro en las verificaciones del dashboard (sin imágenes). */
  verification_id: string
  /** face_match y la prueba de vida no falló. */
  verified: boolean
  /** Decisión del API: el rostro coincide (similarity >= threshold). */
  face_match: boolean
  /** Confianza calibrada 0–1; > 0.5 indica misma persona. */
  similarity: number
  threshold: number
  /** Decisión configurable: similarity >= nivel de similitud definido en el dashboard. */
  similarity_approved: boolean
  min_similarity: number
  distance: number
  /** null cuando el servidor no tiene liveness habilitado. */
  liveness: boolean | null
  liveness_score: number | null
  face_detected: { document: boolean; selfie: boolean }
  model: string
  warnings: string[]
  processing_ms: number
  external_id: string | null
  /** Datos de la INE cuando se usa extract-document. */
  document?: OcrResult | null
}
