import { BaseElement } from '../core/base-element'
import { prepareUpload } from '../core/image'
import { CaptureSlot, type CaptureMode } from '../ui/capture-slot'
import { createResultPanel, type ResultStatus } from '../ui/result-panel'
import { WARNING_LABELS, formatValue } from '../ui/labels'
import type { IdentityResult } from '../types/identity'
import type { OcrEngine } from '../types/ocr'

type Step = 1 | 2 | 3

const STEPS: Array<[Step, string]> = [
  [1, 'Identificación'],
  [2, 'Selfie'],
  [3, 'Resultado'],
]

// El backend reduce a 1600 px para biometría; el OCR de la INE sí aprovecha 2000 px
const ID_MAX_SIDE = 1600
const ID_MAX_SIDE_OCR = 2000
// Para la selfie basta con el rostro: menos datos biométricos en tránsito y menor latencia
const SELFIE_MAX_SIDE = 1280
const EXTERNAL_ID_MAX = 100
const HIDDEN_WARNINGS = new Set(['LIVENESS_NO_DISPONIBLE', 'MOTOR_DE_RESPALDO'])

/**
 * <cortex-identity> — verificación biométrica en tres pasos: INE → selfie → resultado.
 *
 * Attributes:
 *   api-key           (required) Cortex API token
 *   api-url           Override backend URL (dev only)
 *   liveness          "true" | "false"  Prueba de vida anti-spoofing  (default: "true")
 *   threshold         0–1  Similitud mínima adicional para `face_match` (default: decisión del modelo)
 *   extract-document  "true" | "false"  Extraer también los datos de la INE  (default: "false")
 *   mode              "upload" | "camera" | "both" — captura de la INE en el paso 1  (default: "both")
 *                     La selfie del paso 2 siempre se toma en vivo con la cámara frontal (sin adjuntar archivo).
 *   engine            "auto" | "mistral" | "glm"  Motor de OCR para extract-document  (default: "auto")
 *   external-id       Referencia propia (expediente, folio) que se guarda con la verificación
 *   theme, show-result
 *
 * El nivel de similitud de `similarity_approved` se configura en el dashboard (Identidad).
 *
 * JS property:
 *   onResult   (data: IdentityResult) => void
 *
 * DOM events:
 *   cortex:result   detail: IdentityResult
 *   cortex:error    detail: { code: string; message: string }
 *   cortex:loading  detail: { loading: boolean }
 *   cortex:step     detail: { step: 1 | 2 | 3 }
 *
 * Usage:
 *   <cortex-identity api-key="ck_live_..." extract-document="true"></cortex-identity>
 *   document.querySelector('cortex-identity').onResult = (r) => console.log(r.verified, r.similarity_approved)
 */
export class CortexIdentity extends BaseElement {
  private idBlob: Blob | null = null
  private selfieBlob: Blob | null = null
  /** Las imágenes se optimizan en cuanto se capturan, mientras el usuario avanza al siguiente paso. */
  private idUpload: Promise<string | null> | null = null
  private selfieUpload: Promise<string | null> | null = null
  private idSlot: CaptureSlot | null = null
  private selfieSlot: CaptureSlot | null = null
  private step: Step = 1
  private stepper: HTMLOListElement | null = null
  private sections: Partial<Record<Step, HTMLElement>> = {}
  private outcome: HTMLElement | null = null

  static override get observedAttributes(): string[] {
    return [
      ...super.observedAttributes,
      'liveness', 'threshold', 'extract-document', 'mode', 'engine', 'external-id',
    ]
  }

  private get minSimilarity(): number | null {
    const raw = this.getAttribute('threshold')
    const value = raw === null ? NaN : parseFloat(raw)
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

  private get externalId(): string | null {
    const value = this.getAttribute('external-id')?.trim()
    return value ? value.slice(0, EXTERNAL_ID_MAX) : null
  }

  private flag(name: string, fallback: boolean): boolean {
    const value = this.getAttribute(name)
    return value === null ? fallback : value !== 'false'
  }

  private get extractsDocument(): boolean {
    return this.flag('extract-document', false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  protected override render(body: HTMLElement): void {
    this.idBlob = null
    this.selfieBlob = null
    this.idUpload = null
    this.selfieUpload = null
    this.step = 1

    this.stepper = this.buildStepper()
    this.sections = { 1: this.buildIdStep(), 2: this.buildSelfieStep(), 3: this.buildResultStep() }

    const privacy = document.createElement('p')
    privacy.className = 'privacy-note'
    privacy.textContent = 'Tus imágenes se procesan de forma segura y no se almacenan.'

    body.append(this.stepper, this.sections[1]!, this.sections[2]!, this.sections[3]!, privacy)
    this.goTo(1, false)
  }

  private buildStepper(): HTMLOListElement {
    const list = document.createElement('ol')
    list.className = 'stepper'
    list.setAttribute('aria-label', 'Pasos de la verificación')
    for (const [n, label] of STEPS) {
      const item = document.createElement('li')
      item.className = 'stepper__item'
      item.dataset.step = String(n)
      const dot = document.createElement('span')
      dot.className = 'stepper__dot'
      dot.setAttribute('aria-hidden', 'true')
      dot.textContent = String(n)
      const text = document.createElement('span')
      text.className = 'stepper__label'
      text.textContent = label
      item.append(dot, text)
      list.append(item)
    }
    return list
  }

  private section(step: Step, title: string, hint: string): HTMLElement {
    const section = document.createElement('section')
    section.className = 'wizard-step'
    section.dataset.wizardStep = String(step)
    const heading = document.createElement('h3')
    heading.className = 'wizard-step__title'
    heading.tabIndex = -1 // recibe el foco al cambiar de paso (lectores de pantalla)
    heading.textContent = title
    const sub = document.createElement('p')
    sub.className = 'wizard-step__hint'
    sub.textContent = hint
    section.append(heading, sub)
    return section
  }

  private button(label: string, variant: 'primary' | 'secondary' | 'ghost', onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `btn btn--${variant}`
    btn.textContent = label
    btn.addEventListener('click', onClick)
    return btn
  }

  /** Fila de acciones: el último botón (principal) siempre queda a la derecha. */
  private actions(...buttons: HTMLButtonElement[]): HTMLElement {
    const row = document.createElement('div')
    row.className = 'actions actions--split'
    row.append(...buttons)
    return row
  }

  private buildIdStep(): HTMLElement {
    const section = this.section(1, 'Identificación oficial (INE)', 'Adjunta o fotografía el frente de tu INE, completo y sin reflejos.')
    const next = this.button('Continuar', 'primary', () => this.goTo(2))
    next.disabled = true
    next.dataset.next = ''

    this.idSlot = new CaptureSlot({
      mode: this.idMode,
      accept: 'image/*',
      hint: 'Foto clara del frente de tu INE · JPG o PNG',
      facing: 'environment',
      guide: 'document',
      onReady: (blob) => {
        this.hideError()
        this.idBlob = blob
        this.idUpload = this.optimize(blob, this.extractsDocument ? ID_MAX_SIDE_OCR : ID_MAX_SIDE)
        next.disabled = false
        next.focus()
      },
      onError: (msg) => this.handleError({ code: 'FILE_VALIDATION', message: msg }),
    })

    section.append(this.idSlot.element, this.actions(next))
    return section
  }

  private buildSelfieStep(): HTMLElement {
    const section = this.section(2, 'Selfie', 'Mira a la cámara con buena luz, sin lentes oscuros ni gorra.')
    const submit = this.button('Verificar identidad', 'primary', () => void this.submit())
    submit.disabled = true
    submit.dataset.submit = ''

    this.selfieSlot = new CaptureSlot({
      mode: 'camera', // selfie en vivo: no se permite adjuntar archivo (dificulta la suplantación)
      accept: 'image/*',
      facing: 'user',
      guide: 'face',
      onReady: (blob) => {
        this.hideError()
        this.selfieBlob = blob
        this.selfieUpload = this.optimize(blob, SELFIE_MAX_SIDE)
        submit.disabled = !this.idBlob
        submit.focus()
      },
      onError: (msg) => this.handleError({ code: 'CAMERA_ERROR', message: msg }),
    })

    section.append(this.selfieSlot.element, this.actions(this.button('Atrás', 'ghost', () => this.goTo(1)), submit))
    return section
  }

  private buildResultStep(): HTMLElement {
    const section = document.createElement('section')
    section.className = 'wizard-step'
    section.dataset.wizardStep = '3'
    this.outcome = document.createElement('div')
    section.append(this.outcome)
    return section
  }

  // ── Navegación ─────────────────────────────────────────────────────────────

  private goTo(step: Step, focus = true): void {
    if (this.step === 2 && step !== 2) this.selfieSlot?.pauseCamera()
    if (this.step === 1 && step !== 1) this.idSlot?.pauseCamera()
    this.step = step

    for (const [n, section] of Object.entries(this.sections)) section.hidden = Number(n) !== step
    this.stepper?.querySelectorAll<HTMLElement>('.stepper__item').forEach((item) => {
      const n = Number(item.dataset.step)
      item.classList.toggle('stepper__item--active', n === step)
      item.classList.toggle('stepper__item--done', n < step)
      if (n === step) item.setAttribute('aria-current', 'step')
      else item.removeAttribute('aria-current')
    })

    // La cámara se enciende al entrar (el clic en "Continuar" es el gesto del usuario)
    if (step === 2 && !this.selfieBlob) this.selfieSlot?.startCamera()

    this.emit('cortex:step', { step })
    if (focus) this.sections[step]?.querySelector<HTMLElement>('.wizard-step__title, [tabindex="-1"]')?.focus()
  }

  private optimize(blob: Blob, maxSide: number): Promise<string | null> {
    return prepareUpload(blob, maxSide).catch(() => null)
  }

  // ── Envío ──────────────────────────────────────────────────────────────────

  private async submit(): Promise<void> {
    const client = this.requireClient()
    if (!client || this.loading) return
    if (!this.idBlob || !this.selfieBlob) {
      this.handleError({ code: 'MISSING_CAPTURE', message: 'Captura tu identificación y tu selfie.' })
      return
    }

    this.hideError()
    this.goTo(3)
    this.showProgress()
    this.setLoading(true, 'Verificando identidad...', false)
    try {
      const extract = this.extractsDocument
      const [idImage, selfie] = await Promise.all([
        this.idUpload?.then((v) => v ?? prepareUpload(this.idBlob!, extract ? ID_MAX_SIDE_OCR : ID_MAX_SIDE)),
        this.selfieUpload?.then((v) => v ?? prepareUpload(this.selfieBlob!, SELFIE_MAX_SIDE)),
      ])
      const result = await client.verifyIdentity(idImage!, selfie!, {
        checkLiveness: this.flag('liveness', true),
        threshold: this.minSimilarity,
        extractDocument: extract,
        ocrEngine: this.ocrEngine,
        externalId: this.externalId,
      })
      this.callOnResult(result)
      this.showOutcome(this.resultEnabled ? this.buildPanel(result) : this.buildDone())
    } catch (err) {
      this.handleError(err)
      this.showOutcome(this.buildFailure())
    } finally {
      this.setLoading(false)
    }
  }

  private showOutcome(node: HTMLElement): void {
    this.outcome?.replaceChildren(node)
    node.querySelector<HTMLElement>('.result__title, .wizard-step__title')?.focus()
  }

  private showProgress(): void {
    const box = document.createElement('div')
    box.className = 'wizard-progress'
    box.setAttribute('role', 'status')
    const spinner = document.createElement('div')
    spinner.className = 'spinner'
    const title = document.createElement('p')
    title.className = 'wizard-step__title'
    title.textContent = 'Verificando identidad…'
    const list = document.createElement('ul')
    list.className = 'wizard-progress__list'
    const tasks = ['Comparación del rostro con la INE']
    if (this.flag('liveness', true)) tasks.push('Prueba de vida')
    if (this.extractsDocument) tasks.push('Lectura de los datos de la INE')
    for (const task of tasks) {
      const li = document.createElement('li')
      li.textContent = task
      list.append(li)
    }
    box.append(spinner, title, list)
    this.outcome?.replaceChildren(box)
  }

  /** Error de la API o de red: reintentar con las mismas fotos o corregirlas. */
  private buildFailure(): HTMLElement {
    const box = document.createElement('div')
    box.className = 'wizard-progress'
    const title = document.createElement('p')
    title.className = 'wizard-step__title'
    title.tabIndex = -1
    title.textContent = 'No se pudo completar la verificación'
    box.append(
      title,
      this.actions(
        this.button('Corregir fotos', 'ghost', () => this.goTo(2)),
        this.button('Reintentar', 'primary', () => void this.submit()),
      ),
    )
    return box
  }

  /** show-result="false": el integrador muestra su propio resultado; aquí solo se cierra el flujo. */
  private buildDone(): HTMLElement {
    const box = document.createElement('div')
    box.className = 'wizard-progress'
    const title = document.createElement('p')
    title.className = 'wizard-step__title'
    title.tabIndex = -1
    title.textContent = 'Verificación enviada'
    box.append(title, this.actions(this.button('Verificar de nuevo', 'secondary', () => this.reset())))
    return box
  }

  private buildPanel(result: IdentityResult): HTMLElement {
    const pct = (v: number) => `${Math.round(v * 100)}%`
    const status: ResultStatus = !result.verified ? 'error' : result.similarity_approved ? 'success' : 'warning'
    const title =
      status === 'success' ? 'Identidad verificada' : status === 'warning' ? 'Verificada con observaciones' : 'No se pudo verificar la identidad'
    const subtitle =
      status === 'warning'
        ? 'El rostro coincide, pero la similitud está debajo del nivel configurado.'
        : status === 'error'
          ? result.liveness === false
            ? 'No se superó la prueba de vida. Toma la selfie en vivo, sin fotos ni pantallas.'
            : 'El rostro no coincide con la INE. Intenta con más luz y de frente.'
          : undefined

    const checks = [
      { label: `El rostro coincide con la INE (≥ ${pct(result.threshold)})`, ok: result.face_match },
      { label: `Nivel de similitud configurado (≥ ${pct(result.min_similarity)})`, ok: result.similarity_approved },
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

    const panel = createResultPanel({
      status,
      title,
      subtitle,
      metric: { label: 'Similitud facial', value: result.similarity },
      rows,
      checks,
      warnings: result.warnings
        .filter((w) => !HIDDEN_WARNINGS.has(w))
        .map((w) => WARNING_LABELS[w.split(':')[0]!] ?? w),
      resetLabel: 'Verificar de nuevo',
      onReset: () => this.reset(),
    })
    panel.querySelector<HTMLElement>('.result__title')?.setAttribute('tabindex', '-1')
    return panel
  }

  protected override cleanup(): void {
    this.idSlot?.stop()
    this.selfieSlot?.stop()
  }
}
