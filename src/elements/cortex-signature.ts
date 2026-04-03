import { BaseElement } from '../core/base-element'
import { FileDropzone } from '../ui/file-dropzone'
import { SignatureCanvas } from '../ui/signature-canvas'
import { SHARED_CSS } from '../styles/shared'

type SignatureMode = 'upload' | 'canvas' | 'both'

/**
 * <cortex-signature> — signature comparison.
 * Compares a reference signature against an uploaded or hand-drawn sample.
 *
 * Attributes:
 *   api-key   (required) Cortex API token
 *   api-url   Override backend URL (dev only)
 *   mode      "upload" | "canvas" | "both"  (default: "both")
 *   accept    MIME types for file upload  (default: "image/*,application/pdf")
 *
 * JS property:
 *   onResult  (data: SignatureResult) => void
 *
 * DOM events:
 *   cortex:result   detail: SignatureResult
 *   cortex:error    detail: { code: string; message: string }
 *   cortex:loading  detail: { loading: boolean }
 *
 * Usage:
 *   <cortex-signature api-key="ck_live_..." mode="both"></cortex-signature>
 *   document.querySelector('cortex-signature').onResult = (r) => console.log(r.authentic)
 */
export class CortexSignature extends BaseElement {
  private referenceFile: File | null = null
  private sampleBlob: File | Blob | null = null

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'mode', 'accept']
  }

  private get mode(): SignatureMode {
    const m = this.getAttribute('mode')
    return m === 'upload' || m === 'canvas' || m === 'both' ? m : 'both'
  }

  private get accept(): string {
    return this.getAttribute('accept') ?? 'image/*,application/pdf'
  }

  protected override render(): void {
    const root = this.shadowRoot!
    const mode = this.mode
    const showUpload = mode !== 'canvas'
    const showCanvas = mode !== 'upload'
    const showSeparator = mode === 'both'

    root.innerHTML = `
      <style>${SHARED_CSS}</style>
      <div class="cortex-element">
        <div data-error class="error-msg" hidden></div>
        <div data-loading class="loading-overlay" hidden>
          <div class="spinner"></div>
          <p>Comparando firmas...</p>
        </div>

        <div class="sig-panels">
          <div class="sig-panel">
            <p class="sig-panel__title">Firma de referencia</p>
            <div data-reference></div>
          </div>
          <div class="sig-panel">
            <p class="sig-panel__title">Muestra a comparar</p>
            <div data-sample></div>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="btn btn--primary" data-submit>
            Comparar firmas
          </button>
        </div>
      </div>
    `

    // Left panel — reference (always file upload)
    const refDropzone = new FileDropzone({
      accept: this.accept,
      onFile: (file) => {
        this.referenceFile = file
      },
      onError: (msg) => this.handleError({ code: 'FILE_VALIDATION', message: msg }),
    })
    root.querySelector('[data-reference]')!.appendChild(refDropzone.element)

    // Right panel — sample (upload and/or canvas)
    const sampleContainer = root.querySelector('[data-sample]')!

    if (showUpload) {
      const sampleDropzone = new FileDropzone({
        accept: this.accept,
        onFile: (file) => {
          this.sampleBlob = file
        },
        onError: (msg) => this.handleError({ code: 'FILE_VALIDATION', message: msg }),
      })
      sampleContainer.appendChild(sampleDropzone.element)
    }

    if (showSeparator) {
      const sep = document.createElement('div')
      sep.className = 'separator'
      const span = document.createElement('span')
      span.textContent = 'o dibuja la firma'
      sep.appendChild(span)
      sampleContainer.appendChild(sep)
    }

    if (showCanvas) {
      const sigCanvas = new SignatureCanvas({
        onExport: (blob) => {
          this.sampleBlob = blob
        },
      })
      sampleContainer.appendChild(sigCanvas.element)
    }

    root.querySelector('[data-submit]')?.addEventListener('click', () => void this.submit())
  }

  private async submit(): Promise<void> {
    if (!this.client) {
      this.handleError({ code: 'INVALID_API_KEY', message: 'Configura un api-key válido.' })
      return
    }
    if (!this.referenceFile) {
      this.handleError({ code: 'MISSING_REFERENCE', message: 'Por favor sube la firma de referencia.' })
      return
    }
    if (!this.sampleBlob) {
      this.handleError({
        code: 'MISSING_SAMPLE',
        message: 'Por favor sube o dibuja la firma de muestra.',
      })
      return
    }
    this.hideError()
    this.setLoading(true)
    try {
      const result = await this.client.signatureCompare(this.referenceFile, this.sampleBlob)
      this.callOnResult(result)
    } catch (err) {
      this.handleError(err)
    } finally {
      this.setLoading(false)
    }
  }
}
