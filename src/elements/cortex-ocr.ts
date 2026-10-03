import { BaseElement } from '../core/base-element'
import { prepareUpload, stitchVertical } from '../core/image'
import { CaptureSlot, type CaptureMode } from '../ui/capture-slot'
import { createResultPanel } from '../ui/result-panel'
import {
  DOCUMENT_TYPE_LABELS,
  SUMMARY_FIELDS,
  VALIDATION_LABELS,
  WARNING_LABELS,
  formatValue,
  pick,
} from '../ui/labels'
import type { DocumentType, OcrEngine, OcrResult } from '../types/ocr'

const DOCUMENT_TYPES: DocumentType[] = ['auto', 'ine', 'curp', 'cfdi', 'csf']
const ENGINES: OcrEngine[] = ['auto', 'mistral', 'glm']

/**
 * <cortex-ocr> — captura de documentos mexicanos y extracción de datos estructurados.
 *
 * Attributes:
 *   api-key        (required) Cortex API token
 *   api-url        Override backend URL (dev only — must be HTTPS or localhost)
 *   document-type  "auto" | "ine" | "curp" | "cfdi" | "csf"  (default: "auto")
 *   mode           "upload" | "camera" | "both"  (default: "both")
 *   sides          "front" | "both" — solo INE: pide anverso y reverso  (default: "front")
 *   engine         "auto" | "mistral" | "glm" — motor de OCR; auto usa Mistral con respaldo GLM  (default: "auto")
 *   accept         MIME types para upload (default según document-type)
 *   theme          "dark" | "light"
 *   show-result    "true" | "false" — mostrar el resumen al usuario final (default: "true")
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
 *   <cortex-ocr api-key="ck_live_..." document-type="ine" sides="both"></cortex-ocr>
 *   document.querySelector('cortex-ocr').onResult = (r) => console.log(r.fields.curp)
 */
export class CortexOcr extends BaseElement {
  private slots: CaptureSlot[] = []
  private captures: Array<Blob | null> = []

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'mode', 'accept', 'document-type', 'sides', 'engine']
  }

  private get documentType(): DocumentType {
    const value = this.getAttribute('document-type')?.toLowerCase() as DocumentType | undefined
    return value && DOCUMENT_TYPES.includes(value) ? value : 'auto'
  }

  private get engine(): OcrEngine {
    const value = this.getAttribute('engine')?.toLowerCase() as OcrEngine | undefined
    return value && ENGINES.includes(value) ? value : 'auto'
  }

  private get mode(): CaptureMode {
    const m = this.getAttribute('mode')
    return m === 'upload' || m === 'camera' || m === 'both' ? m : 'both'
  }

  private get bothSides(): boolean {
    return this.documentType === 'ine' && this.getAttribute('sides') === 'both'
  }

  private get accept(): string {
    const custom = this.getAttribute('accept')
    if (custom) return custom
    const base = 'image/*,application/pdf'
    return this.documentType === 'cfdi' || this.documentType === 'auto' ? `${base},.xml,application/xml,text/xml` : base
  }

  private get acceptHint(): string {
    const xml = this.accept.includes('xml') ? ', XML' : ''
    return `JPG, PNG, PDF${xml} · máx. 10 MB`
  }

  protected override render(body: HTMLElement): void {
    const titles = this.bothSides ? ['Anverso de la INE', 'Reverso de la INE'] : [undefined]
    this.captures = titles.map(() => null)

    const heading = document.createElement('p')
    heading.className = 'element-heading'
    heading.textContent =
      this.documentType === 'auto'
        ? 'Sube tu documento: INE, CURP, factura CFDI o Constancia de Situación Fiscal'
        : `Sube tu ${DOCUMENT_TYPE_LABELS[this.documentType]}`
    body.append(heading)

    const grid = document.createElement('div')
    grid.className = this.bothSides ? 'slots slots--two' : 'slots'
    this.slots = titles.map(
      (title, i) =>
        new CaptureSlot({
          title,
          mode: this.mode,
          accept: this.accept,
          hint: this.acceptHint,
          facing: 'environment',
          guide: 'document',
          onReady: (blob) => this.onCaptured(i, blob),
          onError: (msg) => this.handleError({ code: 'FILE_VALIDATION', message: msg }),
        }),
    )
    this.slots.forEach((slot) => grid.append(slot.element))
    body.append(grid)

    if (this.bothSides) {
      const actions = document.createElement('div')
      actions.className = 'actions'
      const submit = document.createElement('button')
      submit.type = 'button'
      submit.className = 'btn btn--primary'
      submit.dataset.submit = ''
      submit.textContent = 'Extraer datos'
      submit.disabled = true
      submit.addEventListener('click', () => void this.submit())
      actions.append(submit)
      body.append(actions)
    }
  }

  private onCaptured(index: number, blob: Blob): void {
    this.hideError()
    this.captures[index] = blob
    if (!this.bothSides) {
      void this.submit()
      return
    }
    const submit = this.shadowRoot?.querySelector<HTMLButtonElement>('[data-submit]')
    if (submit) submit.disabled = this.captures.some((c) => c === null)
  }

  private async submit(): Promise<void> {
    const client = this.requireClient()
    if (!client || this.loading) return
    const blobs = this.captures.filter((c): c is Blob => c !== null)
    if (blobs.length !== this.captures.length) {
      this.handleError({ code: 'MISSING_CAPTURE', message: 'Captura ambos lados de la INE.' })
      return
    }

    this.hideError()
    this.setLoading(true, 'Extrayendo datos del documento...')
    try {
      const payload = blobs.length > 1 ? await stitchVertical(blobs) : await prepareUpload(blobs[0]!)
      const result = await client.extractDocument(payload, this.documentType, this.engine)
      this.callOnResult(result)
      this.showResultPanel(this.buildPanel(result))
    } catch (err) {
      this.handleError(err)
    } finally {
      this.setLoading(false)
    }
  }

  private buildPanel(result: OcrResult): HTMLElement {
    const rows: Array<[string, string]> = []
    for (const [path, label] of SUMMARY_FIELDS[result.document_type] ?? []) {
      const value = formatValue(pick(result, path))
      if (value) rows.push([label, value])
    }
    const checks = Object.entries(result.validations)
      .filter(([, ok]) => ok !== null)
      .map(([key, ok]) => ({ label: VALIDATION_LABELS[key] ?? key, ok }))
    // MOTOR_DE_RESPALDO es informativo para el integrador, no para el usuario final
    const warnings = result.warnings.filter((w) => w !== 'MOTOR_DE_RESPALDO').map((w) => WARNING_LABELS[w] ?? w)
    const clean = warnings.length === 0 && result.completeness >= 0.75

    return createResultPanel({
      status: clean ? 'success' : 'warning',
      title: result.document_label,
      subtitle: `${Math.round(result.completeness * 100)}% de los datos clave encontrados`,
      rows,
      checks,
      warnings,
      resetLabel: 'Procesar otro documento',
      onReset: () => this.reset(),
    })
  }

  protected override cleanup(): void {
    this.slots.forEach((s) => s.stop())
  }
}
