// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  appearanceCss,
  clearAppearanceCache,
  contrastRatio,
  extractLightTokens,
  normalizeAppearance,
  onColor,
  resolveLayout,
} from '../src/core/appearance'

const KEY = 'ck_live_aaaaaaaaaaaaaaaa'
const GUIDED = { ...DEFAULT_APPEARANCE, layout: 'guided', colors: { ...DEFAULT_APPEARANCE.colors, primary: '#7c3aed' } }

beforeAll(async () => {
  HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, { get: (_t, prop) => (prop === 'canvas' ? this : () => undefined), set: () => true })
  } as unknown as HTMLCanvasElement['getContext']
  await import('../src/index')
})

let fetchMock: ReturnType<typeof vi.fn>

function serve(config: unknown, status = 200) {
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(status === 200 ? { config, updated_at: null } : { detail: 'x', code: 'INVALID_API_KEY' }), { status }))
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  clearAppearanceCache()
  sessionStorage.clear()
  serve(null)
})
afterEach(() => vi.unstubAllGlobals())

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

const $ = (el: HTMLElement, selector: string) => el.shadowRoot!.querySelector<HTMLElement>(selector)
const wrapper = (el: HTMLElement) => $(el, '.cortex-element')!
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('normalizeAppearance', () => {
  it('descarta valores fuera del contrato sin romper', () => {
    const a = normalizeAppearance({
      layout: 'fancy',
      radius: 'xl',
      colors: { primary: 'red', background: '#FFFFFF', text: 'url(javascript:alert(1))' },
      elements: { ocr: { layout: 'compact', title: '  Sube\\n tu INE  ', description: 'x'.repeat(500) } },
    })!
    expect(a.layout).toBe('classic')
    expect(a.radius).toBe('xl')
    expect(a.colors).toEqual({ primary: null, background: '#ffffff', surface: null, text: null })
    expect(a.elements.ocr.layout).toBe('compact')
    expect(a.elements.ocr.description).toHaveLength(200)
    expect(a.elements.signature).toEqual({ layout: null, title: null, description: null })
  })

  it('rechaza otras versiones del contrato', () => {
    expect(normalizeAppearance({ version: 2 })).toBeNull()
    expect(normalizeAppearance('x')).toBeNull()
  })
})

describe('appearanceCss', () => {
  it('sin configuración o con la de fábrica no cambia nada', () => {
    expect(appearanceCss(null)).toBe('')
    expect(appearanceCss(DEFAULT_APPEARANCE)).toBe('')
  })

  it('acento con color de texto legible y tema claro sin pisar el atributo theme', () => {
    const css = appearanceCss({ ...DEFAULT_APPEARANCE, theme: 'light', colors: { ...DEFAULT_APPEARANCE.colors, primary: '#fde047' } })
    expect(css).toContain(':host(:not([theme])) {')
    expect(css).toContain('--cortex-bg: #ffffff')
    expect(css).toContain('--cortex-on-primary: #0f172a') // amarillo → texto oscuro
    expect(onColor('#1e3a8a')).toBe('#ffffff')
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
  })

  it('lee la paleta clara también del CSS minificado del build', () => {
    expect(extractLightTokens(":host([theme='light']) {\n  --cortex-bg: #ffffff;\n}")).toBe('--cortex-bg: #ffffff;')
    expect(extractLightTokens(':host([theme=light]){--cortex-bg:#fff;--cortex-text:#0f172a}')).toBe('--cortex-bg:#fff;--cortex-text:#0f172a')
    expect(extractLightTokens(':host{--x:1}')).toBe('')
  })

  it('el layout del atributo gana al del element y al global', () => {
    const a = normalizeAppearance({ layout: 'compact', elements: { ocr: { layout: 'guided' } } })
    expect(resolveLayout(a, 'ocr', null)).toBe('guided')
    expect(resolveLayout(a, 'signature', null)).toBe('compact')
    expect(resolveLayout(a, 'ocr', 'classic')).toBe('classic')
    expect(resolveLayout(null, 'ocr', 'nope')).toBe('classic')
  })
})

describe('diseño del dashboard en los elements', () => {
  it('sin diseño guardado se ve como siempre', async () => {
    const el = mount(`<cortex-ocr api-key="${KEY}"></cortex-ocr>`)
    await settle()
    expect(wrapper(el).dataset.layout).toBe('classic')
    expect($(el, '.layout-header')).toBeNull()
    expect($(el, '.element-heading')!.textContent).toMatch(/INE, CURP/)
    expect($(el, 'style[data-appearance]')!.textContent).toBe('')
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:8000/elements/config')
  })

  it('aplica el diseño remoto: layout guiado, encabezado, progreso y acento', async () => {
    serve(GUIDED)
    const el = mount(`<cortex-ocr api-key="${KEY}"></cortex-ocr>`)
    expect(wrapper(el).classList.contains('cortex-element--pending')).toBe(true) // sin parpadeo
    await settle()
    expect(wrapper(el).dataset.layout).toBe('guided')
    expect(wrapper(el).classList.contains('cortex-element--pending')).toBe(false)
    expect($(el, '.layout-header__title')!.textContent).toMatch(/INE, CURP/)
    expect($(el, '.element-heading')).toBeNull()
    expect(el.shadowRoot!.querySelectorAll('[data-progress-step]')).toHaveLength(3)
    expect($(el, 'style[data-appearance]')!.textContent).toContain('#7c3aed')
  })

  it('una sola llamada por key aunque haya varios elements, y sessionStorage evita la espera', async () => {
    serve(GUIDED)
    document.body.innerHTML = `<cortex-ocr api-key="${KEY}"></cortex-ocr><cortex-signature api-key="${KEY}"></cortex-signature>`
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    clearAppearanceCache() // nueva carga de página, misma pestaña
    const el = mount(`<cortex-identity api-key="${KEY}"></cortex-identity>`)
    expect(wrapper(el).classList.contains('cortex-element--pending')).toBe(false)
    expect(wrapper(el).dataset.layout).toBe('guided')
  })

  it('textos propios por element', async () => {
    serve(normalizeAppearance({ elements: { signature: { title: 'Firma tu contrato', description: 'Paso final' } } }))
    const el = mount(`<cortex-signature api-key="${KEY}"></cortex-signature>`)
    await settle()
    expect(wrapper(el).dataset.layout).toBe('classic')
    expect($(el, '.layout-header__title')!.textContent).toBe('Firma tu contrato')
    expect($(el, '.layout-header__description')!.textContent).toBe('Paso final')
    expect($(el, '.layout-header__icon')).toBeNull() // el ícono es solo del layout guiado
  })

  it('el atributo layout y remote-appearance="false" mandan sobre el dashboard', async () => {
    serve(GUIDED)
    const a = mount(`<cortex-ocr api-key="${KEY}" layout="compact"></cortex-ocr>`)
    await settle()
    expect(wrapper(a).dataset.layout).toBe('compact')

    fetchMock.mockClear()
    const b = mount(`<cortex-ocr api-key="${KEY}" remote-appearance="false"></cortex-ocr>`)
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper(b).dataset.layout).toBe('classic')
  })

  it('un error al leer el diseño conserva el diseño original', async () => {
    serve(null, 401)
    const el = mount(`<cortex-ocr api-key="${KEY}"></cortex-ocr>`)
    await settle()
    expect(wrapper(el).dataset.layout).toBe('classic')
    expect(wrapper(el).classList.contains('cortex-element--pending')).toBe(false)
  })

  it('la propiedad appearance (vista previa del dashboard) funciona sin API key', () => {
    const el = mount('<cortex-identity remote-appearance="false"></cortex-identity>') as HTMLElement & { appearance: unknown }
    el.appearance = { ...DEFAULT_APPEARANCE, layout: 'compact', elements: { identity: { title: 'Valida tu identidad' } } }
    expect(wrapper(el).dataset.layout).toBe('compact')
    expect($(el, '.layout-header__title')!.textContent).toBe('Valida tu identidad')
    expect(el.shadowRoot!.querySelectorAll('.stepper__item')).toHaveLength(3) // el wizard conserva su stepper
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si el usuario ya interactuó, un diseño tardío solo cambia estilos', async () => {
    let resolve!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r))))
    const el = mount(`<cortex-ocr api-key="${KEY}"></cortex-ocr>`)
    $(el, '.dropzone')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    resolve(new Response(JSON.stringify({ config: GUIDED })))
    await settle()
    await settle()
    expect(wrapper(el).dataset.layout).toBe('classic')
    expect($(el, 'style[data-appearance]')!.textContent).toContain('#7c3aed')
  })
})
