import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import GamePage from './pages/GamePage.jsx'
import { TimerProvider } from './context/TimerContext'
import { AuthProvider } from './context/AuthContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router basename="/OutTimeCount/">
      <AuthProvider>
        <TimerProvider>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/game/:gameId" element={<GamePage />} />
          </Routes>
        </TimerProvider>
      </AuthProvider>
    </Router>
  </StrictMode>,
)
