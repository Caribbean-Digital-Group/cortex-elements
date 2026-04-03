/// <reference types="vite/client" />

// Vite ?inline CSS import — returns the raw CSS string
declare module '*.css?inline' {
  const content: string
  export default content
}
