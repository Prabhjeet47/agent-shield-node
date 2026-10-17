import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getThemeChoice, resolvedTheme } from './lib/theme.js'

// Dark is the default; a saved choice from the theme button or Settings wins.
document.documentElement.dataset.theme = resolvedTheme(getThemeChoice())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
