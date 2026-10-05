import { BaseElement } from '../core/base-element'
import { prepareUpload } from '../core/image'
import { FileDropzone } from '../ui/file-dropzone'
import { SignatureCanvas } from '../ui/signature-canvas'
import { createResultPanel } from '../ui/result-panel'
import type { SignatureResult } from '../types/signature'

type SignatureMode = 'upload' | 'canvas' | 'both'

const SIGNATURE_ACCEPT = 'image/*'
const SIGNATURE_HINT = 'JPG o PNG de la firma sobre fondo claro'

/**
 * <cortex-signature> — comparación de firmas.
 * Compara una firma de referencia contra una muestra subida o dibujada.
 *
 * Attributes:
 *   api-key    (required) Cortex API token
 *   api-url    Override backend URL (dev only)
 *   mode       "upload" | "canvas" | "both" — cómo se captura la muestra  (default: "both")
 *   threshold  0–1  Similitud mínima para considerarla auténtica  (default del servidor: 0.80)
 *   theme, show-result
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
 *   <cortex-signature api-key="ck_live_..." mode="canvas"></cortex-signature>
 *   document.querySelector('cortex-signature').onResult = (r) => console.log(r.authentic)
 */
export class CortexSignature extends BaseElement {
  private reference: Blob | null = null
  private sample: Blob | null = null
  private dropzones: FileDropzone[] = []

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'mode', 'threshold']
  }

  private get sampleMode(): SignatureMode {
    const m = this.getAttribute('mode')
    return m === 'upload' || m === 'canvas' || m === 'both' ? m : 'both'
  }

  private get minSimilarity(): number | null {
    const raw = this.getAttribute('threshold')
    const value = raw === null ? NaN : parseFloat(raw)
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null
  }

  protected override render(body: HTMLElement): void {
    this.reference = null
    this.sample = null
    const onError = (msg: string) => this.handleError({ code: 'FILE_VALIDATION', message: msg })

    const panels = document.createElement('div')
    panels.className = 'sig-panels'

    const refPanel = this.panel('Firma de referencia')
    const refDropzone = new FileDropzone({
      accept: SIGNATURE_ACCEPT,
      hint: SIGNATURE_HINT,
      onFile: (file) => {
        this.reference = file
        this.updateSubmit()
      },
      onError,
    })
    refPanel.append(refDropzone.element)

    const samplePanel = this.panel('Firma a verificar')
    this.dropzones = [refDropzone]

    if (this.sampleMode !== 'canvas') {
      const sampleDropzone = new FileDropzone({
        accept: SIGNATURE_ACCEPT,
        hint: SIGNATURE_HINT,
        onFile: (file) => {
          this.sample = file
          this.updateSubmit()
        },
        onError,
      })
      this.dropzones.push(sampleDropzone)
      samplePanel.append(sampleDropzone.element)
    }

    if (this.sampleMode === 'both') {
      const sep = document.createElement('div')
      sep.className = 'separator'
      const span = document.createElement('span')
      span.textContent = 'o dibuja la firma'
      sep.append(span)
      samplePanel.append(sep)
    }

    if (this.sampleMode !== 'upload') {
      const canvas = new SignatureCanvas({
        onChange: (blob) => {
          this.sample = blob
          this.updateSubmit()
        },
      })
      samplePanel.append(canvas.element)
    }

    panels.append(refPanel, samplePanel)

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'button'
    submit.className = 'btn btn--primary'
    submit.dataset.submit = ''
    submit.textContent = 'Comparar firmas'
    submit.disabled = true
    submit.addEventListener('click', () => void this.submit())
    actions.append(submit)

    body.append(panels, actions)
  }

  private panel(title: string): HTMLElement {
    const panel = document.createElement('div')
    panel.className = 'sig-panel'
    const heading = document.createElement('p')
    heading.className = 'sig-panel__title'
    heading.textContent = title
    panel.append(heading)
    return panel
  }

  private updateSubmit(): void {
    this.hideError()
    const submit = this.shadowRoot?.querySelector<HTMLButtonElement>('[data-submit]')
    if (submit) submit.disabled = !(this.reference && this.sample)
  }

  private async submit(): Promise<void> {
    const client = this.requireClient()
    if (!client || this.loading) return
    if (!this.reference || !this.sample) {
      this.handleError({ code: 'MISSING_CAPTURE', message: 'Agrega la firma de referencia y la firma a verificar.' })
      return
    }

    this.hideError()
    this.setLoading(true, 'Comparando firmas...')
    try {
      const [ref, sample] = await Promise.all([prepareUpload(this.reference), prepareUpload(this.sample)])
      const result = await client.signatureCompare(ref, sample, this.minSimilarity)
      this.callOnResult(result)
      this.showResultPanel(this.buildPanel(result))
    } catch (err) {
      this.handleError(err)
    } finally {
      this.setLoading(false)
    }
  }

  private buildPanel(result: SignatureResult): HTMLElement {
    return createResultPanel({
      status: result.authentic ? 'success' : 'error',
      title: result.authentic ? 'Las firmas coinciden' : 'Las firmas no coinciden',
      subtitle: `Umbral de aceptación: ${Math.round(result.threshold * 100)}%`,
      metric: { label: 'Similitud', value: result.similarity },
      checks: [
        { label: 'Forma de los trazos', ok: result.scores.hog >= result.threshold },
        { label: 'Estructura general', ok: result.scores.ssim >= 0.6 },
        { label: 'Proporciones', ok: result.scores.aspect >= 0.75 },
      ],
      resetLabel: 'Comparar otra firma',
      onReset: () => this.reset(),
    })
  }

  protected override cleanup(): void {
    this.dropzones.forEach((d) => d.destroy())
  }
}
