/**
 * Utilidades de imagen del lado del cliente.
 *
 * - Las fotos de celular (4–12 MB) se reducen a ≤2000 px y JPEG ~0.88 antes de subir:
 *   menos latencia y menos datos personales en tránsito, sin pérdida útil para OCR/biometría.
 * - Se respeta la orientación EXIF (fotos verticales de iPhone/Android).
 * - Las transparencias se componen sobre blanco (un PNG transparente en JPEG queda negro).
 * - PDFs y XML se envían intactos.
 */

export const MAX_IMAGE_SIDE = 2000
const JPEG_QUALITY = 0.88

/** Blob → base64 puro (sin prefijo data:). */
export function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = typeof result === 'string' ? result.split(',')[1] : undefined
      if (base64) resolve(base64)
      else reject(new Error('No se pudo leer el archivo.'))
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(blob)
  })
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      /* algunos formatos (TIFF) no se decodifican: se intenta con <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo abrir la imagen.'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))), type, quality)
  })
}

function drawOnWhite(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

function fit(width: number, height: number, maxSide: number): [number, number] {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return [Math.round(width * scale), Math.round(height * scale)]
}

/**
 * Prepara un archivo para subirlo: imágenes → JPEG optimizado; otros tipos → sin cambios.
 * Si la versión optimizada resulta más pesada que la original, se usa la original.
 */
export async function prepareUpload(blob: Blob, maxSide = MAX_IMAGE_SIDE): Promise<string> {
  if (!blob.type.startsWith('image/')) return readAsBase64(blob)
  try {
    const bitmap = await loadBitmap(blob)
    const [w, h] = fit(bitmap.width, bitmap.height, maxSide)
    const optimized = await canvasToBlob(drawOnWhite(bitmap, w, h), 'image/jpeg', JPEG_QUALITY)
    if ('close' in bitmap) bitmap.close()
    return readAsBase64(optimized.size < blob.size ? optimized : blob)
  } catch {
    return readAsBase64(blob)
  }
}

/**
 * Une varias imágenes verticalmente (p. ej. anverso + reverso de la INE) para
 * procesarlas en una sola llamada de OCR.
 */
export async function stitchVertical(blobs: Blob[], maxSide = MAX_IMAGE_SIDE): Promise<string> {
  const bitmaps = await Promise.all(blobs.map(loadBitmap))
  const width = Math.max(...bitmaps.map((b) => b.width))
  const gap = 24
  const scaled = bitmaps.map((b) => [width, Math.round((b.height * width) / b.width)] as const)
  const height = scaled.reduce((sum, [, h]) => sum + h, 0) + gap * (bitmaps.length - 1)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  let y = 0
  bitmaps.forEach((bitmap, i) => {
    const [w, h] = scaled[i]!
    ctx.drawImage(bitmap, 0, y, w, h)
    y += h + gap
    if ('close' in bitmap) bitmap.close()
  })

  const [outW, outH] = fit(width, height, maxSide * 1.5)
  const output = outW === width ? canvas : drawOnWhite(canvas, outW, outH)
  return readAsBase64(await canvasToBlob(output, 'image/jpeg', JPEG_QUALITY))
}

/** Convierte base64 puro a Blob (para previsualizar capturas de cámara). */
export function base64ToBlob(base64: string, type = 'image/jpeg'): Blob {
  const bytes = atob(base64)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i)
  return new Blob([buffer], { type })
}
