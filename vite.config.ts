import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GitHub Pages serves static files only. A deep link such as /Aio-Ki/memory has no
 * file behind it, so Pages falls back to 404.html. Shipping a byte-identical copy of
 * index.html under that name makes every route boot the SPA with the URL intact —
 * no redirect hop, no hash fragment, no flash of a 404 page.
 */
function spaFallback(): Plugin {
  return {
    name: 'aio-spa-fallback',
    apply: 'build',
    closeBundle() {
      const out = resolve(__dirname, 'dist')
      const index = resolve(out, 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve(out, '404.html'))
    },
  }
}

// Repo pages live under /<repo>/. Overridable so the same build works on a custom
// domain (BASE_PATH=/) or a fork with a different repository name.
const base = process.env.BASE_PATH ?? '/Aio-Ki/'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? base : '/',
  plugins: [react(), spaFallback()],
  build: {
    target: 'es2020',
    cssTarget: 'chrome100',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, host: true },
}))
