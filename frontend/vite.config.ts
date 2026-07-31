import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Cache-busting plugin: appends a unique timestamp to all script/style src attrs
// so browsers always fetch the freshest bundle after a rebuild.
function cacheBust(): { name: string; generateBundle(options: any, bundle: any): void } {
  return {
    name: 'cache-bust',
    generateBundle(_options, bundle) {
      const ts = Date.now().toString(36);
      for (const fileName of Object.keys(bundle)) {
        if (fileName.endsWith('.html')) {
          const file = bundle[fileName] as { source?: string };
          if (file.source) {
            file.source = (file.source as string)
              .replace(/src="(\/assets\/[^"]+\.js)"/g, `src="$1?v=${ts}"`)
              .replace(/href="(\/assets\/[^"]+\.css)"/g, `href="$1?v=${ts}"`);
          }
        }
      }
    },
  };
}

// https://vitejs.dev/config/
// Single-port mode: backend (FastAPI) on 127.0.0.1:8000 serves frontend + /api.
// Vite dev server is NOT used in production; this config exists for
// `npm run dev:watch` (build-only watcher) and any optional local development.
// No proxy is configured — frontend talks to /api on the same origin.
export default defineConfig({
  plugins: [react(), cacheBust()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: true,
    // Dev only: forward /api to the local FastAPI backend (127.0.0.1:8000).
    // Production still serves frontend + /api from the same origin.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
