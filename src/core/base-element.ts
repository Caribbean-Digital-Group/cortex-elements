import { ApiClient, DEFAULT_API_URL } from './api-client'
import { validateApiKey, validateApiUrl } from './validators'
import {
  appearanceCss,
  cachedAppearance,
  customCopy,
  loadRemoteAppearance,
  normalizeAppearance,
  resolveLayout,
} from './appearance'
import { SHARED_CSS } from '../styles/shared'
import type { ElementId, ElementLayout, ElementsAppearance } from '../types/appearance'

/** Máximo que se oculta el element esperando el diseño remoto en la primera carga (evita el parpadeo). */
const APPEARANCE_WAIT_MS = 700

// Íconos del encabezado del layout "guided" (SVG estáticos, sin datos del usuario)
const HEADER_ICONS: Record<ElementId, string> = {
  ocr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.6-1.4 1.6-2 2.5-2s1.9.6 2.5 2M14 10h4M14 13h3"/></svg>',
  identity:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  signature:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c2.5 0 3.5-9 6-9s1 7 3.5 7S15 9 17 9s1 5 4 5"/><path d="M3 21h18"/></svg>',
}

const PROGRESS_STEPS = ['Captura', 'Análisis', 'Resultado']

/**
 * BaseElement — abstract base for all Cortex custom elements.
 *
 * Common attributes:
 *   api-key            (required) Cortex API token
 *   api-url            Override backend URL (HTTPS, or localhost in dev)
 *   theme              "dark" (default) | "light" — si se define, gana al tema del dashboard
 *   show-result        "true" (default) | "false" — show the built-in result summary
 *   layout             "classic" | "compact" | "guided" — gana a la estructura configurada en el dashboard
 *   remote-appearance  "false" ignora el diseño del dashboard (default: se aplica)
 *
 * JS property:
 *   appearance  Diseño explícito (mismo contrato que GET /elements/config). Gana al diseño remoto.
 *
 * Security notes:
 * - api-key is never written to the DOM, logged, or included in error messages.
 * - Error messages from the server are displayed via textContent only (see handleError).
 * - The `onResult` callback is invoked as a function reference — never eval'd from an attribute.
 * - Shadow DOM (mode: 'open') isolates element styles from the host page.
 * - Appearance values reach CSS only through closed lists or a hex-color regex; texts via textContent.
 */
export abstract class BaseElement extends HTMLElement {
  protected keyValue = ''
  protected urlValue = DEFAULT_API_URL
  protected loading = false
  protected client: ApiClient | null = null
  private rendered = false

  /** Identificador del element en el contrato de diseño. */
  protected abstract readonly elementId: ElementId
  /** Elements con su propio indicador de pasos (identity) no muestran el progreso genérico. */
  protected readonly hasOwnStepper: boolean = false
  /** Elements con su propia nota de privacidad no muestran el pie del layout guiado. */
  protected readonly hasOwnFooter: boolean = false

  private localDesign: ElementsAppearance | null = null
  private remoteDesign: ElementsAppearance | null = null
  private appearanceRequest = 0
  /** El usuario ya interactuó: un diseño remoto tardío solo cambia estilos, no re-renderiza. */
  private touched = false
  private resultShown = false

  static get observedAttributes(): string[] {
    return ['api-key', 'api-url', 'layout', 'remote-appearance']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    const touch = () => (this.touched = true)
    for (const type of ['pointerdown', 'keydown', 'change', 'drop']) this.shadowRoot!.addEventListener(type, touch)
  }

  connectedCallback(): void {
    // Un framework pudo asignar `appearance` antes de que se registrara el element: re-aplicarla vía el setter
    if (Object.prototype.hasOwnProperty.call(this, 'appearance')) {
      const value = (this as unknown as { appearance: unknown }).appearance
      delete (this as unknown as { appearance?: unknown }).appearance
      this.localDesign = value == null ? null : normalizeAppearance(value)
    }

    const key = this.getAttribute('api-key')
    if (key !== null) this.keyValue = key

    const url = this.getAttribute('api-url')
    if (url && validateApiUrl(url)) this.urlValue = url

    this.rebuildClient()
    this.mount()
    this.rendered = true
    this.syncRemoteAppearance()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === 'api-key' && value !== null) {
      this.keyValue = value
      this.rebuildClient()
      if (this.rendered) this.syncRemoteAppearance()
      return
    }
    if (name === 'api-url') {
      if (value && validateApiUrl(value)) this.urlValue = value
      else if (value === null) this.urlValue = DEFAULT_API_URL
      this.rebuildClient()
      if (this.rendered) this.syncRemoteAppearance()
      return
    }
    if (name === 'remote-appearance') {
      if (this.rendered && old !== value) this.syncRemoteAppearance(true)
      return
    }
    // Atributos de configuración (mode, document-type, layout…): re-renderizar si ya está montado
    if (this.rendered && old !== value) this.reset()
  }

  private rebuildClient(): void {
    this.client = validateApiKey(this.keyValue) ? new ApiClient(this.keyValue, this.urlValue) : null
  }

  // ── Diseño ────────────────────────────────────────────────────────────────

  /** Diseño explícito (p. ej. la vista previa del dashboard). null = usar el del dashboard o el original. */
  get appearance(): ElementsAppearance | null {
    return this.localDesign
  }

  set appearance(value: unknown) {
    this.localDesign = value == null ? null : normalizeAppearance(value)
    if (this.rendered) this.reset()
  }

  private get remoteEnabled(): boolean {
    return this.getAttribute('remote-appearance') !== 'false'
  }

  /** Diseño vigente: propiedad JS > dashboard > ninguno (diseño original). */
  protected get effectiveAppearance(): ElementsAppearance | null {
    return this.localDesign ?? (this.remoteEnabled ? this.remoteDesign : null)
  }

  /** Estructura vigente (no se llama `layout`: ese nombre es la propiedad reflejada del atributo). */
  protected get currentLayout(): ElementLayout {
    return resolveLayout(this.effectiveAppearance, this.elementId, this.getAttribute('layout'))
  }

  /** Título y descripción por defecto del encabezado (el dashboard puede reemplazarlos). */
  protected abstract defaultCopy(): { title: string; description: string }

  /** Se muestra el encabezado en el layout guiado o si el dashboard definió textos propios. */
  protected get headerVisible(): boolean {
    const copy = customCopy(this.effectiveAppearance, this.elementId)
    return this.currentLayout === 'guided' || copy.title !== null || copy.description !== null
  }

  /**
   * Pide el diseño de la cuenta (una llamada por key y página). La primera vez se oculta el element hasta
   * `APPEARANCE_WAIT_MS` para no mostrar el diseño original y luego cambiarlo; con el diseño en
   * sessionStorage se pinta de inmediato y se actualiza en segundo plano.
   */
  private syncRemoteAppearance(force = false): void {
    const request = ++this.appearanceRequest
    if (!this.remoteEnabled || !this.client) {
      const hadRemote = this.remoteDesign !== null
      this.remoteDesign = null
      this.setPending(false)
      if (hadRemote || force) this.applyAppearance()
      return
    }

    const cacheKey = `${this.urlValue}|${this.keyValue}`
    const stored = cachedAppearance(cacheKey)
    if (stored !== undefined) {
      this.remoteDesign = stored
      this.applyAppearance()
    } else if (!this.localDesign) {
      this.setPending(true)
      setTimeout(() => request === this.appearanceRequest && this.setPending(false), APPEARANCE_WAIT_MS)
    }

    void loadRemoteAppearance(this.client, cacheKey).then((config) => {
      if (request !== this.appearanceRequest) return // cambió la key mientras tanto
      const changed = JSON.stringify(config) !== JSON.stringify(this.remoteDesign)
      this.remoteDesign = config
      if (changed) this.applyAppearance()
      this.setPending(false)
    })
  }

  private setPending(pending: boolean): void {
    this.shadowRoot?.querySelector('.cortex-element')?.classList.toggle('cortex-element--pending', pending)
  }

  /** Aplica el diseño vigente: re-renderiza si el usuario aún no interactúa; si no, solo cambia estilos. */
  private applyAppearance(): void {
    if (!this.rendered) return
    if (!this.touched && !this.loading && !this.resultShown) {
      this.reset()
      return
    }
    const style = this.shadowRoot?.querySelector('style[data-appearance]')
    if (style) style.textContent = appearanceCss(this.effectiveAppearance)
  }

  private buildHeader(layout: ElementLayout): HTMLElement {
    const copy = customCopy(this.effectiveAppearance, this.elementId)
    const defaults = this.defaultCopy()
    const header = document.createElement('header')
    header.className = 'layout-header'
    if (layout === 'guided') {
      const icon = document.createElement('span')
      icon.className = 'layout-header__icon'
      icon.setAttribute('aria-hidden', 'true')
      icon.innerHTML = HEADER_ICONS[this.elementId] // constante estática
      header.append(icon)
    }
    const textBox = document.createElement('div')
    textBox.className = 'layout-header__text'
    const title = document.createElement('h2')
    title.className = 'layout-header__title'
    title.textContent = copy.title ?? defaults.title
    textBox.append(title)
    const description = copy.description ?? (layout === 'guided' ? defaults.description : null)
    if (description) {
      const p = document.createElement('p')
      p.className = 'layout-header__description'
      p.textContent = description
      textBox.append(p)
    }
    header.append(textBox)
    return header
  }

  private buildProgress(): HTMLOListElement {
    const list = document.createElement('ol')
    list.className = 'stepper layout-progress'
    list.setAttribute('aria-label', 'Progreso')
    PROGRESS_STEPS.forEach((label, i) => {
      const item = document.createElement('li')
      item.className = 'stepper__item'
      item.dataset.progressStep = String(i + 1)
      const dot = document.createElement('span')
      dot.className = 'stepper__dot'
      dot.textContent = String(i + 1)
      const text = document.createElement('span')
      text.className = 'stepper__label'
      text.textContent = label
      item.append(dot, text)
      list.append(item)
    })
    return list
  }

  /** Paso del indicador genérico del layout guiado (1 captura, 2 análisis, 3 resultado). */
  private setProgress(step: 1 | 2 | 3): void {
    this.shadowRoot?.querySelectorAll<HTMLElement>('[data-progress-step]').forEach((item) => {
      const n = Number(item.dataset.progressStep)
      item.classList.toggle('stepper__item--active', n === step)
      item.classList.toggle('stepper__item--done', n < step)
      if (n === step) item.setAttribute('aria-current', 'step')
      else item.removeAttribute('aria-current')
    })
  }

  private mount(): void {
    const root = this.shadowRoot!
    const layout = this.currentLayout
    root.innerHTML = `
      <style>${SHARED_CSS}</style>
      <style data-appearance></style>
      <div class="cortex-element">
        <div data-error class="error-msg" role="alert" hidden></div>
        <div data-loading class="loading-overlay" hidden>
          <div class="spinner"></div>
          <p data-loading-text></p>
        </div>
        <div data-body></div>
        <div data-result hidden></div>
      </div>
    `
    root.querySelector('style[data-appearance]')!.textContent = appearanceCss(this.effectiveAppearance)
    const wrapper = root.querySelector<HTMLElement>('.cortex-element')!
    wrapper.dataset.layout = layout

    if (this.headerVisible) wrapper.prepend(this.buildHeader(layout))
    if (layout === 'guided' && !this.hasOwnStepper) {
      wrapper.querySelector('[data-error]')!.before(this.buildProgress())
      this.setProgress(1)
    }
    if (layout === 'guided' && !this.hasOwnFooter) {
      const footer = document.createElement('p')
      footer.className = 'layout-footer'
      footer.textContent = '🔒 Tus archivos se procesan de forma segura y no se almacenan.'
      wrapper.append(footer)
    }

    this.render(root.querySelector<HTMLElement>('[data-body]')!)
  }

  /** Vuelve al estado inicial (descarta capturas y resultado). */
  reset(): void {
    const pending = this.shadowRoot?.querySelector('.cortex-element--pending') !== null && this.rendered
    this.cleanup()
    this.touched = false
    this.resultShown = false
    this.mount()
    if (pending) this.setPending(true)
  }

  /** Subclasses populate the body container with their capture UI. */
  protected abstract render(body: HTMLElement): void

  /** Override to release resources (streams, timers) on disconnection. */
  protected cleanup(): void {
    /* no-op by default */
  }

  protected get resultEnabled(): boolean {
    return this.getAttribute('show-result') !== 'false'
  }

  // ── Event helpers ─────────────────────────────────────────────────────────

  protected emit(event: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(event, { detail, bubbles: true, composed: true }))
  }

  /** `overlay: false` cuando el element muestra su propio progreso (p. ej. el paso de resultado del wizard). */
  protected setLoading(loading: boolean, message = 'Procesando...', overlay = true): void {
    this.loading = loading
    this.emit('cortex:loading', { loading })
    const overlayEl = this.shadowRoot?.querySelector<HTMLElement>('[data-loading]')
    if (overlayEl) overlayEl.hidden = !(loading && overlay)
    const text = this.shadowRoot?.querySelector<HTMLElement>('[data-loading-text]')
    if (text) text.textContent = message
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-submit]').forEach((b) => (b.disabled = loading))
    this.setProgress(loading ? 2 : this.resultShown ? 3 : 1)
  }

  /** Reemplaza la UI de captura por el panel de resultado. */
  protected showResultPanel(panel: HTMLElement): void {
    if (!this.resultEnabled) return
    const body = this.shadowRoot?.querySelector<HTMLElement>('[data-body]')
    const result = this.shadowRoot?.querySelector<HTMLElement>('[data-result]')
    if (!body || !result) return
    this.cleanup()
    body.hidden = true
    result.replaceChildren(panel)
    result.hidden = false
  }

  /**
   * Displays an error in the element's shadow DOM and emits cortex:error.
   * Always uses textContent — never innerHTML — to avoid XSS from server messages.
   */
  protected handleError(error: unknown): void {
    const code = (error as { code?: string })?.code ?? 'UNKNOWN_ERROR'
    const message =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown })?.message === 'string'
          ? (error as { message: string }).message
          : String(error)
    this.emit('cortex:error', { code, message })
    const errEl = this.shadowRoot?.querySelector<HTMLElement>('[data-error]')
    if (errEl) {
      errEl.textContent = message // textContent, NOT innerHTML
      errEl.hidden = false
    }
  }

  protected hideError(): void {
    const errEl = this.shadowRoot?.querySelector<HTMLElement>('[data-error]')
    if (errEl) errEl.hidden = true
  }

  protected requireClient(): ApiClient | null {
    if (!this.client) {
      this.handleError({ code: 'INVALID_API_KEY', message: 'Configura un api-key válido.' })
      return null
    }
    return this.client
  }

  /**
   * Emits cortex:result and calls the onResult property if set.
   * The callback is NEVER constructed from the on-result attribute string.
   * Clients set it as a JS property: element.onResult = (data) => { ... }
   */
  protected callOnResult(result: unknown): void {
    this.resultShown = true
    this.setProgress(3)
    this.emit('cortex:result', result)
    const cb = (this as unknown as Record<string, unknown>)['onResult']
    if (typeof cb === 'function') {
      try {
        cb(result)
      } catch {
        /* Isolate consumer callback errors — don't let them bubble into the element */
      }
    }
  }
}
