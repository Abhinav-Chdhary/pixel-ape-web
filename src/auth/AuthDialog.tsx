import { useState, type FormEvent } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthDialogProps = { onClose: () => void }

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
            <button disabled={busy} onClick={() => void oauth('google')}>Continue with Google</button>
            <button disabled={busy} onClick={() => void oauth('github')}>Continue with GitHub</button>
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
