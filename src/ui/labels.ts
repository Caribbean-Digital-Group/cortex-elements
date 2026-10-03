/** Textos legibles para códigos y campos que devuelve la API. */

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  auto: 'Detectar automáticamente',
  ine: 'INE',
  curp: 'CURP',
  cfdi: 'Factura CFDI',
  csf: 'Constancia de Situación Fiscal',
}

export const WARNING_LABELS: Record<string, string> = {
  DOCUMENTO_VENCIDO: 'El documento está vencido',
  CURP_DIGITO_VERIFICADOR_INVALIDO: 'La CURP no pasa el dígito verificador',
  TIPO_DOCUMENTO_NO_COINCIDE: 'El documento no parece ser del tipo solicitado',
  CONTRIBUYENTE_NO_ACTIVO: 'El contribuyente no está activo en el padrón',
  CONSTANCIA_CON_MAS_DE_90_DIAS: 'La constancia tiene más de 90 días',
  TOTALES_NO_CUADRAN: 'Los importes de la factura no cuadran',
  MULTIPLES_ROSTROS_EN_SELFIE: 'Se detectó más de un rostro en la selfie',
  LIVENESS_NO_DISPONIBLE: 'Prueba de vida no disponible',
  POSIBLE_SUPLANTACION: 'Posible suplantación (foto de foto o pantalla)',
}

export const VALIDATION_LABELS: Record<string, string> = {
  curp_formato: 'Formato de CURP',
  curp_digito_verificador: 'Dígito verificador CURP',
  clave_elector_formato: 'Clave de elector',
  vigente: 'Vigencia',
  fecha_nacimiento_coincide_curp: 'Fecha de nacimiento vs CURP',
  sexo_coincide_curp: 'Sexo vs CURP',
  rfc_formato: 'Formato de RFC',
  estatus_activo: 'Estatus en el padrón',
  codigo_postal_formato: 'Código postal',
  emision_reciente: 'Emisión reciente (< 90 días)',
  uuid_formato: 'Folio fiscal (UUID)',
  rfc_emisor_formato: 'RFC emisor',
  rfc_receptor_formato: 'RFC receptor',
  totales_consistentes: 'Totales consistentes',
}

/** Campos principales a mostrar por tipo de documento (el JSON completo llega en el evento). */
export const SUMMARY_FIELDS: Record<string, Array<[string, string]>> = {
  ine: [
    ['derived.nombre_completo', 'Nombre'],
    ['fields.curp', 'CURP'],
    ['fields.clave_elector', 'Clave de elector'],
    ['fields.fecha_nacimiento', 'Fecha de nacimiento'],
    ['fields.domicilio', 'Domicilio'],
    ['fields.vigencia', 'Vigencia'],
  ],
  curp: [
    ['derived.nombre_completo', 'Nombre'],
    ['fields.curp', 'CURP'],
    ['fields.fecha_nacimiento', 'Fecha de nacimiento'],
    ['fields.entidad_nacimiento', 'Entidad de nacimiento'],
    ['fields.sexo', 'Sexo'],
  ],
  csf: [
    ['derived.nombre_o_razon_social', 'Contribuyente'],
    ['fields.rfc', 'RFC'],
    ['derived.regimen_principal', 'Régimen'],
    ['fields.estatus_padron', 'Estatus'],
    ['fields.domicilio_fiscal.codigo_postal', 'C.P. fiscal'],
    ['fields.fecha_emision', 'Fecha de emisión'],
  ],
  cfdi: [
    ['fields.uuid', 'Folio fiscal'],
    ['fields.emisor.nombre', 'Emisor'],
    ['fields.emisor.rfc', 'RFC emisor'],
    ['fields.receptor.rfc', 'RFC receptor'],
    ['fields.fecha', 'Fecha'],
    ['fields.total', 'Total'],
  ],
}

/** Lee una ruta tipo "fields.emisor.rfc" de un objeto. */
export function pick(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    obj,
  )
}

export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value.toLocaleString('es-MX', { maximumFractionDigits: 2 })
  if (typeof value === 'object') return null
  return String(value)
}
