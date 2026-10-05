/** Cómo se capturó la firma a verificar. */
export type SignatureSampleSource = 'upload' | 'canvas'

export interface SignatureResult {
  /** Id del registro en los comparables del dashboard (sin imágenes). */
  comparison_id: string
  /** Decisión del API: similarity >= threshold. */
  authentic: boolean
  confidence: number
  similarity: number
  threshold: number
  /** Decisión configurable: similarity >= nivel de similitud definido en el dashboard. */
  similarity_approved: boolean
  min_similarity: number
  scores: { hog: number; chamfer: number; ssim: number; projection: number; aspect: number }
  rotation_applied: number
  warnings: string[]
  processing_ms: number
  sample_source: SignatureSampleSource | null
  external_id: string | null
}
