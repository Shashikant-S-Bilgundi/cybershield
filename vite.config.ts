import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// The API runs separately (shieldops-api, port 4000). In development and preview,
// /api is forwarded to it so the session cookie stays on the frontend's own origin.
const api = { '/api': { target: process.env.SHIELDOPS_API ?? 'http://localhost:4000', changeOrigin: false } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, proxy: api },
  preview: { proxy: api },
})