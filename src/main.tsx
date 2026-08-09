import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterApp } from './RouterApp'
import { AuthProvider } from './auth/AuthContext'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><RouterApp /></AuthProvider>
  </StrictMode>,
)
