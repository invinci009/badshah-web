import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../context/AuthContext'
import SiteNav from '../components/SiteNav'
import MobileBottomBar from '../components/MobileBottomBar'

export default function LoyaltyPage() {
  const router = useRouter()
  const { user, userProfile, openAuthModal, accessToken } = useAuth()

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState(null)
  const [snapshot, setSnapshot] = useState({
    availablePoints: 0,
    earnedTotal: 0,
    redeemedTotal: 0,
    expiredTotal: 0,
    nextExpiry: null,
  })
  const [transactions, setTransactions] = useState([])
  const [rewards, setRewards] = useState([])
  const [rewardsFilter, setRewardsFilter] = useState('all') // all, discount, free
  const [activityTab, setActivityTab] = useState('all') // all, earned, redeemed

  // Phone lookup for guests
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)

  // Direct Claim Modal state
  const [claimModalOpen, setClaimModalOpen] = useState(false)
  const [claimOrderId, setClaimOrderId] = useState('')
  const [claimLoading, setClaimLoading] = useState(false)
  const [claimFeedback, setClaimFeedback] = useState(null)

  // Toast feedback
  const [toastMessage, setToastMessage] = useState(null)
  const showToast = (msg, isError = false) => {
    setToastMessage({ msg, isError })
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Fetch customer loyalty summary
  const fetchLoyaltyData = useCallback(async (phoneOverride = null) => {
    try {
      setLoading(true)
      const headers = {}
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
      }

      const activePhone = phoneOverride || userProfile?.phone || user?.phoneNumber || ''
      const activeEmail = user?.email || userProfile?.email || ''
      
      const queryParts = []
      if (activePhone) queryParts.push(`phone=${encodeURIComponent(activePhone)}`)
      if (activeEmail) queryParts.push(`email=${encodeURIComponent(activeEmail)}`)
      if (user?.uid) queryParts.push(`customerId=${encodeURIComponent(user.uid)}`)

      const url = queryParts.length ? `/api/loyalty/summary?${queryParts.join('&')}` : null

      if (!url && !accessToken) {
        setLoading(false)
        return
      }

      const res = await fetch(url || '/api/loyalty/summary', { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.customer) setCustomer(data.customer)
        if (data.snapshot) setSnapshot(data.snapshot)
        if (Array.isArray(data.transactions)) setTransactions(data.transactions)
      }
    } catch (err) {
      console.warn('Failed to load loyalty data:', err.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken, user, userProfile])

  // Fetch rewards catalog
  const fetchRewards = useCallback(async () => {
    try {
      const activePhone = userProfile?.phone || ''
      const res = await fetch(`/api/loyalty/rewards${activePhone ? `?phone=${encodeURIComponent(activePhone)}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.rewards)) {
          setRewards(data.rewards)
        }
      }
    } catch (e) {
      console.warn('Failed to fetch rewards:', e.message)
    }
  }, [userProfile])

  useEffect(() => {
    fetchLoyaltyData()
    fetchRewards()
  }, [fetchLoyaltyData, fetchRewards])

  // Handle phone lookup for guests
  const handlePhoneLookup = async (e) => {
    e.preventDefault()
    setLookupError('')
    const clean = lookupPhone.replace(/\D/g, '').replace(/^91/, '').slice(-10)
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setLookupError('Please enter a valid 10-digit Indian mobile number')
      return
    }
    setLookupLoading(true)
    try {
      await fetchLoyaltyData(clean)
    } catch (err) {
      setLookupError('Could not find account for this phone number')
    } finally {
      setLookupLoading(false)
    }
  }

  // Handle direct points claim
  const handleDirectClaim = async (e) => {
    e.preventDefault()
    if (!claimOrderId.trim()) return
    setClaimLoading(true)
    setClaimFeedback(null)

    const phoneToUse = customer?.phone || userProfile?.phone || lookupPhone
    if (!phoneToUse) {
      setClaimFeedback({ ok: false, msg: 'Please provide your registered mobile number' })
      setClaimLoading(false)
      return
    }

    try {
      const res = await fetch('/api/loyalty/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: claimOrderId.trim(), phone: phoneToUse }),
      })
      const data = await res.json()
      if (res.ok) {
        setClaimFeedback({ ok: true, msg: data.message || `+${data.awarded} points added to your account!` })
        fetchLoyaltyData(phoneToUse)
        setTimeout(() => {
          setClaimModalOpen(false)
          setClaimOrderId('')
          setClaimFeedback(null)
          showToast('🎉 Points successfully credited!')
        }, 1800)
      } else {
        setClaimFeedback({ ok: false, msg: data.error || 'Failed to claim points' })
      }
    } catch (err) {
      setClaimFeedback({ ok: false, msg: 'Network error claiming points. Please try again.' })
    } finally {
      setClaimLoading(false)
    }
  }

  // Filtered rewards
  const filteredRewards = rewards.filter((r) => {
    if (rewardsFilter === 'discount') return r.type === 'FIXED_DISCOUNT' || r.type === 'PERCENT_DISCOUNT'
    if (rewardsFilter === 'free') return r.type === 'FREE_ITEM'
    return true
  })

  // Filtered transactions
  const filteredTransactions = transactions.filter((t) => {
    if (activityTab === 'earned') return t.type === 'EARN' || (t.delta > 0 && t.type !== 'EXPIRE')
    if (activityTab === 'redeemed') return t.type === 'REDEEM'
    return true
  })

  const availablePoints = snapshot?.availablePoints ?? 0
  const earnedTotal = snapshot?.earnedTotal ?? 0
  const tierName = customer?.tier || (earnedTotal >= 600 ? 'Badshah Imperial Crown' : earnedTotal >= 300 ? 'Royal Gold Member' : earnedTotal >= 100 ? 'Royal Silver Diner' : 'Royal Bronze Guest')
  const tierBadge = customer?.tierBadge || (earnedTotal >= 600 ? '👑' : earnedTotal >= 300 ? '🥇' : earnedTotal >= 100 ? '🥈' : '🥉')

  // Calculate tier progression percentage
  const tierPercent = earnedTotal >= 600 ? 100 : earnedTotal >= 300 ? Math.min(100, Math.round(((earnedTotal - 300) / 300) * 100)) : earnedTotal >= 100 ? Math.min(100, Math.round(((earnedTotal - 100) / 200) * 100)) : Math.min(100, Math.round((earnedTotal / 100) * 100))
  const nextTierLabel = earnedTotal >= 600 ? 'Maximum VIP Tier Achieved' : earnedTotal >= 300 ? `${600 - earnedTotal} pts to Imperial Crown` : earnedTotal >= 100 ? `${300 - earnedTotal} pts to Royal Gold` : `${100 - earnedTotal} pts to Royal Silver`

  return (
    <>
      <Head>
        <title>Badshah Online VIP Club & Rewards | Biryani Badshah</title>
        <meta
          name="description"
          content="Earn royal points on every Biryani Badshah website order. Exclusive online delivery & takeaway loyalty rewards."
        />
      </Head>

      <SiteNav activePage="loyalty" />

      <main style={{ minHeight: '90vh', background: '#FAF7F2', paddingBottom: '90px' }}>
        {/* Toast Alert */}
        {toastMessage && (
          <div
            style={{
              position: 'fixed',
              top: '90px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              background: toastMessage.isError ? '#DC2626' : '#15803D',
              color: '#FFFFFF',
              padding: '12px 24px',
              borderRadius: '999px',
              fontWeight: 800,
              fontSize: '0.9rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{toastMessage.isError ? '⚠️' : '✨'}</span>
            <span>{toastMessage.msg}</span>
          </div>
        )}

        {/* Top Hero Breadcrumb */}
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(203, 32, 45, 0.08)', padding: '16px 0' }}>
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>👑</span>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--ink)' }}>
                  BADSHAH <span style={{ color: 'var(--deep-green)' }}>ONLINE VIP CLUB</span>
                </h1>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>
                  Website Delivery &amp; Takeaway Rewards Program (Online Exclusive)
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setClaimModalOpen(true)}
                style={{
                  background: 'rgba(203, 32, 45, 0.08)',
                  color: 'var(--deep-green)',
                  border: '1px solid rgba(203, 32, 45, 0.25)',
                  padding: '8px 16px',
                  borderRadius: '999px',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>⚡</span>
                <span>Claim Web Points</span>
              </button>

              <Link
                href="/menu"
                style={{
                  background: 'var(--deep-green)',
                  color: '#FFFFFF',
                  padding: '8px 18px',
                  borderRadius: '999px',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(203, 32, 45, 0.25)',
                  textDecoration: 'none',
                }}
              >
                <span>Order Food</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="container" style={{ maxWidth: '840px', marginTop: '24px', paddingInline: '16px' }}>
          {/* Website Isolation Notice Pill */}
          <div
            style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '16px',
              padding: '10px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.78rem',
              color: '#92400E',
              fontWeight: 700,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>🌐</span>
            <span>
              <strong>Website Exclusive VIP Club:</strong> Points earned on online delivery &amp; takeaway orders are managed dedicatedly on this website, separate from dine-in QR table ordering.
            </span>
          </div>

          {/* Member Royal Gold VIP Card */}
          <div
            style={{
              position: 'relative',
              borderRadius: '28px',
              padding: 'clamp(24px, 5vw, 36px)',
              background: 'linear-gradient(135deg, #7A0210 0%, #9E0C1F 45%, #50000B 100%)',
              color: '#FFFFFF',
              boxShadow: '0 20px 50px rgba(122, 2, 16, 0.35)',
              border: '2px solid rgba(245, 197, 24, 0.55)',
              overflow: 'hidden',
              marginBottom: '28px',
            }}
          >
            {/* Subtle Royal Damask Overlay */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '260px',
                height: '260px',
                background: 'radial-gradient(circle, rgba(245, 197, 24, 0.18) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            {/* Top Bar on Card */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', position: 'relative', zIndex: 2 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(245, 197, 24, 0.5)',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      color: '#FDE047',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span>{tierBadge}</span>
                    <span>{tierName}</span>
                  </div>

                  <span
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      color: '#FFFFFF',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    ONLINE PRIVILEGE CARD
                  </span>
                </div>

                <h2 style={{ margin: 0, fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', fontWeight: 900, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                  {customer?.name || userProfile?.name || user?.displayName || 'Royal Diner Guest'}
                </h2>

                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#FCE7F3', opacity: 0.9, fontFamily: 'monospace', fontWeight: 700 }}>
                  {customer?.phone ? `+91 ${customer.phone}` : user?.email || 'Sign in to sync points'}
                </p>
              </div>

              {/* Points Big Counter */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#FDE047', opacity: 0.95, display: 'block' }}>
                  AVAILABLE POINTS
                </span>
                <div style={{ fontSize: 'clamp(2.4rem, 7vw, 3.4rem)', fontWeight: 900, lineHeight: 1, color: '#FDE047', margin: '6px 0 2px 0', textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
                  {availablePoints}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#FFFFFF', opacity: 0.8, fontWeight: 700 }}>
                  Earned: {earnedTotal} pts
                </span>
              </div>
            </div>

            {/* Tier Progression Bar */}
            <div style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid rgba(255,255,255,0.18)', position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 800, marginBottom: '8px', color: '#FDE047' }}>
                <span>✨ Tier Progress: {tierPercent}%</span>
                <span>{nextTierLabel}</span>
              </div>

              <div style={{ height: '8px', width: '100%', background: 'rgba(0,0,0,0.3)', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${tierPercent}%`,
                    background: 'linear-gradient(90deg, #FDE047 0%, #F59E0B 100%)',
                    borderRadius: '999px',
                    transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#FCE7F3', opacity: 0.8, marginTop: '8px', fontWeight: 600 }}>
                <span>Bronze (0+)</span>
                <span>Silver (100+)</span>
                <span>Gold (300+)</span>
                <span>Badshah Crown (600+)</span>
              </div>
            </div>

            {/* Quick Card Footer Highlights */}
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '0.78rem', color: '#FFF1F2', position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '6px', fontWeight: 900 }}>
                  +20 PTS
                </span>
                <span>Awarded on every delivered website order</span>
              </div>

              <Link
                href="/menu"
                style={{ color: '#FDE047', fontWeight: 900, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <span>Order on Menu</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Guest / Phone Lookup Box (Shown if not logged in or viewing another number) */}
          {(!user || !customer) && (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                padding: '24px',
                border: '1px solid rgba(203, 32, 45, 0.12)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
                marginBottom: '28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>📱</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--ink)' }}>
                    Check Your Online VIP Balance
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Enter your 10-digit mobile number to view your website loyalty points, tier, and unlocked rewards.
                  </p>
                </div>
              </div>

              {lookupError && (
                <p style={{ margin: 0, color: '#DC2626', fontSize: '0.82rem', fontWeight: 700 }}>
                  {lookupError}
                </p>
              )}

              <form onSubmit={handlePhoneLookup} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 220px' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      color: 'var(--muted)',
                    }}
                  >
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="9876543210"
                    value={lookupPhone}
                    onChange={(e) => setLookupPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    style={{
                      width: '100%',
                      height: '46px',
                      paddingLeft: '48px',
                      paddingRight: '14px',
                      borderRadius: '14px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      outline: 'none',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={lookupLoading}
                  style={{
                    height: '46px',
                    padding: '0 24px',
                    borderRadius: '14px',
                    background: 'var(--deep-green)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {lookupLoading ? 'Checking...' : 'View My Card'}
                </button>

                {!user && (
                  <button
                    type="button"
                    onClick={openAuthModal}
                    style={{
                      height: '46px',
                      padding: '0 20px',
                      borderRadius: '14px',
                      background: 'rgba(203, 32, 45, 0.08)',
                      color: 'var(--deep-green)',
                      border: '1px solid rgba(203, 32, 45, 0.2)',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Sign In
                  </button>
                )}
              </form>
            </div>
          )}

          {/* 3-Column VIP Club Highlights */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '20px',
                border: '1px solid rgba(203, 32, 45, 0.08)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🥘</div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 900, color: 'var(--ink)' }}>
                Earn On Web Orders
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                Earn <strong>+20 points</strong> instantly upon delivery of every Dum Pukht feast ordered directly on this website.
              </p>
            </div>

            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '20px',
                border: '1px solid rgba(203, 32, 45, 0.08)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🎟️</div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 900, color: 'var(--ink)' }}>
                Redeem at Checkout
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                Apply points right inside the website checkout modal for instant discounts or complimentary delicacies.
              </p>
            </div>

            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '20px',
                border: '1px solid rgba(203, 32, 45, 0.08)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>👑</div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 900, color: 'var(--ink)' }}>
                Online VIP Privileges
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                Climb tiers from Royal Bronze to Badshah Crown to unlock secret online feasts and priority kitchen packing.
              </p>
            </div>
          </div>

          {/* Rewards Catalog Section */}
          <div style={{ marginBottom: '36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
                  👑 VIP Rewards &amp; Delicacies Catalog
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Unlock discounts and complimentary dishes using your available Badshah points.
                </p>
              </div>

              {/* Filter pills */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { key: 'all', label: 'All Rewards' },
                  { key: 'discount', label: 'Discounts' },
                  { key: 'free', label: 'Free Dishes' },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setRewardsFilter(f.key)}
                    style={{
                      background: rewardsFilter === f.key ? 'var(--deep-green)' : '#FFFFFF',
                      color: rewardsFilter === f.key ? '#FFFFFF' : 'var(--muted)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rewards Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '18px',
              }}
            >
              {filteredRewards.map((r) => {
                const canAfford = availablePoints >= r.pointsCost
                const ptsNeeded = Math.max(0, r.pointsCost - availablePoints)

                return (
                  <div
                    key={r.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '24px',
                      border: canAfford ? '2px solid rgba(203, 32, 45, 0.4)' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: canAfford ? '0 10px 30px rgba(203, 32, 45, 0.08)' : '0 4px 16px rgba(0,0,0,0.03)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    {r.imageUrl && (
                      <div style={{ position: 'relative', height: '140px', width: '100%', overflow: 'hidden' }}>
                        <img
                          src={r.imageUrl}
                          alt={r.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            background: 'rgba(0,0,0,0.75)',
                            backdropFilter: 'blur(6px)',
                            color: '#FDE047',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 900,
                            letterSpacing: '0.04em',
                          }}
                        >
                          🪙 {r.pointsCost} PTS
                        </div>
                      </div>
                    )}

                    <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      {!r.imageUrl && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--deep-green)', background: 'rgba(203,32,45,0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                            {(r.type || 'TOP_UP').replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#D97706' }}>
                            🪙 {r.pointsCost} PTS
                          </span>
                        </div>
                      )}

                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.98rem', fontWeight: 900, color: 'var(--ink)' }}>
                        {r.name}
                      </h4>

                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.4, flex: 1 }}>
                        {r.description || 'Exclusive VIP perk available for Badshah members'}
                      </p>

                      <div style={{ margin: '14px 0 12px 0', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
                        <span>Min Order: ₹{r.minOrder || 0}</span>
                        {canAfford ? (
                          <span style={{ color: '#16A34A', fontWeight: 800 }}>✓ Ready to Redeem</span>
                        ) : (
                          <span style={{ color: '#DC2626' }}>Need {ptsNeeded} more pts</span>
                        )}
                      </div>

                      <Link
                        href="/menu"
                        style={{
                          width: '100%',
                          textAlign: 'center',
                          padding: '10px 0',
                          borderRadius: '12px',
                          background: canAfford ? 'var(--deep-green)' : 'rgba(0,0,0,0.06)',
                          color: canAfford ? '#FFFFFF' : 'var(--muted)',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          textDecoration: 'none',
                          cursor: canAfford ? 'pointer' : 'default',
                          transition: 'all 0.2s ease',
                          display: 'block',
                        }}
                      >
                        {canAfford ? 'Redeem in Checkout →' : 'Order Food to Earn Points'}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Points History & Activity Section */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '24px',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'var(--ink)' }}>
                  📜 Points Activity Ledger
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Real-time audit log of your earned, redeemed, and credited points.
                </p>
              </div>

              {/* Sub tabs */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'earned', label: 'Earned (+)' },
                  { key: 'redeemed', label: 'Redeemed (-)' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActivityTab(t.key)}
                    style={{
                      background: activityTab === t.key ? 'rgba(203, 32, 45, 0.1)' : 'transparent',
                      color: activityTab === t.key ? 'var(--deep-green)' : 'var(--muted)',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '8px' }}>🍽️</span>
                <p style={{ fontWeight: 800, fontSize: '0.92rem', margin: '0 0 4px 0', color: 'var(--ink)' }}>
                  No points activity logged yet
                </p>
                <p style={{ fontSize: '0.8rem', margin: 0 }}>
                  Order your first royal biryani feast to get your first +20 points credited automatically!
                </p>
                <Link
                  href="/menu"
                  style={{
                    display: 'inline-block',
                    marginTop: '16px',
                    padding: '8px 20px',
                    background: 'var(--deep-green)',
                    color: '#FFFFFF',
                    borderRadius: '999px',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    textDecoration: 'none',
                  }}
                >
                  Explore Food Menu
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredTransactions.map((tx) => {
                  const isPositive = (tx.delta || 0) > 0
                  const isRedeem = tx.type === 'REDEEM'
                  const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) : 'Recent'

                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '16px',
                        background: '#FAF7F2',
                        border: '1px solid rgba(0,0,0,0.05)',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: isPositive ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                            color: isPositive ? '#16A34A' : '#DC2626',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: '1rem',
                            fontWeight: 900,
                          }}
                        >
                          {isPositive ? '↑' : '↓'}
                        </span>
                        <div>
                          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--ink)' }}>
                            {tx.reason || (isPositive ? 'Points Earned' : 'Points Redeemed')}
                          </p>
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                            {dateStr} {tx.orderId ? `• Order #${tx.orderId}` : ''}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: '0.92rem',
                            fontWeight: 900,
                            color: isPositive ? '#16A34A' : '#DC2626',
                          }}
                        >
                          {isPositive ? `+${tx.points || tx.delta}` : `-${tx.points || Math.abs(tx.delta)}`} pts
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            color: 'var(--muted)',
                          }}
                        >
                          {tx.type}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Claim Points Modal */}
        {claimModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 3000,
              display: 'grid',
              placeItems: 'center',
              padding: '16px',
            }}
          >
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                padding: '28px',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setClaimModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                }}
              >
                ×
              </button>

              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '6px' }}>⚡</span>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--ink)' }}>
                  Claim Website Order Points
                </h3>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                  Did you place an online feast on this website that wasn't credited? Enter your website Order ID below to claim your +20 VIP points.
                </p>
              </div>

              {claimFeedback && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    marginBottom: '16px',
                    background: claimFeedback.ok ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                    color: claimFeedback.ok ? '#15803D' : '#DC2626',
                    textAlign: 'center',
                  }}
                >
                  {claimFeedback.msg}
                </div>
              )}

              <form onSubmit={handleDirectClaim} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '6px' }}>
                    Order ID (e.g. BB-PATNA-...)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="BB-PATNA-..."
                    value={claimOrderId}
                    onChange={(e) => setClaimOrderId(e.target.value)}
                    style={{
                      width: '100%',
                      height: '46px',
                      padding: '0 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      outline: 'none',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={claimLoading}
                  style={{
                    height: '48px',
                    borderRadius: '14px',
                    background: 'var(--deep-green)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    marginTop: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  {claimLoading ? 'Verifying & Claiming...' : 'Claim My Points Now'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      <MobileBottomBar activeTab="loyalty" />
    </>
  )
}
