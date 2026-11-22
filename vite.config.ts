import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // На Vercel и локально сайт лежит в корне, на GitHub Pages — в папке /tandem-messenger/.
  // Путь приходит из переменной окружения при сборке, в коде он доступен как import.meta.env.BASE_URL.
  base: process.env.BASE_PATH || '/',
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
