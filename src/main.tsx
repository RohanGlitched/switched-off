import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

if (import.meta.env.DEV) {
  void Promise.all([import('./lib/write'), import('./lib/wallet'), import('./lib/arkiv')]).then(([w, wa, a]) => Object.assign(window, { __so: { ...w, ...wa, ...a } }))
}
