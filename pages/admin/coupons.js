import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import AdminLayout from '../../components/AdminLayout'
import { useAuth } from '../../context/AuthContext'

export default function AdminCouponsDesk() {
  const { user, isAdmin } = useAuth()
  const [coupons, setCoupons] = useState([])
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [code, setCode] = useState('')
  const [discountValue, setDiscountValue] = useState('')
  const [discountType, setDiscountType] = useState('percent') // 'fixed' | 'percent'
  const [minimumOrder, setMinimumOrder] = useState('299')
  const [usageLimit, setUsageLimit] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [perUserLimit, setPerUserLimit] = useState('1')
  const [applicableCategory, setApplicableCategory] = useState('all')
  const [isStackable, setIsStackable] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchCoupons = async () => {
    try {
      const snap = await getDocs(collection(db, 'coupons'))
      const fetchedCoupons = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      try {
        const [activeOrdersSnap, archiveOrdersSnap] = await Promise.all([
          getDocs(collection(db, 'orders')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'orders_archive')).catch(() => ({ docs: [] }))
        ])

        const usageMap = {}
        const allOrderDocs = [...(activeOrdersSnap.docs || []), ...(archiveOrdersSnap.docs || [])]

        allOrderDocs.forEach(d => {
          const code = d.data().appliedCoupon
          if (code) {
            const clean = String(code).toUpperCase().trim()
            usageMap[clean] = (usageMap[clean] || 0) + 1
          }
        })

        const updated = fetchedCoupons.map(cp => {
          const historicalCount = usageMap[cp.couponCode?.toUpperCase()] || 0
          return {
            ...cp,
            usedCount: Math.max(cp.usedCount || 0, historicalCount)
          }
        })
        setCoupons(updated)
        return
      } catch (e) {}

      setCoupons(fetchedCoupons)
    } catch (err) {
      console.warn('Coupons fetch notice:', err.message)
    }
  }

  useEffect(() => {
    fetchCoupons()
  }, [])

  const handleAddCoupon = async (e) => {
    e.preventDefault()
    if (!code.trim() || !discountValue || !minimumOrder) return
    setLoading(true)

    try {
      await addDoc(collection(db, 'coupons'), {
        couponCode: code.toUpperCase().trim(),
        discountValue: Number(discountValue),
        discountType,
        minimumOrder: Number(minimumOrder),
        usageLimit: usageLimit ? Number(usageLimit) : 0, // 0 = unlimited
        usedCount: 0,
        expiryDate: expiryDate || null,
        perUserLimit: Number(perUserLimit) || 1,
        applicableCategory: applicableCategory || 'all',
        isStackable: Boolean(isStackable),
        active: true,
        createdAt: serverTimestamp()
      })
      setCode('')
      setDiscountValue('')
      setDiscountType('percent')
      setMinimumOrder('299')
      setUsageLimit('')
      setExpiryDate('')
      setPerUserLimit('1')
      setApplicableCategory('all')
      setIsStackable(false)
    } catch (err) {
      alert('Failed to add coupon: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleCoupon = async (coupon) => {
    try {
      await updateDoc(doc(db, 'coupons', coupon.id), {
        active: !coupon.active
      })
    } catch (e) {}
  }

  const handleDeleteCoupon = async (id) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return
    try {
      await deleteDoc(doc(db, 'coupons', id))
    } catch (e) {}
  }

  if (!user || !isAdmin) return null

  const filteredCoupons = coupons.filter(cp => {
    if (statusFilter === 'active' && !cp.active) return false
    if (statusFilter === 'inactive' && cp.active) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      return (cp.couponCode || '').toLowerCase().includes(q) || (cp.applicableCategory || '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <AdminLayout activePage="coupons" title="Coupons Management">
      <div className="admin-page-container">
        {/* EXECUTIVE CONTROL DECK FOR COUPONS */}
        <div className="admin-control-hero-card">
          <div className="admin-orders-header">
            <div className="admin-title-area">
              <span className="admin-sync-pill">PATNA DISCOUNTS & PROMOS</span>
              <h1>Coupons & Offer Engine</h1>
            </div>

            <div style={{ display: 'flex', gap: '10px', flex: 1, maxWidth: '580px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="admin-search-box" style={{ flex: '1 1 220px' }}>
                <span className="admin-search-icon">🔍</span>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Search promo code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" className="admin-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  padding: '12px 18px',
                  borderRadius: '999px',
                  border: '1.5px solid rgba(203, 32, 45,0.18)',
                  background: '#ffffff',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="all">🏷️ All Offers ({coupons.length})</option>
                <option value="active">🟢 Active Offers ({coupons.filter(c => c.active).length})</option>
                <option value="inactive">⚪ Inactive Offers ({coupons.filter(c => !c.active).length})</option>
              </select>
            </div>
          </div>

          <div className="status-filter-wrapper-container">
            <div className="status-filter-wrapped" role="tablist">
              <button
                type="button"
                className={`status-counter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                🏷️ ALL OFFERS <span className="status-count-badge">{coupons.length}</span>
              </button>
              <button
                type="button"
                className={`status-counter-btn ${statusFilter === 'active' ? 'active' : ''}`}
                onClick={() => setStatusFilter('active')}
              >
                🟢 ACTIVE <span className="status-count-badge">{coupons.filter(c => c.active).length}</span>
              </button>
              <button
                type="button"
                className={`status-counter-btn ${statusFilter === 'inactive' ? 'active' : ''}`}
                onClick={() => setStatusFilter('inactive')}
              >
                ⚪ INACTIVE <span className="status-count-badge">{coupons.filter(c => !c.active).length}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Create New Coupon Form */}
        <div className="adm-section-card" style={{ marginBottom: '28px', background: '#ffffff', borderRadius: '24px', padding: '24px' }}>
          <h3 style={{ marginBottom: '18px', fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
            ➕ Create Rules-Based Coupon
          </h3>

          <form onSubmit={handleAddCoupon} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                COUPON CODE
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="e.g. BADSHAH50"
                className="adm-input"
                required
                style={{ width: '100%', textTransform: 'uppercase', fontWeight: 800 }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                DISCOUNT TYPE
              </label>
              <select
                value={discountType}
                onChange={e => setDiscountType(e.target.value)}
                className="adm-input"
                style={{ width: '100%', fontWeight: 700 }}
              >
                <option value="percent">Percentage (%) Discount</option>
                <option value="fixed">Fixed Amount (₹) Discount</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                DISCOUNT VALUE ({discountType === 'percent' ? '%' : '₹'})
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                placeholder={discountType === 'percent' ? 'e.g. 50' : 'e.g. 100'}
                className="adm-input"
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                MINIMUM ORDER (₹)
              </label>
              <input
                type="number"
                value={minimumOrder}
                onChange={e => setMinimumOrder(e.target.value)}
                placeholder="e.g. 299"
                className="adm-input"
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                GLOBAL USAGE LIMIT (0 = UNLIMITED)
              </label>
              <input
                type="number"
                value={usageLimit}
                onChange={e => setUsageLimit(e.target.value)}
                placeholder="e.g. 100"
                className="adm-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                PER-USER LIMIT
              </label>
              <input
                type="number"
                value={perUserLimit}
                onChange={e => setPerUserLimit(e.target.value)}
                placeholder="1"
                className="adm-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                EXPIRY DATE (OPTIONAL)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="adm-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                APPLICABLE CATEGORY
              </label>
              <select
                value={applicableCategory}
                onChange={e => setApplicableCategory(e.target.value)}
                className="adm-input"
                style={{ width: '100%', fontWeight: 700 }}
              >
                <option value="all">All Categories</option>
                <option value="Biryani">Biryani Special</option>
                <option value="Starters">Starters & Kebabs</option>
                <option value="Combos">Family Combos</option>
                <option value="Desserts">Desserts & Beverages</option>
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
              <button type="submit" className="btn adm-btn-submit" disabled={loading} style={{ width: '100%', padding: '14px', fontWeight: 900 }}>
                {loading ? 'CREATING COUPON...' : '➕ PUBLISH PROMO COUPON'}
              </button>
            </div>
          </form>
        </div>

        {/* Active & Configured Offers */}
        <div className="adm-section-card" style={{ background: '#ffffff', borderRadius: '24px', padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
            Configured Offers & Promos ({filteredCoupons.length})
          </h3>

          {filteredCoupons.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: '#FFFDF2', borderRadius: '16px', border: '1px dashed rgba(0,0,0,0.1)' }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '8px' }}>🏷️</span>
              <p style={{ color: 'var(--muted)', fontWeight: 700 }}>No matching promo coupons found.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {filteredCoupons.map(cp => (
                <div
                  key={cp.id}
                  style={{
                    border: '1.5px solid rgba(203, 32, 45,0.12)',
                    borderRadius: '20px',
                    padding: '20px',
                    background: '#ffffff',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    gap: '16px'
                  }}
                >
                  {/* Top Bar: Code Tag & Active Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      background: 'rgba(203, 32, 45,0.08)',
                      color: 'var(--deep-green)',
                      border: '1px solid rgba(203, 32, 45,0.2)',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontWeight: 900,
                      fontSize: '0.92rem',
                      letterSpacing: '0.08em'
                    }}>
                      🏷️ {cp.couponCode}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleToggleCoupon(cp)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        fontWeight: 900,
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'all 0.2s ease',
                        background: cp.active ? '#CB202D' : '#9ca3af',
                        color: '#ffffff',
                        boxShadow: cp.active ? '0 4px 12px rgba(180,74,52,0.25)' : 'none'
                      }}
                    >
                      {cp.active ? '🟢 Active' : '⚪ Inactive'}
                    </button>
                  </div>

                  {/* Discount Value Badge */}
                  <div style={{ background: 'rgba(230,57,70,0.05)', padding: '14px 16px', borderRadius: '16px', border: '1px solid rgba(230,57,70,0.15)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#dc2626', lineHeight: 1.1 }}>
                      {cp.discountType === 'percent' ? `${cp.discountValue}% OFF` : `₹${cp.discountValue} OFF`}
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)', marginTop: '4px' }}>
                      Minimum Order: <strong style={{ color: 'var(--deep-green)' }}>₹{cp.minimumOrder}</strong>
                    </div>
                  </div>

                  {/* 2-Column Rules Metadata Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    paddingTop: '12px',
                    borderTop: '1px dashed rgba(0,0,0,0.1)',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem', fontWeight: 800 }}>TOTAL USAGE</span>
                      <strong>{cp.usageLimit > 0 ? `${cp.usedCount || 0} / ${cp.usageLimit}` : 'Unlimited'}</strong>
                    </div>

                    <div style={{ color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem', fontWeight: 800 }}>PER USER LIMIT</span>
                      <strong>{cp.perUserLimit || 1} time(s)</strong>
                    </div>

                    <div style={{ color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem', fontWeight: 800 }}>EXPIRY DATE</span>
                      <strong>{cp.expiryDate || 'No Expiry'}</strong>
                    </div>

                    <div style={{ color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem', fontWeight: 800 }}>CATEGORY</span>
                      <strong style={{ textTransform: 'capitalize' }}>{cp.applicableCategory || 'All'}</strong>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteCoupon(cp.id)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      transition: 'all 0.2s ease',
                      marginTop: '4px'
                    }}
                  >
                    🗑️ Delete Coupon
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
