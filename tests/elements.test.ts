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
  const visibleStep = (el: HTMLElement) =>
    [...$$(el, '[data-wizard-step]')].filter((s) => !s.hidden).map((s) => s.dataset.wizardStep)

  it('es un wizard de tres pasos que inicia en la INE', () => {
    const el = mount('<cortex-identity api-key="ck_live_aaaaaaaaaaaaaaaa"></cortex-identity>')
    expect($$(el, '.stepper__item')).toHaveLength(3)
    expect(visibleStep(el)).toEqual(['1'])
    expect($(el, '.stepper__item--active')!.textContent).toContain('Identificación')
    expect($(el, '.stepper__item--active')!.getAttribute('aria-current')).toBe('step')
    expect(($(el, '[data-next]') as HTMLButtonElement).disabled).toBe(true)
    expect(($(el, '[data-submit]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('paso 1 permite adjuntar o fotografiar la INE; paso 2 solo cámara', () => {
    const el = mount('<cortex-identity api-key="ck_live_aaaaaaaaaaaaaaaa" selfie-upload="true"></cortex-identity>')
    expect($$(el, '[data-wizard-step="1"] .dropzone')).toHaveLength(1)
    expect($$(el, '[data-wizard-step="1"] .camera')).toHaveLength(1)
    // aunque llegue el atributo retirado, la selfie nunca acepta archivos
    expect($$(el, '[data-wizard-step="2"] .dropzone')).toHaveLength(0)
    expect($$(el, '[data-wizard-step="2"] input[type="file"]')).toHaveLength(0)
    expect($$(el, '[data-wizard-step="2"] .camera')).toHaveLength(1)
  })

  it('al adjuntar la INE habilita continuar y avanza a la selfie', async () => {
    const el = mount('<cortex-identity api-key="ck_live_aaaaaaaaaaaaaaaa" mode="upload"></cortex-identity>')
    const steps: number[] = []
    el.addEventListener('cortex:step', (e) => steps.push((e as CustomEvent).detail.step))
    const input = $(el, '[data-wizard-step="1"] input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'ine.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))

    const next = $(el, '[data-next]') as HTMLButtonElement
    expect(next.disabled).toBe(false)
    next.click()
    expect(visibleStep(el)).toEqual(['2'])
    expect($(el, '.stepper__item--done')!.textContent).toContain('Identificación')
    expect(steps).toEqual([2])

    ;([...$$(el, '[data-wizard-step="2"] .btn')].find((b) => b.textContent === 'Atrás') as HTMLButtonElement).click()
    expect(visibleStep(el)).toEqual(['1'])
  })
})

describe('<cortex-signature>', () => {
  it('modo canvas no muestra dropzone de muestra', () => {
    const el = mount('<cortex-signature api-key="ck_live_aaaaaaaaaaaaaaaa" mode="canvas"></cortex-signature>')
    expect($$(el, '.dropzone')).toHaveLength(1) // solo la referencia
    expect($(el, '.sig-canvas__canvas')).not.toBeNull()
    expect($(el, '.sig-panel__title')!.textContent).toBe('Firma de referencia')
    expect(el.shadowRoot!.textContent).toContain('Adjuntar archivo con firma digital')
    expect(el.shadowRoot!.textContent).toContain('Dibuja la firma a verificar')
  })

  it('modo upload compara referencia vs adjunto, sin canvas', () => {
    const el = mount('<cortex-signature api-key="ck_live_aaaaaaaaaaaaaaaa" mode="upload"></cortex-signature>')
    expect($$(el, '.dropzone')).toHaveLength(2)
    expect($(el, '.sig-canvas__canvas')).toBeNull()
    expect(el.shadowRoot!.textContent).toContain('Adjuntar archivo con la firma a verificar')
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
