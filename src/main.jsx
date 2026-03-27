import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { TimerProvider } from './context/TimerContext'
import { AuthProvider } from './context/AuthContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <TimerProvider>
        <App />
      </TimerProvider>
    </AuthProvider>
  </StrictMode>,
)
