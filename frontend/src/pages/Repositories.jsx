import { useMemo } from 'react'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import ConnectGitHub from '../components/ConnectGitHub.jsx'
import ScanPanel from '../components/ScanPanel.jsx'

// The Connect GitHub flow uses MUI; this theme matches the app's tokens.
export default function Repositories() {
  const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: '#5457E6' },
      background: mode === 'dark' ? { default: '#0A0B0F', paper: '#12141A' } : { default: '#F6F7F9', paper: '#FFFFFF' },
    },
    shape: { borderRadius: 10 },
    typography: { fontFamily: "'Inter', system-ui, sans-serif", button: { textTransform: 'none', fontWeight: 500 } },
  }), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <main className="content"><ScanPanel /><ConnectGitHub /></main>
    </ThemeProvider>
  )
}
