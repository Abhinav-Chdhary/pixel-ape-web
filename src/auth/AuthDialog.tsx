import { useState, type FormEvent } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthDialogProps = { onClose: () => void }

function GoogleIcon() {
  return <svg className="oauth-icon oauth-icon-google" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.35 12.24c0-.71-.06-1.4-.18-2.06H12v3.9h5.24a4.48 4.48 0 0 1-1.94 2.94v2.53h3.14c1.84-1.7 2.91-4.2 2.91-7.31Z" />
    <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.44-2.36l-3.14-2.53c-.87.58-1.98.92-3.3.92-2.53 0-4.68-1.71-5.45-4.01H3.31v2.61A9.72 9.72 0 0 0 12 21.75Z" />
    <path fill="#FBBC05" d="M6.55 13.77A5.84 5.84 0 0 1 6.24 12c0-.61.11-1.2.31-1.77V7.62H3.31A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.06 4.38l3.24-2.61Z" />
    <path fill="#EA4335" d="M12 6.22c1.43 0 2.71.49 3.71 1.45l2.78-2.78C16.81 3.32 14.62 2.25 12 2.25a9.72 9.72 0 0 0-8.69 5.37l3.24 2.61c.77-2.3 2.92-4.01 5.45-4.01Z" />
  </svg>
}

function GitHubIcon() {
  return <svg className="oauth-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.25a9.75 9.75 0 0 0-3.08 19c.49.09.67-.21.67-.47v-1.72c-2.73.59-3.3-1.16-3.3-1.16-.45-1.13-1.09-1.43-1.09-1.43-.89-.61.07-.6.07-.6 1 .07 1.52 1.02 1.52 1.02.87 1.5 2.29 1.07 2.85.82.09-.63.35-1.07.63-1.31-2.18-.25-4.47-1.09-4.47-4.86 0-1.07.38-1.95 1.02-2.64-.1-.25-.44-1.25.1-2.6 0 0 .83-.27 2.69 1.01a9.26 9.26 0 0 1 4.9 0c1.86-1.28 2.69-1.01 2.69-1.01.54 1.35.2 2.35.1 2.6.64.69 1.02 1.57 1.02 2.64 0 3.78-2.3 4.6-4.48 4.85.35.3.67.89.67 1.79v2.65c0 .26.18.56.68.47A9.75 9.75 0 0 0 12 2.25Z" />
  </svg>
}

export function AuthDialog({ onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const authenticate = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setMessage('')
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (result.error) { setMessage(result.error.message); return }
    if (mode === 'signup' && !result.data.session) {
      setMessage('Check your email to confirm your account.')
      return
    }
    onClose()
  }

  const oauth = async (provider: 'google' | 'github') => {
    if (!supabase) return
    setBusy(true); setMessage('')
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
    if (error) { setBusy(false); setMessage(error.message) }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
      <p className="eyebrow">Pixel Ape cloud</p>
      <h2 id="auth-title">{mode === 'signin' ? 'Sign in to sync your work' : 'Create your account'}</h2>
      {!isSupabaseConfigured
        ? <p className="auth-message auth-error">Add the Supabase variables from <code>.env.example</code>, then restart the app.</p>
        : <>
          <div className="oauth-actions">
            <button disabled={busy} onClick={() => void oauth('google')}><GoogleIcon /><span>Google</span></button>
            <button disabled={busy} onClick={() => void oauth('github')}><GitHubIcon /><span>GitHub</span></button>
          </div>
          <div className="auth-divider"><span>or use email</span></div>
          <form onSubmit={(event) => void authenticate(event)}>
            <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input required minLength={8} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {message && <p className={`auth-message ${message.startsWith('Check') ? '' : 'auth-error'}`} role="status">{message}</p>}
            <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="auth-mode" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>
            {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </>}
      <button className="auth-close" aria-label="Close sign in" onClick={onClose}>×</button>
    </section>
  </div>
}
