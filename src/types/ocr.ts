export interface OcrResult {
  document_type: string
  name?: string
  curp?: string
  folio?: string
  validity?: string
  address?: string
  [key: string]: unknown
}

export type OcrDocumentType = 'INE' | 'PASSPORT' | 'CURP' | 'RFC' | 'UNKNOWN'
