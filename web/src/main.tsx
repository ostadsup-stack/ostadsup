import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initThemeFromStorage } from './lib/theme'
import './index.css'
import './styles/official-public-page.css'
import App from './App.tsx'

initThemeFromStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
