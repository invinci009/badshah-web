import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '../context/AuthContext'
import SiteNav from '../components/SiteNav'
import MobileBottomBar from '../components/MobileBottomBar'

export default function ProfilePage() {
  const { user, userProfile, isAdmin, updateUserProfileData, logout, openAuthModal } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isNavOpen, setIsNavOpen] = useState(false)

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name || user?.displayName || '')
      setPhone(userProfile.phone || '')
      setAddress(userProfile.defaultAddress || '')
    }
  }, [userProfile, user])

  if (!user) {
    return (
      <>
        <Head>
          <title>My Profile | Biryani Badshah</title>
        </Head>
        <SiteNav activePage="profile" />
        <div style={{ minHeight: '80vh', display: 'grid', placeItems: 'center', background: 'var(--cream)', padding: '120px 20px' }}>
          <div className="empty-state" style={{ maxWidth: '400px' }}>
            <span className="empty-state-icon">{'\u{1F464}'}</span>
            <h2>Authentication Required</h2>
            <p>Please sign in to view and edit your profile.</p>
            <button onClick={openAuthModal} className="btn">SIGN IN</button>
          </div>
        </div>
        <MobileBottomBar activeTab="profile" />
      </>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      setMessage('')
      await updateUserProfileData({
        name,
        phone,
        defaultAddress: address,
      })
      setMessage('Profile updated successfully! \u2728')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      console.error(err)
      setMessage('Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Head>
        <title>My Profile | Biryani Badshah</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <SiteNav activePage="profile" />

      <main style={{ minHeight: '80vh', padding: '100px 0 80px 0', background: 'var(--cream)' }}>
        <div className="container" style={{ maxWidth: '640px' }}>
          <div className="profile-card-mobile" style={{ background: '#ffffff', borderRadius: '28px', padding: '36px 32px', border: '1px solid rgba(203, 32, 45,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.04)' }}>
            
            {/* Profile Avatar Section */}
            <div className="profile-avatar-section" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px', paddingBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              {user.photoURL ? (
                <img loading="lazy" decoding="async"  src={user.photoURL} alt={user.displayName} style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--deep-green)', color: '#ffffff', fontSize: '2rem', fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {user.displayName?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div>
                <h1 style={{ fontSize: 'clamp(1.3rem, 4vw, 1.6rem)', fontWeight: 900, color: 'var(--ink)', margin: '0 0 4px 0' }}>
                  {userProfile?.name || user.displayName}
                </h1>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)', wordBreak: 'break-all' }}>{user.email}</span>
                <div style={{ marginTop: '6px' }}>
                  <span className="status-badge" style={{ fontSize: '0.65rem', background: 'rgba(203, 32, 45,0.1)', color: 'var(--deep-green)' }}>
                    ROLE: {userProfile?.role || 'Customer'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="quick-actions-grid" style={{ marginBottom: '24px' }}>
              <Link href="/my-orders" className="quick-action-card">
                <span className="qa-icon">{'\u{1F4E6}'}</span>
                <span className="qa-label">My Orders</span>
              </Link>
              <Link href="/menu" className="quick-action-card">
                <span className="qa-icon">{'\u{1F35B}'}</span>
                <span className="qa-label">Order Food</span>
              </Link>
              <a href="https://wa.me/919693999890" target="_blank" rel="noopener noreferrer" className="quick-action-card">
                <span className="qa-icon">{'\u{1F4AC}'}</span>
                <span className="qa-label">Contact Us</span>
              </a>
              <a href="https://maps.app.goo.gl/edZ9PRNyhbUr4Que6" target="_blank" rel="noopener noreferrer" className="quick-action-card">
                <span className="qa-icon">{'\u{1F4CD}'}</span>
                <span className="qa-label">Find Us</span>
              </a>
            </div>

            {message && (
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(203, 32, 45,0.1)', border: '1px solid rgba(203, 32, 45,0.2)', color: 'var(--deep-green)', fontWeight: 700, fontSize: '0.88rem', marginBottom: '20px', textAlign: 'center' }}>
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="co-field">
                <label htmlFor="prof-name">Full Name</label>
                <input
                  id="prof-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  required
                />
              </div>

              <div className="co-field">
                <label htmlFor="prof-email">Email Address (Read-only)</label>
                <input
                  id="prof-email"
                  type="email"
                  value={user.email}
                  disabled
                  style={{ background: '#f5f5f5', cursor: 'not-allowed', opacity: 0.7 }}
                />
              </div>

              <div className="co-field">
                <label htmlFor="prof-phone">Phone Number</label>
                <input
                  id="prof-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').replace(/^91/, '').slice(0, 10))}
                  placeholder="e.g. 9693999890"
                  maxLength={10}
                />
              </div>

              <div className="co-field">
                <label htmlFor="prof-address">Default Delivery Address</label>
                <textarea
                  id="prof-address"
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House no, Street, Landmark, Patna..."
                />
              </div>

              <button
                type="submit"
                className="btn"
                disabled={saving}
                style={{ marginTop: '10px', width: '100%', padding: '16px', minHeight: '52px' }}
              >
                {saving ? 'SAVING CHANGES...' : 'UPDATE PROFILE'}
              </button>
            </form>

            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <button
                type="button"
                onClick={logout}
                className="btn-danger"
              >
                Sign Out of Account
              </button>
            </div>

          </div>
        </div>
      </main>

      <MobileBottomBar activeTab="profile" />
    </>
  )
}
