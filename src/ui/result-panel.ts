export type ResultStatus = 'success' | 'warning' | 'error'

export interface ResultCheck {
  label: string
  /** true = pasa, false = falla, null = no evaluado */
  ok: boolean | null
}

export interface ResultPanelOptions {
  status: ResultStatus
  title: string
  subtitle?: string
  /** Métrica destacada, p. ej. "Similitud 94%" */
  metric?: { label: string; value: number }
  rows?: Array<[string, string]>
  checks?: ResultCheck[]
  warnings?: string[]
  resetLabel?: string
  onReset?: () => void
}

const ICONS: Record<ResultStatus, string> = { success: '✓', warning: '!', error: '✕' }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text // textContent: nunca innerHTML con datos del servidor
  return node
}

/**
 * ResultPanel — resumen visual del resultado para el usuario final.
 * El JSON completo siempre se entrega al sitio del cliente vía evento/callback.
 */
export function createResultPanel(opts: ResultPanelOptions): HTMLElement {
  const panel = el('div', `result result--${opts.status}`)
  panel.setAttribute('role', 'status')

  const header = el('div', 'result__header')
  const icon = el('span', 'result__icon', ICONS[opts.status])
  icon.setAttribute('aria-hidden', 'true')
  const titles = el('div')
  titles.append(el('p', 'result__title', opts.title))
  if (opts.subtitle) titles.append(el('p', 'result__subtitle', opts.subtitle))
  header.append(icon, titles)
  panel.append(header)

  if (opts.metric) {
    const pct = Math.round(Math.max(0, Math.min(1, opts.metric.value)) * 100)
    const metric = el('div', 'result__metric')
    const label = el('div', 'result__metric-label')
    label.append(el('span', undefined, opts.metric.label), el('strong', undefined, `${pct}%`))
    const bar = el('div', 'result__bar')
    const fill = el('div', 'result__bar-fill')
    fill.style.width = `${pct}%`
    bar.append(fill)
    metric.append(label, bar)
    panel.append(metric)
  }

  if (opts.rows?.length) {
    const list = el('dl', 'result__rows')
    for (const [label, value] of opts.rows) {
      list.append(el('dt', undefined, label), el('dd', undefined, value))
    }
    panel.append(list)
  }

  if (opts.checks?.length) {
    const checks = el('ul', 'result__checks')
    for (const check of opts.checks) {
      const state = check.ok === null ? 'na' : check.ok ? 'ok' : 'fail'
      const item = el('li', `check check--${state}`)
      item.append(el('span', 'check__dot', check.ok === null ? '–' : check.ok ? '✓' : '✕'), el('span', undefined, check.label))
      checks.append(item)
    }
    panel.append(checks)
  }

  if (opts.warnings?.length) {
    const warnings = el('ul', 'result__warnings')
    for (const w of opts.warnings) warnings.append(el('li', undefined, w))
    panel.append(warnings)
  }

  if (opts.onReset) {
    const actions = el('div', 'actions')
    const btn = el('button', 'btn btn--secondary', opts.resetLabel ?? 'Intentar de nuevo')
    btn.type = 'button'
    btn.addEventListener('click', opts.onReset)
    actions.append(btn)
    panel.append(actions)
  }

  return panel
}
