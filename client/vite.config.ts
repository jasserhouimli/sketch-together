import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local API during development; production serves client + API same-origin.
    proxy: {
      "/api": "http://localhost:5248",
    },
  },
})
