/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base del backend Cortex (sin "/" final). Validada en vite.config.ts. */
  readonly VITE_CORTEX_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Vite ?inline CSS import — returns the raw CSS string
declare module '*.css?inline' {
  const content: string
  export default content
}
