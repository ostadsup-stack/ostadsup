import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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
