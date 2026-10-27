import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setupWorker } from 'msw/browser'
import { handlers } from './mocks/handlers.js'
import './index.css'
import App from './App.jsx'

// Start the mock backend before the first API call.
const worker = setupWorker(...handlers)
await worker.start({
  serviceWorker: { url: import.meta.env.BASE_URL + 'mockServiceWorker.js' },
  onUnhandledRequest: 'bypass',
  quiet: true,
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
