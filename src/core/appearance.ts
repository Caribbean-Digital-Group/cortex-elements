/**
 * Diseño configurable de los elements (dashboard → Elements → Diseño).
 *
 * Precedencia (de mayor a menor):
 *   1. Lo que el integrador define en su sitio: atributos (`layout`, `theme`) y CSS sobre el tag
 *      (`cortex-ocr { --cortex-primary: … }`; las reglas de la página siempre ganan a las del shadow DOM).
 *   2. La propiedad JS `element.appearance` (la usa la vista previa del dashboard).
 *   3. El diseño guardado en el dashboard (`GET /elements/config` con la API key).
 *   4. El diseño original de los elements.
 *
 * Sin configuración, el element se ve exactamente como antes: `appearanceCss(null) === ''`.
 * Todo valor que llega a CSS pasa por listas cerradas o por la regex de color: no hay inyección posible.
 */
import tokensCss from '../styles/tokens.css?inline'
import type { ApiClient } from './api-client'
import type {
  AppearanceColors,
  ElementId,
  ElementLayout,
  ElementOverrides,
  ElementsAppearance,
} from '../types/appearance'

export const LAYOUTS: readonly ElementLayout[] = ['classic', 'compact', 'guided']
const THEMES = ['dark', 'light', 'auto'] as const
const RADII = ['none', 'sm', 'md', 'lg', 'xl'] as const
const SHADOWS = ['none', 'soft', 'strong'] as const
const FONTS = ['system', 'inherit', 'rounded', 'serif', 'mono'] as const
const ELEMENT_IDS: readonly ElementId[] = ['ocr', 'identity', 'signature']

const HEX = /^#[0-9a-f]{6}$/i
const TITLE_MAX = 80
const DESCRIPTION_MAX = 200

const EMPTY_OVERRIDES: ElementOverrides = { layout: null, title: null, description: null }

export const DEFAULT_APPEARANCE: ElementsAppearance = {
  version: 1,
  layout: 'classic',
  theme: 'dark',
  colors: { primary: null, background: null, surface: null, text: null },
  radius: 'md',
  shadow: 'none',
  font: 'system',
  elements: { ocr: { ...EMPTY_OVERRIDES }, identity: { ...EMPTY_OVERRIDES }, signature: { ...EMPTY_OVERRIDES } },
}

// ── Normalización (defensiva: el objeto puede venir del servidor o de una página) ──

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function color(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  return clean || null
}

function overrides(value: unknown): ElementOverrides {
  const v = isRecord(value) ? value : {}
  return {
    layout: LAYOUTS.includes(v.layout as ElementLayout) ? (v.layout as ElementLayout) : null,
    title: text(v.title, TITLE_MAX),
    description: text(v.description, DESCRIPTION_MAX),
  }
}

/** Objeto arbitrario → diseño válido. null si no es un objeto (o de otra versión del contrato). */
export function normalizeAppearance(raw: unknown): ElementsAppearance | null {
  if (!isRecord(raw)) return null
  if (raw.version !== undefined && raw.version !== 1) return null
  const colors = isRecord(raw.colors) ? raw.colors : {}
  const elements = isRecord(raw.elements) ? raw.elements : {}
  return {
    version: 1,
    layout: pick(raw.layout, LAYOUTS, 'classic'),
    theme: pick(raw.theme, THEMES, 'dark'),
    colors: {
      primary: color(colors.primary),
      background: color(colors.background),
      surface: color(colors.surface),
      text: color(colors.text),
    },
    radius: pick(raw.radius, RADII, 'md'),
    shadow: pick(raw.shadow, SHADOWS, 'none'),
    font: pick(raw.font, FONTS, 'system'),
    elements: Object.fromEntries(ELEMENT_IDS.map((id) => [id, overrides(elements[id])])) as Record<
      ElementId,
      ElementOverrides
    >,
  }
}

// ── Resolución por element ────────────────────────────────────────────────────

/** Atributo `layout` del integrador > ajuste del element > global > classic. */
export function resolveLayout(appearance: ElementsAppearance | null, id: ElementId, attr: string | null): ElementLayout {
  if (attr && LAYOUTS.includes(attr as ElementLayout)) return attr as ElementLayout
  return appearance?.elements[id].layout ?? appearance?.layout ?? 'classic'
}

export function customCopy(appearance: ElementsAppearance | null, id: ElementId): { title: string | null; description: string | null } {
  const o = appearance?.elements[id]
  return { title: o?.title ?? null, description: o?.description ?? null }
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const RADIUS_VALUES: Record<ElementsAppearance['radius'], [string, string] | null> = {
  none: ['0', '0'],
  sm: ['0.375rem', '0.25rem'],
  md: null, // tokens.css
  lg: ['1rem', '0.75rem'],
  xl: ['1.5rem', '1rem'],
}

const SHADOW_VALUES: Record<ElementsAppearance['shadow'], string | null> = {
  none: null,
  soft: '0 10px 30px -12px rgba(15, 23, 42, 0.35)',
  strong: '0 24px 60px -18px rgba(15, 23, 42, 0.6)',
}

const FONT_VALUES: Record<ElementsAppearance['font'], string | null> = {
  system: null,
  inherit: 'inherit',
  rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
}

/**
 * Declaraciones de un bloque `:host([theme='light']) { … }` de tokens.css. Tolera la forma minificada
 * del build (`:host([theme=light]){…}`, sin comillas ni espacios).
 */
export function extractLightTokens(css: string): string {
  return /:host\(\[theme=(['"]?)light\1\]\)\s*\{([^}]*)\}/.exec(css)?.[2]?.trim() ?? ''
}

/** Paleta clara, tomada de tokens.css (una sola fuente). */
const LIGHT_TOKENS = extractLightTokens(tokensCss)

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Texto sobre el color de acento: blanco o casi negro, el de mayor contraste. */
export function onColor(hex: string): string {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#0f172a') ? '#ffffff' : '#0f172a'
}

function surfaceRules(c: AppearanceColors): string[] {
  const rules: string[] = []
  if (c.background) rules.push(`--cortex-bg: ${c.background};`, `--cortex-overlay: color-mix(in srgb, ${c.background} 85%, transparent);`)
  if (c.surface) rules.push(`--cortex-surface: ${c.surface};`)
  if (c.text) rules.push(`--cortex-text: ${c.text};`)
  if (c.surface || c.text) rules.push('--cortex-surface-hover: color-mix(in srgb, var(--cortex-surface) 88%, var(--cortex-text));')
  if (c.background || c.text) {
    rules.push(
      '--cortex-text-muted: color-mix(in srgb, var(--cortex-text) 62%, var(--cortex-bg));',
      '--cortex-border: color-mix(in srgb, var(--cortex-text) 14%, transparent);',
    )
  }
  return rules
}

/**
 * Hoja de estilos del diseño, para un `<style>` dentro del shadow DOM (después de los estilos base).
 * Selectores con la misma especificidad que `:host([theme='light'])` para ganarle por orden.
 */
export function appearanceCss(appearance: ElementsAppearance | null): string {
  if (!appearance) return ''
  const blocks: string[] = []

  // 1. Tema por configuración (solo si el integrador no fijó `theme`)
  if (appearance.theme === 'light' && LIGHT_TOKENS) blocks.push(`:host(:not([theme])) { ${LIGHT_TOKENS} }`)
  if (appearance.theme === 'auto' && LIGHT_TOKENS) {
    blocks.push(`@media (prefers-color-scheme: light) { :host(:not([theme])) { ${LIGHT_TOKENS} } }`)
  }

  // 2. Superficies propias (también solo sin `theme` del integrador)
  const surfaces = surfaceRules(appearance.colors)
  if (surfaces.length) blocks.push(`:host(:not([theme])) { ${surfaces.join(' ')} }`)

  // 3. Acento, forma y tipografía: siempre
  const always: string[] = []
  const primary = appearance.colors.primary
  if (primary) {
    always.push(
      `--cortex-primary: ${primary};`,
      `--cortex-primary-hover: color-mix(in srgb, ${primary} 85%, #000000);`,
      `--cortex-on-primary: ${onColor(primary)};`,
      `--cortex-border-focus: color-mix(in srgb, ${primary} 60%, transparent);`,
    )
  }
  const radius = RADIUS_VALUES[appearance.radius]
  if (radius) always.push(`--cortex-radius: ${radius[0]};`, `--cortex-radius-sm: ${radius[1]};`)
  const shadow = SHADOW_VALUES[appearance.shadow]
  if (shadow) always.push(`--cortex-shadow: ${shadow};`)
  const font = FONT_VALUES[appearance.font]
  if (font) always.push(`--cortex-font: ${font};`)
  if (always.length) blocks.push(`:host, :host([theme]), :host(:not([theme])) { ${always.join(' ')} }`)

  return blocks.join('\n')
}

// ── Configuración remota ──────────────────────────────────────────────────────

const STORAGE_PREFIX = 'cortex-appearance:'
const STORAGE_TTL_MS = 10 * 60_000

/** Promesa compartida por todos los elements de la página con la misma key (una sola llamada). */
const inflight = new Map<string, Promise<ElementsAppearance | null>>()

function storageKey(cacheKey: string): string {
  // FNV-1a: no guardar la API key en claro como nombre de la entrada
  let h = 0x811c9dc5
  for (let i = 0; i < cacheKey.length; i++) h = Math.imul(h ^ cacheKey.charCodeAt(i), 0x01000193)
  return STORAGE_PREFIX + (h >>> 0).toString(36)
}

/** Diseño guardado en esta pestaña (para pintar sin parpadeo en la siguiente carga). undefined = no hay. */
export function cachedAppearance(cacheKey: string): ElementsAppearance | null | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(cacheKey))
    if (!raw) return undefined
    const { at, config } = JSON.parse(raw) as { at: number; config: unknown }
    if (Date.now() - at > STORAGE_TTL_MS) return undefined
    return config === null ? null : normalizeAppearance(config)
  } catch {
    return undefined
  }
}

function remember(cacheKey: string, config: ElementsAppearance | null): void {
  try {
    sessionStorage.setItem(storageKey(cacheKey), JSON.stringify({ at: Date.now(), config }))
  } catch {
    /* almacenamiento bloqueado: se vuelve a pedir en la siguiente carga */
  }
}

/**
 * Diseño de la cuenta dueña de la key. Nunca lanza: ante cualquier error (key inválida, red,
 * backend sin el endpoint) devuelve null y el element conserva su diseño por defecto.
 */
export function loadRemoteAppearance(client: ApiClient, cacheKey: string): Promise<ElementsAppearance | null> {
  let pending = inflight.get(cacheKey)
  if (!pending) {
    pending = client
      .getElementsConfig()
      .then((res) => {
        const config = normalizeAppearance(res.config)
        remember(cacheKey, config)
        return config
      })
      .catch(() => {
        inflight.delete(cacheKey) // permitir reintentar en otra carga del element
        return null
      })
    inflight.set(cacheKey, pending)
  }
  return pending
}

/** Solo para pruebas. */
export function clearAppearanceCache(): void {
  inflight.clear()
}
