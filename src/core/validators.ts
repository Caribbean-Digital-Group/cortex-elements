/**
 * Validators — pure functions, no side effects.
 * Used server-side data never passes through these to innerHTML;
 * that's handled by textContent assignment in the elements.
 */

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'application/pdf',
])

const ACCEPT_MIME_MAP = new Map<string, string[]>([
  ['image/*', ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff']],
  ['application/pdf', ['application/pdf']],
  ['image/jpeg', ['image/jpeg']],
  ['image/png', ['image/png']],
  ['image/webp', ['image/webp']],
  ['image/bmp', ['image/bmp']],
  ['image/tiff', ['image/tiff']],
  ['image/gif', ['image/gif']],
])

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * API keys must be 16–256 characters of alphanumerics, hyphens, or underscores.
 * This is a client-side sanity check — the server is the authoritative validator.
 */
export function validateApiKey(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false
  return /^[A-Za-z0-9_\-]{16,256}$/.test(value)
}

/**
 * API URLs must use HTTPS in production.
 * HTTP is permitted only for localhost/127.0.0.1 (local dev).
 */
export function validateApiUrl(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    if (url.protocol === 'http:') {
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    }
    return false
  } catch {
    return false
  }
}

/**
 * Validates a File against MIME type allowlist and size limit.
 * Returns an error message string, or null if valid.
 *
 * Note: MIME type reported by the browser is a hint, not a guarantee.
 * The server must also validate the actual file content.
 */
export function validateFile(
  file: File,
  allowedMimes: Set<string> = ALLOWED_IMAGE_MIMES,
  maxBytes = MAX_FILE_SIZE_BYTES,
): string | null {
  if (file.size === 0) return 'El archivo está vacío.'
  if (file.size > maxBytes) {
    return `El archivo es demasiado grande. Máximo ${Math.round(maxBytes / 1024 / 1024)} MB.`
  }
  if (!allowedMimes.has(file.type)) {
    return `El tipo de archivo "${file.type}" no es compatible.`
  }
  return null
}

/**
 * Expands an accept string (e.g. "image/*,application/pdf") into a Set of MIME types
 * using a static allowlist — never evaluates arbitrary MIME strings.
 */
export function expandAccept(accept: string): Set<string> {
  const result = new Set<string>()
  for (const token of accept.split(',').map((s) => s.trim())) {
    for (const mime of ACCEPT_MIME_MAP.get(token) ?? []) {
      result.add(mime)
    }
  }
  // Fallback: if nothing matched, return the default image set
  return result.size > 0 ? result : new Set(ALLOWED_IMAGE_MIMES)
}
