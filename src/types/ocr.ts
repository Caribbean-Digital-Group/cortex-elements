export type DocumentType = 'auto' | 'ine' | 'curp' | 'cfdi' | 'csf'

/** Motor de OCR: auto = Mistral con respaldo automático a GLM. */
export type OcrEngine = 'auto' | 'mistral' | 'glm'

export interface OcrResult {
  document_type: Exclude<DocumentType, 'auto'>
  document_label: string
  /** Datos tal como aparecen en el documento (normalizados). */
  fields: Record<string, unknown>
  /** Datos calculados: nombre completo, vigencia, URL de verificación SAT, etc. */
  derived: Record<string, unknown>
  /** Validaciones deterministas: true / false / null (no aplica o no se pudo evaluar). */
  validations: Record<string, boolean | null>
  warnings: string[]
  /** Fracción de campos clave encontrados (0–1). */
  completeness: number
  source: 'ocr' | 'xml'
  /** Motor que procesó el documento (null para XML). */
  engine: 'mistral' | 'glm' | null
  pages: number | null
  processing_ms: number
  raw_text?: string
}
