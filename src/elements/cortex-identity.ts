import { BaseElement } from '../core/base-element'
import { prepareUpload } from '../core/image'
import { CaptureSlot, type CaptureMode } from '../ui/capture-slot'
import { createResultPanel } from '../ui/result-panel'
import { WARNING_LABELS, formatValue } from '../ui/labels'
import type { IdentityResult } from '../types/identity'
import type { OcrEngine } from '../types/ocr'

/**
 * <cortex-identity> — verificación biométrica: identificación oficial vs selfie.
 *
 * Attributes:
 *   api-key           (required) Cortex API token
 *   api-url           Override backend URL (dev only)
 *   liveness          "true" | "false"  Prueba de vida anti-spoofing  (default: "true")
 *   threshold         0–1  Similitud mínima adicional (default: decisión del modelo)
 *   extract-document  "true" | "false"  Extraer también los datos de la INE  (default: "false")
 *   mode              "upload" | "camera" | "both" — captura de la identificación  (default: "both")
 *   selfie-upload     "true" | "false"  Permitir subir la selfie como archivo  (default: "false")
 *   engine            "auto" | "mistral" | "glm"  Motor de OCR para extract-document  (default: "auto")
 *   theme, show-result
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
 *   <cortex-identity api-key="ck_live_..." extract-document="true"></cortex-identity>
 *   document.querySelector('cortex-identity').onResult = (r) => console.log(r.verified)
 */
export class CortexIdentity extends BaseElement {
  private idBlob: Blob | null = null
  private selfieBlob: Blob | null = null
  private slots: CaptureSlot[] = []

  static override get observedAttributes(): string[] {
    return [...super.observedAttributes, 'liveness', 'threshold', 'extract-document', 'mode', 'selfie-upload', 'engine']
  }

  private get threshold(): number | null {
    const raw = this.getAttribute('threshold')
    if (raw === null) return null
    const value = parseFloat(raw)
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null
  }

  private get idMode(): CaptureMode {
    const m = this.getAttribute('mode')
    return m === 'upload' || m === 'camera' || m === 'both' ? m : 'both'
  }

  private get ocrEngine(): OcrEngine {
    const value = this.getAttribute('engine')
    return value === 'mistral' || value === 'glm' ? value : 'auto'
  }

  private flag(name: string, fallback: boolean): boolean {
    const value = this.getAttribute(name)
    return value === null ? fallback : value !== 'false'
  }

  protected override render(body: HTMLElement): void {
    this.idBlob = null
    this.selfieBlob = null

    const steps = document.createElement('div')
    steps.className = 'steps'

    const idSlot = new CaptureSlot({
      title: '1. Identificación oficial (INE)',
      mode: this.idMode,
      accept: 'image/*',
      hint: 'Foto clara del frente de tu INE · JPG o PNG',
      facing: 'environment',
      guide: 'document',
      onReady: (blob) => {
        this.idBlob = blob
        selfieStep.hidden = false
        selfieStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        this.updateSubmit()
      },
      onError: (msg) => this.handleError({ code: 'FILE_VALIDATION', message: msg }),
    })

    const selfieSlot = new CaptureSlot({
      title: '2. Selfie',
      mode: this.flag('selfie-upload', false) ? 'both' : 'camera',
      accept: 'image/*',
      facing: 'user',
      guide: 'face',
      onReady: (blob) => {
        this.selfieBlob = blob
        this.updateSubmit()
      },
      onError: (msg) => this.handleError({ code: 'CAMERA_ERROR', message: msg }),
    })
    const selfieStep = selfieSlot.element
    selfieStep.hidden = true

    this.slots = [idSlot, selfieSlot]
    steps.append(idSlot.element, selfieStep)

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'button'
    submit.className = 'btn btn--primary'
    submit.dataset.submit = ''
    submit.textContent = 'Verificar identidad'
    submit.disabled = true
    submit.addEventListener('click', () => void this.submit())
    actions.append(submit)

    const privacy = document.createElement('p')
    privacy.className = 'privacy-note'
    privacy.textContent = 'Tus imágenes se procesan de forma segura y no se almacenan.'

    body.append(steps, actions, privacy)
  }

  private updateSubmit(): void {
    this.hideError()
    const submit = this.shadowRoot?.querySelector<HTMLButtonElement>('[data-submit]')
    if (submit) submit.disabled = !(this.idBlob && this.selfieBlob)
  }

  private async submit(): Promise<void> {
    const client = this.requireClient()
    if (!client || this.loading) return
    if (!this.idBlob || !this.selfieBlob) {
      this.handleError({ code: 'MISSING_CAPTURE', message: 'Captura tu identificación y tu selfie.' })
      return
    }

    this.hideError()
    this.setLoading(true, 'Verificando identidad...')
    try {
      const [idImage, selfie] = await Promise.all([prepareUpload(this.idBlob), prepareUpload(this.selfieBlob)])
      const result = await client.verifyIdentity(idImage, selfie, {
        checkLiveness: this.flag('liveness', true),
        threshold: this.threshold,
        extractDocument: this.flag('extract-document', false),
        ocrEngine: this.ocrEngine,
      })
      this.callOnResult(result)
      this.showResultPanel(this.buildPanel(result))
    } catch (err) {
      this.handleError(err)
    } finally {
      this.setLoading(false)
    }
  }

  private buildPanel(result: IdentityResult): HTMLElement {
    const checks = [
      { label: 'El rostro coincide con la identificación', ok: result.face_match },
      { label: 'Prueba de vida', ok: result.liveness },
    ]
    const rows: Array<[string, string]> = []
    const doc = result.document
    if (doc) {
      const name = formatValue(doc.derived['nombre_completo'])
      const curp = formatValue(doc.fields['curp'])
      if (name) rows.push(['Nombre', name])
      if (curp) rows.push(['CURP', curp])
      checks.push({ label: 'INE vigente', ok: doc.validations['vigente'] ?? null })
    }

    return createResultPanel({
      status: result.verified ? 'success' : 'error',
      title: result.verified ? 'Identidad verificada' : 'No se pudo verificar la identidad',
      subtitle: result.verified ? undefined : 'Intenta con una foto más nítida y buena iluminación.',
      metric: { label: 'Similitud facial', value: result.similarity },
      rows,
      checks,
      warnings: result.warnings
        .filter((w) => w !== 'LIVENESS_NO_DISPONIBLE' && w !== 'MOTOR_DE_RESPALDO')
        .map((w) => WARNING_LABELS[w.split(':')[0]!] ?? w),
      resetLabel: 'Verificar de nuevo',
      onReset: () => this.reset(),
    })
  }

  protected override cleanup(): void {
    this.slots.forEach((s) => s.stop())
  }
}
