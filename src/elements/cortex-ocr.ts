import { BaseElement } from '../core/base-element'
import { FileDropzone } from '../ui/file-dropzone'
import { CameraCapture } from '../ui/camera-capture'
import { SHARED_CSS } from '../styles/shared'
import { DEFAULT_OCR_MODEL } from '../core/api-client'

type OcrMode = 'upload' | 'camera' | 'both'

/**
 * Converts a File to a pure base64 string (no data: URI prefix).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') { reject(new Error('Error al leer el archivo')); return }
      const base64 = result.split(',')[1]
      if (base64) resolve(base64)
      else reject(new Error('Formato de archivo no reconocido'))
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsDataURL(file)
  })
}

/** PDFs are treated as documents; everything else as images. */
function mimeToContentType(mime: string): 'image' | 'document' {
  return mime === 'application/pdf' ? 'document' : 'image'
}

/**
 * Sanitizes the model name to prevent URL path injection.
 * Only alphanumerics, hyphens, and underscores are allowed.
 */
function sanitizeModel(raw: string): string {
  return /^[A-Za-z0-9_\-]+$/.test(raw) ? raw : DEFAULT_OCR_MODEL
}

/**
 * <cortex-ocr> — document capture & OCR extraction.
 *
 * Attributes:
 *   api-key   (required) Cortex API token
 *   api-url   Override backend URL (dev only — must be HTTPS or localhost)
 *   mode      "upload" | "camera" | "both"  (default: "both")
 *   accept    MIME type filter for file upload  (default: "image/*,application/pdf")
 *   lang      Output language for extracted fields  (default: "es")
 *   model     OCR model to use  (default: "mistral-ocr-latest")
 *             Examples: "mistral-ocr-latest", "glm-ocr"
 *
 * Endpoint routing (by file type and model):
 *   image  + mistral-ocr-latest → POST /ocr/image/base64      { image_base64 }
 *   pdf    + mistral-ocr-latest → POST /ocr/document/base64   { document_base64 }
 *   image  + glm-ocr            → POST /glm-ocr/image/base64  { image_base64 }
 *   pdf    + glm-ocr            → POST /glm-ocr/document/base64 { document_base64 }
 *
 * JS property:
 *   onResult  (data: OcrResult) => void
 *
 * DOM events:
 *   cortex:result   detail: OcrResult
 *   cortex:error    detail: { code: string; message: string }
 *   cortex:loading  detail: { loading: boolean }
 *
 * Usage:
 *   <cortex-ocr api-key="ck_live_..." mode="both" model="glm-ocr"></cortex-ocr>
 *   document.querySelector('cortex-ocr').onResult = (r) => console.log(r)
 */
export class CortexOcr extends BaseElement {
  private camera: CameraCapture | null = null

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'mode', 'accept', 'lang', 'model']
  }

  private get mode(): OcrMode {
    const m = this.getAttribute('mode')
    return m === 'upload' || m === 'camera' || m === 'both' ? m : 'both'
  }

  private get accept(): string {
    return this.getAttribute('accept') ?? 'image/*,application/pdf'
  }

  private get model(): string {
    return sanitizeModel(this.getAttribute('model') ?? DEFAULT_OCR_MODEL)
  }

  protected override render(): void {
    const root = this.shadowRoot!
    const mode = this.mode
    const showUpload = mode !== 'camera'
    const showCamera = mode !== 'upload'
    const showSeparator = mode === 'both'

    root.innerHTML = `
      <style>${SHARED_CSS}</style>
      <div class="cortex-element">
        <div data-error class="error-msg" hidden></div>
        <div data-loading class="loading-overlay" hidden>
          <div class="spinner"></div>
          <p>Extrayendo datos del documento...</p>
        </div>
        <div class="content">
          ${showUpload ? '<div data-dropzone></div>' : ''}
          ${showSeparator ? '<div class="separator"><span>o usa la cámara</span></div>' : ''}
          ${showCamera ? '<div data-camera></div>' : ''}
        </div>
      </div>
    `

    if (showUpload) {
      const dropzone = new FileDropzone({
        accept: this.accept,
        onFile: (file) => void this.handleFile(file),
        onError: (msg) => this.handleError({ code: 'FILE_VALIDATION', message: msg }),
      })
      root.querySelector('[data-dropzone]')!.appendChild(dropzone.element)
    }

    if (showCamera) {
      this.camera = new CameraCapture({
        // Camera always captures images (JPEG), never PDFs
        onCapture: (base64) => void this.sendBase64(base64, 'image'),
        onError: (msg) => this.handleError({ code: 'CAMERA_ERROR', message: msg }),
      })
      root.querySelector('[data-camera]')!.appendChild(this.camera.element)
    }
  }

  private async handleFile(file: File): Promise<void> {
    let base64: string
    try {
      base64 = await fileToBase64(file)
    } catch (err) {
      this.handleError(err)
      return
    }
    const contentType = mimeToContentType(file.type)
    await this.sendBase64(base64, contentType)
  }

  private async sendBase64(base64: string, contentType: 'image' | 'document'): Promise<void> {
    if (!this.client) {
      this.handleError({ code: 'INVALID_API_KEY', message: 'Configura un api-key válido.' })
      return
    }
    this.hideError()
    this.setLoading(true)
    try {
      const result = await this.client.ocrBase64(base64, contentType, this.model)
      this.callOnResult(result)
    } catch (err) {
      this.handleError(err)
    } finally {
      this.setLoading(false)
    }
  }

  protected override cleanup(): void {
    this.camera?.stop()
  }
}
