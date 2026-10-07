import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { useAppStore } from './store/useAppStore'
import './lib/leafletIconFix'
import './index.css'

// Fire-and-forget: fetches the live feed and wires up the auth listener when
// Supabase is configured; a no-op otherwise. Screens read `backendReady` /
// the store's state rather than awaiting this directly.
void useAppStore.getState().initRealBackend()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
