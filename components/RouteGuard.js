import { useAuth } from '../context/AuthContext'
import Link from 'next/link'
import Head from 'next/head'

export default function RouteGuard({ allowedRoles = ['admin'], children }) {
  const { user, userRole, isAdmin, loading, openAuthModal } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FFFDF2' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>⏳</div>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: '#4a5568' }}>Verifying permissions...</p>
        </div>
      </div>
    )
  }

  // Check authorization
  let isAuthorized = false
  if (user && (isAdmin || userRole === 'admin' || allowedRoles.includes(userRole))) {
    isAuthorized = true
  }

  if (!isAuthorized) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#ffffff', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <Head>
          <title>403 Unauthorized Access | Biryani Badshah</title>
        </Head>
        <div style={{ maxWidth: '480px', width: '100%', background: '#1e293b', borderRadius: '24px', padding: '36px 28px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'grid', placeItems: 'center', fontSize: '2rem', margin: '0 auto 20px auto' }}>
            🚫
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ef4444', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>
            403 ACCESS DENIED
          </span>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.75rem', fontWeight: 900, margin: '8px 0 12px 0' }}>
            Restricted Portal
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 24px 0' }}>
            {!user
              ? 'Please sign in with an authorized employee account to access this operational portal.'
              : `Your account role (${(userRole || 'customer').toUpperCase()}) does not have permission to view this section.`}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!user ? (
              <button
                type="button"
                onClick={openAuthModal}
                style={{ background: '#38bdf8', color: '#0f172a', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
              >
                Sign In to Account
              </button>
            ) : null}
            <Link
              href="/"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#ffffff', padding: '14px', borderRadius: '12px', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none', display: 'block' }}
            >
              Return to Website
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return children
}
