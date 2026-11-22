import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './hooks/useAuth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename: на GitHub Pages приложение живёт не в корне домена */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Service worker — только в собранном приложении: в dev он кеширует модули Vite и мешает HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch((e) => console.error('SW:', e))
  })
}
