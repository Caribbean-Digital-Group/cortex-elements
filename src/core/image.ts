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

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Región del rostro en una captura de la cámara frontal (coordenadas del frame).
 *
 * - `tight = false` (con prueba de vida): el área que el usuario vio en pantalla (object-fit: cover a 4:3).
 *   FasNet evalúa el rostro con 2.7× y 4× de contexto (bordes de pantalla, papel): recortar al óvalo
 *   degradaría la detección de suplantaciones.
 * - `tight = true` (sin prueba de vida): solo el óvalo guía con un margen para el detector.
 */
export function faceRegion(
  frameW: number,
  frameH: number,
  guide: { stageAspect: number; height: number; aspect: number },
  tight: boolean,
  margin = 1.4,
): Region {
  const visW = frameW / frameH > guide.stageAspect ? frameH * guide.stageAspect : frameW
  const visH = visW / guide.stageAspect
  let w = visW
  let h = visH
  if (tight) {
    h = Math.min(visH, guide.height * visH * margin)
    w = Math.min(visW, guide.height * visH * guide.aspect * margin)
  }
  return { x: Math.round((frameW - w) / 2), y: Math.round((frameH - h) / 2), w: Math.round(w), h: Math.round(h) }
}

/** Recorta una región de la imagen y la reduce a `maxSide` (JPEG, base64 puro). */
export async function cropToBase64(
  blob: Blob,
  region: (w: number, h: number) => Region,
  maxSide: number,
): Promise<string> {
  const bitmap = await loadBitmap(blob)
  const r = region(bitmap.width, bitmap.height)
  const [w, h] = fit(r.w, r.h, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible.')
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, w, h)
  if ('close' in bitmap) bitmap.close()
  return readAsBase64(await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY))
}

/** Convierte base64 puro a Blob (para previsualizar capturas de cámara). */
export function base64ToBlob(base64: string, type = 'image/jpeg'): Blob {
  const bytes = atob(base64)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i)
  return new Blob([buffer], { type })
}
