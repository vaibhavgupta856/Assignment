import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the FastAPI backend runs on :8000; proxy API calls to it so
// the frontend can always use same-origin `/api/...` URLs (as in production).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:8000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Charts are the bulk of the bundle; a separate chunk caches well.
        manualChunks: { charts: ['recharts'], react: ['react', 'react-dom'] },
      },
    },
  },
})
