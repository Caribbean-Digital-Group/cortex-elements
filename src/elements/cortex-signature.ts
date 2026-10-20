import { BaseElement } from '../core/base-element'
import { prepareUpload } from '../core/image'
import { FileDropzone } from '../ui/file-dropzone'
import { SignatureCanvas } from '../ui/signature-canvas'
import { createResultPanel, type ResultStatus } from '../ui/result-panel'
import { WARNING_LABELS } from '../ui/labels'
import type { SignatureResult, SignatureSampleSource } from '../types/signature'

type SignatureMode = 'upload' | 'canvas' | 'both'

const SIGNATURE_ACCEPT = 'image/*'
const SIGNATURE_HINT = 'JPG o PNG de la firma sobre fondo claro'
const REFERENCE_LABEL = 'Adjuntar archivo con firma digital'
const SAMPLE_LABEL = 'Adjuntar archivo con la firma a verificar'
// El backend normaliza la firma a 1000 px: subir más resolución solo agrega latencia
const SIGNATURE_MAX_SIDE = 1200
const EXTERNAL_ID_MAX = 100

/**
 * <cortex-signature> — comparación de firmas.
 * Compara una firma de referencia (archivo adjunto) contra otra adjunta o dibujada en pantalla.
 *
 * Attributes:
 *   api-key      (required) Cortex API token
 *   api-url      Override backend URL (dev only)
 *   mode         Tipo de comparación (default: "both"):
 *                  "upload" → referencia vs adjunto
 *                  "canvas" → referencia vs dibujo en canvas
 *                  "both"   → el usuario elige adjuntar o dibujar
 *   threshold    0–1  Similitud mínima para `authentic` (default del servidor: 0.80)
 *   external-id  Referencia propia (contrato, folio) que se guarda con la comparación
 *   theme, show-result
 *
 * El nivel de similitud de `similarity_approved` se configura en el dashboard (Comparables).
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
 *   document.querySelector('cortex-signature').onResult = (r) => console.log(r.authentic, r.similarity_approved)
 */
export class CortexSignature extends BaseElement {
  private reference: Blob | null = null
  private sampleFile: Blob | null = null
  private sampleDrawing: Blob | null = null
  /** Última fuente que el usuario usó (en modo "both" gana la más reciente). */
  private sampleSource: SignatureSampleSource | null = null
  private dropzones: FileDropzone[] = []

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'mode', 'threshold', 'external-id']
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

  private get externalId(): string | null {
    const value = this.getAttribute('external-id')?.trim()
    return value ? value.slice(0, EXTERNAL_ID_MAX) : null
  }

  /** Muestra a enviar y cómo se capturó: la fuente usada más recientemente, o la que esté disponible. */
  private currentSample(): { blob: Blob; source: SignatureSampleSource } | null {
    if (this.sampleSource === 'canvas' && this.sampleDrawing) return { blob: this.sampleDrawing, source: 'canvas' }
    if (this.sampleFile) return { blob: this.sampleFile, source: 'upload' }
    return this.sampleDrawing ? { blob: this.sampleDrawing, source: 'canvas' } : null
  }

  protected override render(body: HTMLElement): void {
    this.reference = null
    this.sampleFile = null
    this.sampleDrawing = null
    this.sampleSource = null
    const onError = (msg: string) => this.handleError({ code: 'FILE_VALIDATION', message: msg })

    const panels = document.createElement('div')
    panels.className = 'sig-panels'

    const refPanel = this.panel('Firma de referencia')
    const refDropzone = new FileDropzone({
      accept: SIGNATURE_ACCEPT,
      label: REFERENCE_LABEL,
      hint: SIGNATURE_HINT,
      onFile: (file) => {
        this.reference = file
        this.updateSubmit()
      },
      onError,
    })
    refPanel.append(refDropzone.element)
    this.dropzones = [refDropzone]

    const mode = this.sampleMode
    const samplePanel = this.panel(mode === 'canvas' ? 'Dibuja la firma a verificar' : 'Firma a verificar')

    if (mode !== 'canvas') {
      const sampleDropzone = new FileDropzone({
        accept: SIGNATURE_ACCEPT,
        label: SAMPLE_LABEL,
        hint: SIGNATURE_HINT,
        onFile: (file) => {
          this.sampleFile = file
          this.sampleSource = 'upload'
          this.updateSubmit()
        },
        onError,
      })
      this.dropzones.push(sampleDropzone)
      samplePanel.append(sampleDropzone.element)
    }

    if (mode === 'both') {
      const sep = document.createElement('div')
      sep.className = 'separator'
      const span = document.createElement('span')
      span.textContent = 'o dibuja la firma'
      sep.append(span)
      samplePanel.append(sep)
    }

    if (mode !== 'upload') {
      const canvas = new SignatureCanvas({
        onChange: (blob) => {
          this.sampleDrawing = blob
          if (blob) this.sampleSource = 'canvas'
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
    if (submit) submit.disabled = !(this.reference && this.currentSample())
  }

  private async submit(): Promise<void> {
    const client = this.requireClient()
    if (!client || this.loading) return
    const sample = this.currentSample()
    if (!this.reference || !sample) {
      this.handleError({ code: 'MISSING_CAPTURE', message: 'Agrega la firma de referencia y la firma a verificar.' })
      return
    }

    this.hideError()
    this.setLoading(true, 'Comparando firmas...')
    try {
      const [ref, smp] = await Promise.all([
        prepareUpload(this.reference, SIGNATURE_MAX_SIDE),
        prepareUpload(sample.blob, SIGNATURE_MAX_SIDE),
      ])
      const result = await client.signatureCompare(ref, smp, {
        threshold: this.minSimilarity,
        sampleSource: sample.source,
        externalId: this.externalId,
      })
      this.callOnResult(result)
      this.showResultPanel(this.buildPanel(result))
    } catch (err) {
      this.handleError(err)
    } finally {
      this.setLoading(false)
    }
  }

  private buildPanel(result: SignatureResult): HTMLElement {
    const pct = (v: number) => `${Math.round(v * 100)}%`
    const both = result.authentic && result.similarity_approved
    const none = !result.authentic && !result.similarity_approved
    const status: ResultStatus = both ? 'success' : none ? 'error' : 'warning'
    const title = both ? 'Las firmas coinciden' : none ? 'Las firmas no coinciden' : 'Coincidencia parcial'

    return createResultPanel({
      status,
      title,
      subtitle: result.sample_source === 'canvas' ? 'Referencia vs firma dibujada' : 'Referencia vs firma adjunta',
      metric: { label: 'Similitud', value: result.similarity },
      checks: [
        { label: `Validación del API (≥ ${pct(result.threshold)})`, ok: result.authentic },
        { label: `Nivel de similitud configurado (≥ ${pct(result.min_similarity)})`, ok: result.similarity_approved },
        { label: 'Proporciones', ok: result.scores.aspect >= 0.75 },
      ],
      warnings: result.warnings.map((w) => WARNING_LABELS[w] ?? w),
      resetLabel: 'Comparar otra firma',
      onReset: () => this.reset(),
    })
  }

  protected override cleanup(): void {
    this.dropzones.forEach((d) => d.destroy())
  }
}
