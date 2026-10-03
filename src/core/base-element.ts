import { ApiClient, DEFAULT_API_URL } from './api-client'
import { validateApiKey, validateApiUrl } from './validators'
import { SHARED_CSS } from '../styles/shared'

/**
 * BaseElement — abstract base for all Cortex custom elements.
 *
 * Common attributes:
 *   api-key      (required) Cortex API token
 *   api-url      Override backend URL (HTTPS, or localhost in dev)
 *   theme        "dark" (default) | "light"
 *   show-result  "true" (default) | "false" — show the built-in result summary
 *
 * Security notes:
 * - api-key is never written to the DOM, logged, or included in error messages.
 * - Error messages from the server are displayed via textContent only (see handleError).
 * - The `onResult` callback is invoked as a function reference — never eval'd from an attribute.
 * - Shadow DOM (mode: 'open') isolates element styles from the host page.
 */
export abstract class BaseElement extends HTMLElement {
  protected apiKey = ''
  protected apiUrl = DEFAULT_API_URL
  protected loading = false
  protected client: ApiClient | null = null
  private rendered = false

  static get observedAttributes(): string[] {
    return ['api-key', 'api-url']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    const key = this.getAttribute('api-key')
    if (key !== null) this.apiKey = key

    const url = this.getAttribute('api-url')
    if (url && validateApiUrl(url)) this.apiUrl = url

    this.rebuildClient()
    this.mount()
    this.rendered = true
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === 'api-key' && value !== null) {
      this.apiKey = value
      this.rebuildClient()
      return
    }
    if (name === 'api-url') {
      if (value && validateApiUrl(value)) this.apiUrl = value
      else if (value === null) this.apiUrl = DEFAULT_API_URL
      this.rebuildClient()
      return
    }
    // Atributos de configuración (mode, document-type…): re-renderizar si ya está montado
    if (this.rendered && old !== value) this.reset()
  }

  private rebuildClient(): void {
    this.client = validateApiKey(this.apiKey) ? new ApiClient(this.apiKey, this.apiUrl) : null
  }

  private mount(): void {
    const root = this.shadowRoot!
    root.innerHTML = `
      <style>${SHARED_CSS}</style>
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
    this.render(root.querySelector<HTMLElement>('[data-body]')!)
  }

  /** Vuelve al estado inicial (descarta capturas y resultado). */
  reset(): void {
    this.cleanup()
    this.mount()
  }

  /** Subclasses populate the body container with their capture UI. */
  protected abstract render(body: HTMLElement): void

  /** Override to release resources (streams, timers) on disconnection. */
  protected cleanup(): void {
    /* no-op by default */
  }

  protected get showResult(): boolean {
    return this.getAttribute('show-result') !== 'false'
  }

  // ── Event helpers ─────────────────────────────────────────────────────────

  protected emit(event: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(event, { detail, bubbles: true, composed: true }))
  }

  protected setLoading(loading: boolean, message = 'Procesando...'): void {
    this.loading = loading
    this.emit('cortex:loading', { loading })
    const overlay = this.shadowRoot?.querySelector<HTMLElement>('[data-loading]')
    if (overlay) overlay.hidden = !loading
    const text = this.shadowRoot?.querySelector<HTMLElement>('[data-loading-text]')
    if (text) text.textContent = message
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-submit]').forEach((b) => (b.disabled = loading))
  }

  /** Reemplaza la UI de captura por el panel de resultado. */
  protected showResultPanel(panel: HTMLElement): void {
    if (!this.showResult) return
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
