import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://jamspr95.github.io/StopSpotter/ as a GitHub Pages project site.
  base: '/StopSpotter/',
  plugins: [react(), tailwindcss()],
})
