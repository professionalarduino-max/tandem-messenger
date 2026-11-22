import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  // Собранная версия: на ней работает service worker и установка приложения.
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
