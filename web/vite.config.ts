import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const ostadiDebugLogFile = path.join(repoRoot, '.cursor', 'debug-8bf7a6.log')

function attachOstadiDebugLogMiddleware(server: ViteDevServer | PreviewServer) {
  server.middlewares.use('/__ostadi-debug-log', (req, res, next) => {
    if (req.method !== 'POST') {
      next()
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8')
        fs.mkdirSync(path.dirname(ostadiDebugLogFile), { recursive: true })
        fs.appendFileSync(ostadiDebugLogFile, `${body.trim()}\n`, 'utf8')
      } catch {
        /* ignore */
      }
      res.statusCode = 204
      res.end()
    })
  })
}

/** Writes NDJSON debug lines from the browser (same-origin) — avoids CORS to external ingest. */
function ostadiDebugSessionLogPlugin(): Plugin {
  return {
    name: 'ostadi-debug-session-log',
    configureServer(server) {
      attachOstadiDebugLogMiddleware(server)
    },
    configurePreviewServer(server) {
      attachOstadiDebugLogMiddleware(server)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    // Listen on all interfaces so the app works from another device, WSL→Windows browser, etc.
    host: true,
    proxy: {
      // Same-origin proxy so browser debug logs reach Cursor ingest (avoids CORS to 127.0.0.1:7637)
      '/ingest/f0c09a95-b44d-42bb-8f9c-35b59e649cba': {
        target: 'http://127.0.0.1:7637',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    proxy: {
      '/ingest/f0c09a95-b44d-42bb-8f9c-35b59e649cba': {
        target: 'http://127.0.0.1:7637',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    ostadiDebugSessionLogPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Ostadi',
        short_name: 'Ostadi',
        description: 'منصة الأستاذ والفوج',
        lang: 'ar',
        dir: 'rtl',
        display: 'standalone',
        theme_color: '#0c2d5e',
        background_color: '#ffffff',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png}'],
      },
    }),
  ],
})
