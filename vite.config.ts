import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const PRODUCTION_API_URL = 'https://api.cortexverify.com'

/**
 * Resuelve la URL del backend que se incrusta en elements.js.
 * Orden: variable de entorno del proceso > .env.[mode] > .env > URL de producción.
 * Falla el build si la URL no es HTTPS (o http://localhost / 127.0.0.1 para desarrollo).
 */
function resolveApiUrl(mode: string): string {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const raw = (process.env.VITE_CORTEX_API_URL ?? env.VITE_CORTEX_API_URL ?? '').trim()
  if (!raw) {
    console.warn(`[cortex-elements] VITE_CORTEX_API_URL no definida; usando ${PRODUCTION_API_URL}`)
    return PRODUCTION_API_URL
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`[cortex-elements] VITE_CORTEX_API_URL inválida: "${raw}"`)
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error(`[cortex-elements] VITE_CORTEX_API_URL debe usar HTTPS (o http://localhost): "${raw}"`)
  }
  return raw.replace(/\/+$/, '')
}

// Library build — outputs dist/elements.js as a self-contained IIFE
export default defineConfig(({ mode }) => {
  const apiUrl = resolveApiUrl(mode)
  console.info(`[cortex-elements] API URL (${mode}): ${apiUrl}`)

  return {
    define: {
      'import.meta.env.VITE_CORTEX_API_URL': JSON.stringify(apiUrl),
    },
    build: {
      lib: {
        entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        name: 'CortexElements',
        formats: ['iife'],
        fileName: () => 'elements.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
      minify: 'terser',
      sourcemap: false,
      outDir: 'dist',
    },
  }
})
