import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, loginWithEmail } = useAuth()
  const [isSignup, setIsSignup] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  if (!isAuthModalOpen) return null

  const formatAuthError = (err) => {
    const code = err?.code || err?.message || ''
    if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
      return 'Invalid User ID/Email or password. Please check your credentials.'
    }
    if (code.includes('email-already-in-use')) {
      return 'An account with this ID/Email already exists. Please sign in instead.'
    }
    if (code.includes('weak-password')) {
      return 'Password should be at least 6 characters long.'
    }
    if (code.includes('invalid-email')) {
      return 'Please enter a valid User ID or email address.'
    }
    return err?.message?.replace(/Firebase:\s*/i, '').replace(/Error\s*\(/i, '').replace(/\)\.?/i, '').trim() || 'Authentication failed'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setNotice('')
    if (!identifier || !password) {
      setError('Please enter your User ID/Email and password')
      return
    }

    if (isSignup) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      if (!emailRegex.test(identifier.trim())) {
        setError('Please enter a valid Google / Email address (e.g. name@gmail.com). Dummy IDs are not allowed.')
        return
      }
    }

    try {
      setError('')
      setLoading(true)
      const res = await loginWithEmail(identifier, password, isSignup, name)
      if (res?.emailVerifiedSent) {
        setNotice('✉️ Account created! We sent a verification email to your inbox. Please verify your email.')
      }
    } catch (err) {
      setError(formatAuthError(err) || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="co-overlay" aria-hidden="false" style={{ opacity: 1, visibility: 'visible', zIndex: 4000 }}>
      <button type="button" className="co-backdrop" aria-label="Close auth modal" onClick={closeAuthModal} />

      <div
        className="auth-modal-panel"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(440px, 92vw)',
          background: '#ffffff',
          borderRadius: '28px',
          padding: '36px 32px 32px',
          boxShadow: '0 30px 90px rgba(0,0,0,0.25)',
          border: '1px solid rgba(203, 32, 45,0.15)',
          overflow: 'hidden'
        }}
      >
        <div className="sheet-handle" />
        <button
          type="button"
          onClick={closeAuthModal}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0,0,0,0.05)',
            border: 'none',
            borderRadius: '50%',
            width: '34px',
            height: '34px',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            fontSize: '1rem',
            color: 'var(--ink)'
          }}
        >
          ✕
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.25em', color: 'var(--deep-green)', textTransform: 'uppercase' }}>
            AUTHENTICATION · BIRYANI BADSHAH
          </span>
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '2rem', fontWeight: 800, color: 'var(--ink)', margin: '6px 0 4px', fontStyle: 'italic' }}>
            {isSignup ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
            {isSignup ? 'Register with your valid Google / Email account for fast checkout.' : 'Sign in with your User ID or Email & Password.'}
          </p>
        </div>

        {/* Mode Switch Tabs */}
        <div style={{ display: 'flex', background: '#f5f5f0', borderRadius: '14px', padding: '4px', marginBottom: '20px' }}>
          <button
            type="button"
            onClick={() => { setIsSignup(false); setError(''); setNotice('') }}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: !isSignup ? '#ffffff' : 'transparent',
              color: !isSignup ? 'var(--deep-green)' : 'var(--muted)',
              boxShadow: !isSignup ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            🔑 SIGN IN
          </button>
          <button
            type="button"
            onClick={() => { setIsSignup(true); setError(''); setNotice('') }}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: isSignup ? '#ffffff' : 'transparent',
              color: isSignup ? 'var(--deep-green)' : 'var(--muted)',
              boxShadow: isSignup ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            ✨ REGISTER
          </button>
        </div>

        {notice && (
          <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.84rem', marginBottom: '18px', textAlign: 'center', fontWeight: '600' }}>
            {notice}
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.2)', color: '#dc3232', fontSize: '0.84rem', marginBottom: '18px', textAlign: 'center', fontWeight: '600' }}>
            ⚠️ {error}
          </div>
        )}

        {/* ID / Password Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isSignup && (
            <div className="co-field">
              <label htmlFor="auth-name">Full Name *</label>
              <input
                id="auth-name"
                type="text"
                placeholder="e.g. Muhammad Amanullah"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="co-field">
            <label htmlFor="auth-identifier">{isSignup ? 'Google / Valid Email Address *' : 'User ID / Email Address'}</label>
            <input
              id="auth-identifier"
              type="text"
              placeholder={isSignup ? "e.g. yourname@gmail.com" : "e.g. ADMIN or your@email.com"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="co-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="auth-password" style={{ margin: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: 'var(--deep-green)', fontSize: '0.76rem', fontWeight: '700', cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? '👁️ Hide' : '👁️ Show'}
              </button>
            </div>
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '16px',
              borderRadius: '999px',
              background: 'var(--deep-green)',
              color: '#ffffff',
              border: 'none',
              fontWeight: '800',
              fontSize: '0.92rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 8px 24px rgba(203, 32, 45,0.25)',
              transition: 'transform 0.15s ease, background-color 0.15s ease'
            }}
          >
            {loading ? 'Authenticating...' : isSignup ? 'Create Account' : 'Sign In Now'}
          </button>
        </form>

        {/* Footer Admin Notice */}
        <div style={{ textAlign: 'center', marginTop: '22px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '16px' }}>
          <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: 0, fontWeight: '600' }}>
            🛡️ Admin Login: Use User ID <strong style={{ color: 'var(--ink)' }}>ADMIN</strong> with authorized password.
          </p>
        </div>
      </div>
    </div>
  )
}

