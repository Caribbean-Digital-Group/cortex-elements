/**
 * Diseño de los elements configurado en el dashboard (contrato `version: 1`).
 * Fuente de verdad: `cortex/app/models/elements.py`. Lo edita `cortex-verify` (Elements → Diseño).
 */

export type ElementId = 'ocr' | 'identity' | 'signature'

/** classic = diseño original · compact = denso, para formularios · guided = encabezado, progreso y CTA grandes. */
export type ElementLayout = 'classic' | 'compact' | 'guided'
export type AppearanceTheme = 'dark' | 'light' | 'auto'
export type AppearanceRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type AppearanceShadow = 'none' | 'soft' | 'strong'
export type AppearanceFont = 'system' | 'inherit' | 'rounded' | 'serif' | 'mono'

export interface AppearanceColors {
  /** Acento (#rrggbb). Siempre se aplica. */
  primary: string | null
  /** Fondo, superficie y texto: solo si el integrador no fija `theme` en el HTML. */
  background: string | null
  surface: string | null
  text: string | null
}

export interface ElementOverrides {
  layout: ElementLayout | null
  title: string | null
  description: string | null
}

export interface ElementsAppearance {
  version: 1
  layout: ElementLayout
  theme: AppearanceTheme
  colors: AppearanceColors
  radius: AppearanceRadius
  shadow: AppearanceShadow
  font: AppearanceFont
  elements: Record<ElementId, ElementOverrides>
}
