import { BaseElement } from '../core/base-element'
import { FileDropzone } from '../ui/file-dropzone'
import { CameraCapture } from '../ui/camera-capture'
import { SHARED_CSS } from '../styles/shared'

type OcrMode = 'upload' | 'camera' | 'both'

/**
 * <cortex-ocr> — document capture & OCR extraction.
 *
 * Attributes:
 *   api-key   (required) Cortex API token
 *   api-url   Override backend URL (dev only — must be HTTPS or localhost)
 *   mode      "upload" | "camera" | "both"  (default: "both")
 *   accept    MIME type filter for file upload  (default: "image/*,application/pdf")
 *   lang      Output language for extracted fields  (default: "es")
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
 *   <cortex-ocr api-key="ck_live_..." mode="both"></cortex-ocr>
 *   document.querySelector('cortex-ocr').onResult = (r) => console.log(r)
 */
export class CortexOcr extends BaseElement {
  private camera: CameraCapture | null = null

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'mode', 'accept', 'lang']
  }

  private get mode(): OcrMode {
    const m = this.getAttribute('mode')
    return m === 'upload' || m === 'camera' || m === 'both' ? m : 'both'
  }

  private get accept(): string {
    return this.getAttribute('accept') ?? 'image/*,application/pdf'
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
        onCapture: (base64) => void this.handleBase64(base64),
        onError: (msg) => this.handleError({ code: 'CAMERA_ERROR', message: msg }),
      })
      root.querySelector('[data-camera]')!.appendChild(this.camera.element)
    }
  }

  private async handleFile(file: File): Promise<void> {
    if (!this.client) {
      this.handleError({ code: 'INVALID_API_KEY', message: 'Configura un api-key válido.' })
      return
    }
    this.hideError()
    this.setLoading(true)
    try {
      const result = await this.client.ocrDocument(file)
      this.callOnResult(result)
    } catch (err) {
      this.handleError(err)
    } finally {
      this.setLoading(false)
    }
  }

  private async handleBase64(base64: string): Promise<void> {
    if (!this.client) {
      this.handleError({ code: 'INVALID_API_KEY', message: 'Configura un api-key válido.' })
      return
    }
    this.hideError()
    this.setLoading(true)
    try {
      const result = await this.client.ocrDocumentBase64(base64)
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
