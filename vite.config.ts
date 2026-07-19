import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import electron from 'vite-plugin-electron'

// Production CSP, injected only into the built index.html — the dev server needs
// inline scripts for React refresh. Monaco is bundled locally, so no remote
// origins are allowed at all.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: ghosted-file:",
  "media-src 'self' blob: ghosted-file:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
].join('; ')

const injectCsp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return {
      html,
      tags: [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend' as const,
        },
      ],
    }
  },
}

export default defineConfig({
  plugins: [
    injectCsp,
    tailwindcss(),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'node-pty',
                'chokidar',
                'gray-matter',
                'fsevents',
                '@mariozechner/pi-coding-agent',
                '@sinclair/typebox',
              ],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['@mariozechner/pi-coding-agent'],
    },
  },
  server: {
    port: 5173,
    hmr: { overlay: false },
  },
})
