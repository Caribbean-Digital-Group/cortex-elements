// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(async () => {
  // happy-dom no implementa canvas 2D; basta un stub para renderizar el área de firma
  HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, { get: (_t, prop) => (prop === 'canvas' ? this : () => undefined), set: () => true })
  } as unknown as HTMLCanvasElement['getContext']
  await import('../src/index')
})

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

const $ = (el: HTMLElement, selector: string) => el.shadowRoot!.querySelector<HTMLElement>(selector)
const $$ = (el: HTMLElement, selector: string) => el.shadowRoot!.querySelectorAll<HTMLElement>(selector)

describe('<cortex-ocr>', () => {
  it('renderiza una sola captura por defecto', () => {
    const el = mount('<cortex-ocr api-key="ck_live_aaaaaaaaaaaaaaaa"></cortex-ocr>')
    expect($$(el, '.slot')).toHaveLength(1)
    expect($(el, '.element-heading')!.textContent).toMatch(/INE, CURP/)
    expect($(el, '.dropzone input')!.getAttribute('accept')).toContain('.xml')
  })

  it('pide anverso y reverso para INE con sides="both"', () => {
    const el = mount('<cortex-ocr api-key="ck_live_aaaaaaaaaaaaaaaa" document-type="ine" sides="both"></cortex-ocr>')
    expect($$(el, '.slot')).toHaveLength(2)
    expect(($(el, '[data-submit]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('re-renderiza al cambiar atributos', () => {
    const el = mount('<cortex-ocr api-key="ck_live_aaaaaaaaaaaaaaaa" document-type="curp"></cortex-ocr>')
    expect($(el, '.element-heading')!.textContent).toContain('CURP')
    el.setAttribute('document-type', 'csf')
    expect($(el, '.element-heading')!.textContent).toContain('Constancia')
  })
})

describe('<cortex-identity>', () => {
  it('muestra la selfie solo después de la identificación', () => {
    const el = mount('<cortex-identity api-key="ck_live_aaaaaaaaaaaaaaaa"></cortex-identity>')
    const slots = $$(el, '.slot')
    expect(slots).toHaveLength(2)
    expect(slots[1]!.hidden).toBe(true)
    expect(($(el, '[data-submit]') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('<cortex-signature>', () => {
  it('modo canvas no muestra dropzone de muestra', () => {
    const el = mount('<cortex-signature api-key="ck_live_aaaaaaaaaaaaaaaa" mode="canvas"></cortex-signature>')
    expect($$(el, '.dropzone')).toHaveLength(1) // solo la referencia
    expect($(el, '.sig-canvas__canvas')).not.toBeNull()
  })
})

describe('propiedades reflejadas (integración con Vue/React)', () => {
  it('asignar una propiedad actualiza el atributo y re-renderiza', () => {
    const el = mount('<cortex-ocr api-key="ck_live_aaaaaaaaaaaaaaaa"></cortex-ocr>') as HTMLElement & Record<string, unknown>
    el.documentType = 'curp'
    expect(el.getAttribute('document-type')).toBe('curp')
    expect($(el, '.element-heading')!.textContent).toContain('CURP')
    el.engine = 'glm'
    expect(el.getAttribute('engine')).toBe('glm')
    el.apiKey = 'ck_live_bbbbbbbbbbbbbbbb'
    expect(el.getAttribute('api-key')).toBe('ck_live_bbbbbbbbbbbbbbbb')
    el.theme = 'light'
    expect(el.getAttribute('theme')).toBe('light')
  })

  it('no pisa onResult ni métodos públicos', () => {
    const el = mount('<cortex-signature api-key="ck_live_aaaaaaaaaaaaaaaa"></cortex-signature>') as HTMLElement & Record<string, unknown>
    expect(typeof el.reset).toBe('function')
    el.threshold = 0.9
    expect(el.getAttribute('threshold')).toBe('0.9')
  })
})
