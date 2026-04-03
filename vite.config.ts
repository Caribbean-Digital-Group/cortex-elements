import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// Library build — outputs dist/elements.js as a self-contained IIFE
export default defineConfig({
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
})
