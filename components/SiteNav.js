import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '../context/AuthContext'

export default function SiteNav({ activePage = 'home' }) {
  const { user, isAdmin, openAuthModal, logout } = useAuth()
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const header = document.querySelector('.site-header')
    const onScroll = () => {
      if (window.scrollY > 32) header?.classList.add('scrolled')
      else header?.classList.remove('scrolled')
    }
    window.addEventListener('scroll', onScroll)
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="site-header" id="top">
      <nav className="nav container" aria-label="Primary navigation">
        <Link href="/" className="logo" aria-label="Biryani Badshah home">
          BIRYANI <span>BADSHAH</span>
        </Link>

        {user && isAdmin && (
          <Link href="/admin" className="admin-header-pill" style={pillStyle('var(--deep-green)', 'var(--yellow)', 'rgba(203, 32, 45,0.4)')}>
            🛡️ ADMIN
          </Link>
        )}

        <button
          className="nav-toggle"
          id="navToggle"
          aria-label="Toggle navigation"
          aria-expanded={isNavOpen}
          onClick={() => setIsNavOpen(!isNavOpen)}
        >
          <span />
          <span />
          <span />
        </button>

        <div
          className={`nav-backdrop ${isNavOpen ? 'visible' : ''}`}
          onClick={() => setIsNavOpen(false)}
          aria-hidden="true"
        />

        <div className={`nav-right ${isNavOpen ? 'open' : ''}`} id="navLinks">
          <Link href="/" className={activePage === 'home' ? 'active' : ''} onClick={() => setIsNavOpen(false)}>HOME</Link>
          <Link href="/menu" className={activePage === 'menu' ? 'active' : ''} onClick={() => setIsNavOpen(false)}>MENU</Link>
          <a href="/#about" onClick={() => setIsNavOpen(false)}>ABOUT</a>
          <a href="/#order" onClick={() => setIsNavOpen(false)}>ORDER</a>
          <Link href="/my-orders" className={activePage === 'orders' ? 'active' : ''} onClick={() => setIsNavOpen(false)}>MY ORDERS</Link>

          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setIsNavOpen(false)}
              style={{
                color: 'var(--yellow)',
                fontWeight: '900',
                letterSpacing: '0.08em',
                background: 'rgba(203, 32, 45,0.15)',
                padding: '6px 14px',
                borderRadius: '999px',
                border: '1px solid rgba(203, 32, 45,0.3)'
              }}
            >
              🛡️ ADMIN PORTAL
            </Link>
          )}
          <a href="/#contact" onClick={() => setIsNavOpen(false)}>CONTACT</a>

          {user ? (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(203, 32, 45,0.08)',
                  border: '1px solid rgba(203, 32, 45,0.18)',
                  padding: '6px 14px 6px 6px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  color: 'var(--deep-green)'
                }}
              >
                {user.photoURL ? (
                  <img loading="lazy" decoding="async"  src={user.photoURL} alt={user.displayName} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--deep-green)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '0.8rem', fontWeight: '800' }}>
                    {user.displayName?.charAt(0).toUpperCase() || 'U'}
                  </span>
                )}
                <span>{user.displayName?.split(' ')[0]}</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>▼</span>
              </button>

              {userMenuOpen && isMobile && (
                <div className="user-menu-backdrop" onClick={() => setUserMenuOpen(false)} />
              )}
              {userMenuOpen && (
                <div
                  className={isMobile ? 'user-menu-mobile' : ''}
                  style={isMobile ? { background: '#ffffff' } : {
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    background: '#ffffff',
                    borderRadius: '16px',
                    padding: '12px 16px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    minWidth: '200px',
                    zIndex: 2000
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '10px' }}>
                    Logged in as<br />
                    <strong style={{ color: '#ffffff', fontSize: '0.92rem' }}>{user.email}</strong>
                  </div>
                  <Link
                    href="/my-orders"
                    onClick={() => setUserMenuOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', fontSize: '0.95rem', fontWeight: '700', color: '#ffffff', textDecoration: 'none', borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                  >
                    📦 My Orders
                  </Link>
                  <Link
                    href="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', fontSize: '0.95rem', fontWeight: '700', color: '#ffffff', textDecoration: 'none', borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                  >
                    👤 My Profile
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', fontSize: '0.95rem', fontWeight: '800', color: 'var(--deep-green)', textDecoration: 'none', borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      🛡️ Admin Portal
                    </Link>
                  )}
                  <button
                    onClick={() => { logout(); setUserMenuOpen(false) }}
                    className="btn-danger"
                    style={{ marginTop: '12px' }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={openAuthModal}
              style={{
                background: 'var(--yellow)',
                border: 'none',
                color: '#ffffff',
                padding: '8px 20px',
                borderRadius: '999px',
                fontSize: '0.82rem',
                fontWeight: '800',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.08)'
              }}
            >
              SIGN IN
            </button>
          )}
        </div>
      </nav>
    </header>
  )
}

function pillStyle(bg, color, border) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: bg,
    color: color,
    border: `1px solid ${border}`,
    padding: '5px 11px',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: '900',
    textDecoration: 'none',
    letterSpacing: '0.06em',
    boxShadow: `0 4px 14px ${bg}40`,
    marginLeft: '6px'
  }
}
