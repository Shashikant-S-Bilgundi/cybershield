import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// The API runs separately (shieldops-api, port 4000). In development and preview,
// /api (the console) and /ingest (telemetry from your apps) are forwarded to it,
// so the session cookie stays on the frontend's own origin.
const target = process.env.SHIELDOPS_API ?? 'http://localhost:4000'
// Trailing slash on /ingest/: without it, the /ingestion page itself would be forwarded too.
const api = { '/api/': { target, changeOrigin: false }, '/ingest/': { target, changeOrigin: false } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, proxy: api },
  preview: { proxy: api },
})