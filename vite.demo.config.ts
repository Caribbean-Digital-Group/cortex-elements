import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// process.cwd() is always the project root when invoked via `npm run`
const projectRoot = process.cwd()

/**
 * Serves dist/elements.js at /elements.js as a raw static file.
 * Bypasses Vite's module transformation pipeline so the IIFE
 * is delivered as-is to the browser.
 */
function serveElementsIife(): Plugin {
  const iifePath = join(projectRoot, 'dist', 'elements.js')
  return {
    name: 'cortex:serve-elements-iife',
    configureServer(server) {
      server.middlewares.use('/elements.js', (_req, res) => {
        if (!existsSync(iifePath)) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'text/plain')
          res.end('elements.js no encontrado — ejecuta: npm run build-only')
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.end(readFileSync(iifePath))
      })
    },
  }
}

export default defineConfig({
  root: join(projectRoot, 'demo'), // HTML served from demo/
  publicDir: false,
  server: {
    port: 5174,
    open: '/',
  },
  plugins: [serveElementsIife()],
})
