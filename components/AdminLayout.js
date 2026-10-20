import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../context/AuthContext'
import { ROLES, STAFF_ALLOWED_PAGES } from '../lib/roles'
import AuthModal from './AuthModal'
import AdminNotificationListener from './AdminNotificationListener'

export default function AdminLayout({ children, activePage = 'dashboard', title = 'Admin Portal' }) {
  const router = useRouter()
  const { user, userRole, isAdmin, logout, openAuthModal } = useAuth()
  const isStaff = userRole === ROLES.STAFF
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', background: '#FFFDF2', display: 'grid', placeItems: 'center', color: '#CB202D', fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>⏳</div>
          <p style={{ fontWeight: 800, fontSize: '0.95rem' }}>Loading Admin Portal...</p>
        </div>
      </div>
    )
  }

  const staffPageBlocked = isStaff && !STAFF_ALLOWED_PAGES.includes(activePage)

  if (!user || (!isAdmin && !isStaff) || staffPageBlocked) {
    return (
      <div className="admin-access-screen">
        <div className="admin-access-card">
          <div className="access-icon">🛡️</div>
          <h1>Admin Access Required</h1>
          <p>
            {user
              ? `Logged in as ${user.email}. This account is not authorized for Patna Admin privileges.`
              : 'Please sign in with an authorized Admin account to access the Patna Admin Desk.'}
          </p>

          {!user ? (
            <button type="button" onClick={openAuthModal} className="btn admin-signin-btn">
              🔑 SIGN IN WITH ADMIN ACCOUNT
            </button>
          ) : (
            <button type="button" onClick={logout} className="btn admin-logout-btn">
              LOG OUT & SWITCH ACCOUNT
            </button>
          )}

          <div style={{ marginTop: '20px' }}>
            <Link href="/" className="back-link">
              ← Return to Main Storefront
            </Link>
          </div>
        </div>
        <AuthModal />
      </div>
    )
  }

  const allNavItems = [
    { key: 'dashboard', label: 'Overview', href: '/admin', icon: '📊', minRole: ROLES.CUSTOMER },
    { key: 'orders', label: 'Live Orders', href: '/admin/orders', icon: '📦', minRole: ROLES.CUSTOMER },
    { key: 'all-orders', label: 'All Orders', href: '/admin/all-orders', icon: '📋', minRole: ROLES.CUSTOMER },
    { key: 'menu', label: 'Dish Menu', href: '/admin/menu', icon: '🍛', minRole: ROLES.ADMIN },
    { key: 'coupons', label: 'Coupons', href: '/admin/coupons', icon: '🎟️', minRole: ROLES.ADMIN },
    { key: 'users', label: 'Customers', href: '/admin/users', icon: '👤', minRole: ROLES.ADMIN },
    { key: 'settings', label: 'Settings', href: '/admin/settings', icon: '⚙️', minRole: ROLES.ADMIN },
  ]
  const TIER_RANK = { [ROLES.CUSTOMER]: 0, [ROLES.STAFF]: 1, [ROLES.ADMIN]: 2 }
  const myRole = isStaff ? ROLES.STAFF : ROLES.ADMIN
  const navItems = allNavItems.filter(i => TIER_RANK[myRole] >= TIER_RANK[i.minRole])

  return (
    <div className="admin-root-shell">
      <Head>
        <title>{title} | Biryani Badshah Admin</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      {/* --- MOBILE TOP HEADER BAR (< 1024px) --- */}
      <header className="admin-mobile-header">
        <div className="header-brand-wrap">
          <span className="brand-badge">PATNA ADMIN</span>
          <h1 className="header-page-title">{title}</h1>
        </div>

        <button
          type="button"
          className="admin-menu-toggle"
          onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
          aria-label="Toggle Navigation Drawer"
        >
          {mobileDrawerOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* --- MOBILE SLIDE DRAWER (< 1024px) --- */}
      <div className={`admin-drawer-overlay ${mobileDrawerOpen ? 'open' : ''}`} onClick={() => setMobileDrawerOpen(false)}>
        <aside className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-header">
            <span className="drawer-sub">PATNA DESK CONTROL</span>
            <h2>Biryani Badshah</h2>
            <p className="admin-user-email">{user.email}</p>
          </div>

          <nav className="drawer-nav">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`drawer-link ${activePage === item.key ? 'active' : ''}`}
                onClick={() => setMobileDrawerOpen(false)}
              >
                <span className="link-icon">{item.icon}</span>
                <span className="link-label">{item.label}</span>
              </Link>
            ))}

            <Link href="/" className="drawer-link store-link">
              <span className="link-icon">🏪</span>
              <span className="link-label">View Live Storefront</span>
            </Link>

            <button type="button" onClick={logout} className="drawer-link logout-link">
              <span className="link-icon">🚪</span>
              <span className="link-label">Log Out</span>
            </button>
          </nav>
        </aside>
      </div>

      {/* --- DESKTOP SIDEBAR (>= 1024px) --- */}
      <aside className="admin-desktop-sidebar">
        <div>
          <div className="sidebar-brand">
            <span className="sidebar-tag">PATNA DESK</span>
            <h2 className="sidebar-logo">Biryani Badshah</h2>
            <span className="sidebar-role">{isStaff ? "Staff Access · Orders Desk" : "Admin Control Panel"}</span>
          </div>

          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`sidebar-link ${activePage === item.key ? 'active' : ''}`}
                style={{ position: 'relative' }}
              >
                <span className="link-icon">{item.icon}</span>
                <span className="link-label">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="admin-profile-chip">
            <div className="avatar-dot">👑</div>
            <div className="profile-text">
              <strong>{user.displayName || 'Admin'}</strong>
              <span>{user.email}</span>
            </div>
          </div>

          <div className="sidebar-bottom-actions">
            <Link href="/" className="sidebar-btn store-btn">
              🏪 Storefront
            </Link>
            <button type="button" onClick={logout} className="sidebar-btn logout-btn">
              🚪 Log Out
            </button>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT VIEWPORT --- */}
      <main className="admin-main-viewport">
        {children}
      </main>

      {/* --- MOBILE BOTTOM QUICK TAB BAR (< 1024px) --- */}
      <nav className="admin-mobile-bottom-bar">
        <Link href="/admin" className={`adm-tab ${activePage === 'dashboard' ? 'active' : ''}`}>
          <span className="adm-icon">📊</span>
          <span className="adm-label">Overview</span>
        </Link>
        <Link href="/admin/orders" className={`adm-tab ${activePage === 'orders' ? 'active' : ''}`}>
          <span className="adm-icon">📦</span>
          <span className="adm-label">Orders</span>
        </Link>
        {myRole === ROLES.ADMIN && (
          <Link href="/admin/menu" className={`adm-tab ${activePage === 'menu' ? 'active' : ''}`}>
            <span className="adm-icon">🍛</span>
            <span className="adm-label">Menu</span>
          </Link>
        )}
      </nav>

      {/* Global Realtime Admin Order Notification Listener */}
      <AdminNotificationListener />
    </div>
  )
}
