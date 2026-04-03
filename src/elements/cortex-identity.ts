import { BaseElement } from '../core/base-element'
import { FileDropzone } from '../ui/file-dropzone'
import { CameraCapture } from '../ui/camera-capture'
import { SHARED_CSS } from '../styles/shared'

/**
 * Reads a File and returns its content as a pure base64 string (no data: URI prefix).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Error al leer el archivo'))
        return
      }
      const base64 = result.split(',')[1]
      if (base64) resolve(base64)
      else reject(new Error('Formato de archivo no reconocido'))
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsDataURL(file)
  })
}

/**
 * <cortex-identity> — biometric identity verification.
 * Compares a photo ID against a live selfie.
 *
 * Attributes:
 *   api-key    (required) Cortex API token
 *   api-url    Override backend URL (dev only)
 *   liveness   "true" | "false"  Enable anti-spoofing  (default: "true")
 *   threshold  Number 0–1        Minimum similarity score  (default: "0.75")
 *
 * JS property:
 *   onResult   (data: IdentityResult) => void
 *
 * DOM events:
 *   cortex:result   detail: IdentityResult
 *   cortex:error    detail: { code: string; message: string }
 *   cortex:loading  detail: { loading: boolean }
 *
 * Usage:
 *   <cortex-identity api-key="ck_live_..." threshold="0.8"></cortex-identity>
 *   document.querySelector('cortex-identity').onResult = (r) => console.log(r.verified)
 */
export class CortexIdentity extends BaseElement {
  private idBase64: string | null = null
  private selfieBase64: string | null = null
  private camera: CameraCapture | null = null

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'liveness', 'threshold']
  }

  private get threshold(): number {
    const raw = parseFloat(this.getAttribute('threshold') ?? '0.75')
    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.75
  }

  protected override render(): void {
    const root = this.shadowRoot!

    root.innerHTML = `
      <style>${SHARED_CSS}</style>
      <div class="cortex-element">
        <div data-error class="error-msg" hidden></div>
        <div data-loading class="loading-overlay" hidden>
          <div class="spinner"></div>
          <p>Verificando identidad...</p>
        </div>
        <div class="steps">

          <div class="step" data-step="1">
            <div class="step__header">
              <div class="step__number" aria-hidden="true">1</div>
              <span class="step__title">Fotografía o sube tu identificación oficial</span>
            </div>
            <div data-id-zone></div>
          </div>

          <div class="step" data-step="2" hidden>
            <div class="step__header">
              <div class="step__number" aria-hidden="true">2</div>
              <span class="step__title">Tómate una selfie</span>
            </div>
            <div data-selfie-zone></div>
          </div>

          <div class="actions" data-submit-section hidden>
            <button type="button" class="btn btn--primary" data-submit>
              Verificar identidad
            </button>
          </div>

        </div>
      </div>
    `

    // Step 1 — ID upload
    const idDropzone = new FileDropzone({
      accept: 'image/*',
      onFile: (file) => void this.handleIdFile(file),
      onError: (msg) => this.handleError({ code: 'FILE_VALIDATION', message: msg }),
    })
    root.querySelector('[data-id-zone]')!.appendChild(idDropzone.element)

    // Step 2 — selfie via camera
    this.camera = new CameraCapture({
      onCapture: (base64) => this.handleSelfie(base64),
      onError: (msg) => this.handleError({ code: 'CAMERA_ERROR', message: msg }),
    })
    root.querySelector('[data-selfie-zone]')!.appendChild(this.camera.element)

    root.querySelector('[data-submit]')?.addEventListener('click', () => void this.submit())
  }

  private async handleIdFile(file: File): Promise<void> {
    try {
      this.idBase64 = await fileToBase64(file)
      // Reveal step 2
      const step2 = this.shadowRoot?.querySelector<HTMLElement>('[data-step="2"]')
      if (step2) step2.hidden = false
      step2?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch (err) {
      this.handleError(err)
    }
  }

  private handleSelfie(base64: string): void {
    this.selfieBase64 = base64
    // Reveal submit button
    const submitSection = this.shadowRoot?.querySelector<HTMLElement>('[data-submit-section]')
    if (submitSection) submitSection.hidden = false
  }

  private async submit(): Promise<void> {
    if (!this.client) {
      this.handleError({ code: 'INVALID_API_KEY', message: 'Configura un api-key válido.' })
      return
    }
    if (!this.idBase64) {
      this.handleError({ code: 'MISSING_ID', message: 'Por favor sube o fotografía tu identificación (Paso 1).' })
      return
    }
    if (!this.selfieBase64) {
      this.handleError({ code: 'MISSING_SELFIE', message: 'Por favor tómate una selfie (Paso 2).' })
      return
    }
    this.hideError()
    this.setLoading(true)
    try {
      const raw = await this.client.faceCompareBase64(this.idBase64, this.selfieBase64)
      // Apply threshold on the client side for consistent UX
      const result = { ...raw, verified: raw.similarity >= this.threshold && raw.face_detected }
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
