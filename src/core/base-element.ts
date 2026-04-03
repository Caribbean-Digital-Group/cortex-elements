import { ApiClient, DEFAULT_API_URL } from './api-client'
import { validateApiKey, validateApiUrl } from './validators'

/**
 * BaseElement — abstract base for all Cortex custom elements.
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
    this.render()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'api-key' && value !== null) {
      this.apiKey = value
      this.rebuildClient()
    }
    if (name === 'api-url' && value && validateApiUrl(value)) {
      this.apiUrl = value
      this.rebuildClient()
    }
  }

  private rebuildClient(): void {
    this.client = validateApiKey(this.apiKey)
      ? new ApiClient(this.apiKey, this.apiUrl)
      : null
  }

  /** Subclasses must implement render() to populate this.shadowRoot. */
  protected abstract render(): void

  /** Override to release resources (streams, timers) on disconnection. */
  protected cleanup(): void {
    /* no-op by default */
  }

  // ── Event helpers ─────────────────────────────────────────────────────────

  protected emit(event: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(event, { detail, bubbles: true, composed: true }))
  }

  protected setLoading(loading: boolean): void {
    this.loading = loading
    this.emit('cortex:loading', { loading })
    const overlay = this.shadowRoot?.querySelector<HTMLElement>('[data-loading]')
    if (overlay) overlay.hidden = !loading
    const submit = this.shadowRoot?.querySelector<HTMLButtonElement>('[data-submit]')
    if (submit) submit.disabled = loading
  }

  /**
   * Displays an error in the element's shadow DOM and emits cortex:error.
   * Always uses textContent — never innerHTML — to avoid XSS from server messages.
   */
  protected handleError(error: unknown): void {
    const code = (error as { code?: string })?.code ?? 'UNKNOWN_ERROR'
    // Handles: Error instances, plain {code,message} objects, and unknown throws
    const message =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === 'string'
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
