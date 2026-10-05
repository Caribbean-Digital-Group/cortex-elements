/** Atributos que se reflejan como propiedades aunque no se observen (solo afectan CSS/presentación). */
const PRESENTATION_ATTRIBUTES = ['theme', 'show-result']

const camelize = (attr: string) => attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

/**
 * Define una propiedad JS por cada atributo (`document-type` ⇄ `el.documentType`).
 *
 * Frameworks como Vue asignan propiedades en lugar de atributos cuando la propiedad
 * existe en el elemento; con este reflejo ambas formas funcionan y el cambio siempre
 * pasa por attributeChangedCallback.
 */
export function reflectAttributes(ctor: CustomElementConstructor & { observedAttributes?: string[] }): void {
  const attrs = new Set([...(ctor.observedAttributes ?? []), ...PRESENTATION_ATTRIBUTES])
  for (const attr of attrs) {
    const prop = camelize(attr)
    if (prop in ctor.prototype) continue // nunca pisar miembros existentes
    Object.defineProperty(ctor.prototype, prop, {
      configurable: true,
      enumerable: true,
      get(this: HTMLElement) {
        return this.getAttribute(attr)
      },
      set(this: HTMLElement, value: unknown) {
        if (value === null || value === undefined || value === false) this.removeAttribute(attr)
        else this.setAttribute(attr, value === true ? 'true' : String(value))
      },
    })
  }
}
