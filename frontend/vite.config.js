import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Send /api calls to the Node backend during development.
    proxy: { '/api': 'http://localhost:4000' },
  },
})
