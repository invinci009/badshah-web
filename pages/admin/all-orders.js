import { useEffect, useState, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../components/AdminLayout'

const getInitials = (nameStr) => {
  if (!nameStr || typeof nameStr !== 'string') return 'CU'
  const parts = nameStr.trim().split(/\s+/)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  }
  return (parts[0] || 'CU').slice(0, 2).toUpperCase()
}

const getStatusMeta = (status, isDelivered, isCancelled) => {
  if (isDelivered) return { color: '#CB202D', bg: '#EFF3E6', text: 'DELIVERED', icon: '🟢' }
  if (isCancelled) return { color: '#dc2626', bg: '#fce8e6', text: 'CANCELLED', icon: '🔴' }
  switch (status) {
    case 'UPI Verification Pending':
      return { color: '#b45309', bg: '#fef3c7', text: 'UPI VERIFICATION', icon: '💳' }
    case 'Pending':
      return { color: '#d97706', bg: '#fef3c7', text: 'PENDING', icon: '⏳' }
    case 'Accepted':
      return { color: '#1a73e8', bg: '#e8f0fe', text: 'ACCEPTED', icon: '👍' }
    case 'Preparing':
      return { color: '#d97706', bg: '#fef3c7', text: 'PREPARING', icon: '👨‍🍳' }
    case 'Ready':
      return { color: '#7e22ce', bg: '#f3e8ff', text: 'READY', icon: '🍱' }
    case 'Out For Delivery':
      return { color: '#0891b2', bg: '#e0f2fe', text: 'OUT FOR DELIVERY', icon: '🛵' }
    case 'REFUND_PENDING':
      return { color: '#dc2626', bg: '#fce8e6', text: 'REFUND PENDING', icon: '💸' }
    case 'REFUNDED':
      return { color: '#6b7280', bg: '#f3f4f6', text: 'REFUNDED', icon: '💸' }
    default:
      return { color: '#CB202D', bg: '#EFF3E6', text: (status || 'CONFIRMED').toUpperCase(), icon: '📦' }
  }
}

export default function AllOrdersPage() {
  const { user, isAdmin, accessToken } = useAuth()
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [mounted, setMounted] = useState(false)

  const formatDoc = useCallback((d, source) => {
    const data = typeof d.data === 'function' ? d.data() : d
    const docId = d.id || data.orderId || data._id

    let dateObj = new Date()
    try {
      if (data.createdAt?.toDate) {
        dateObj = data.createdAt.toDate()
      } else if (data.createdAtSeconds) {
        dateObj = new Date(data.createdAtSeconds * 1000)
      } else if (data.createdAt && (typeof data.createdAt === 'string' || typeof data.createdAt === 'number')) {
        dateObj = new Date(data.createdAt)
      }
      if (isNaN(dateObj.getTime())) dateObj = new Date()
    } catch (e) {
      dateObj = new Date()
    }

    const createdAtFormatted = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) +
      ' (' + dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }) + ')'

    const dateKey = dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD format

    return {
      id: docId,
      ...data,
      createdAtFormatted,
      createdAtSeconds: Math.floor(dateObj.getTime() / 1000),
      dateKey,
      _source: source
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    if (!user || !isAdmin) {
      setLoading(false)
      return
    }

    setLoading(true)
    let activeDocs = []
    let archiveDocs = []
    let apiDocs = []

    const updateCombined = () => {
      const map = new Map()
      ;[...activeDocs, ...archiveDocs, ...apiDocs].forEach(o => {
        const key = o.orderId || o.id || o._id
        if (key && !map.has(key)) map.set(key, o)
      })
      const combined = Array.from(map.values())
      combined.sort((a, b) => (b.createdAtSeconds || 0) - (a.createdAtSeconds || 0))
      setAllOrders(combined)
      setLoading(false)
    }

    // 1. Realtime sync for active orders
    const unsubActive = onSnapshot(collection(db, 'orders'), (snap) => {
      activeDocs = snap.docs.map(d => formatDoc(d, 'active'))
      updateCombined()
    }, (err) => {
      console.warn('Active orders snapshot warning:', err.message)
      setLoading(false)
    })

    // 2. Realtime sync for archived orders
    const unsubArchive = onSnapshot(collection(db, 'orders_archive'), (snap) => {
      archiveDocs = snap.docs.map(d => formatDoc(d, 'archive'))
      updateCombined()
    }, (err) => {
      console.warn('Archive orders snapshot warning:', err.message)
      setLoading(false)
    })

    // 3. Fallback/backend API fetch
    if (accessToken) {
      fetch('/api/orders/admin-all?limit=200', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.orders) {
            apiDocs = data.orders.map(d => formatDoc(d, 'mongodb'))
            updateCombined()
          }
        })
        .catch(err => console.warn('API orders fetch notice:', err.message))
    }

    return () => {
      unsubActive()
      unsubArchive()
    }
  }, [user, isAdmin, accessToken, formatDoc])

  const fetchAllOrders = async () => {
    setLoading(true)
    try {
      const [activeSnap, archiveSnap, apiRes] = await Promise.all([
        getDocs(collection(db, 'orders')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'orders_archive')).catch(() => ({ docs: [] })),
        accessToken ? fetch('/api/orders/admin-all?limit=200', {
          headers: { Authorization: `Bearer ${accessToken}` }
        }).then(res => res.ok ? res.json() : null).catch(() => null) : Promise.resolve(null)
      ])

      const activeDocs = (activeSnap.docs || []).map(d => formatDoc(d, 'active'))
      const archiveDocs = (archiveSnap.docs || []).map(d => formatDoc(d, 'archive'))
      const apiDocs = (apiRes?.orders || []).map(d => formatDoc(d, 'mongodb'))

      const map = new Map()
      ;[...activeDocs, ...archiveDocs, ...apiDocs].forEach(o => {
        const key = o.orderId || o.id || o._id
        if (key && !map.has(key)) map.set(key, o)
      })

      const combined = Array.from(map.values())
      combined.sort((a, b) => (b.createdAtSeconds || 0) - (a.createdAtSeconds || 0))
      setAllOrders(combined)
    } catch (err) {
      console.warn('Fetch all orders manual error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filtering logic
  const filteredOrders = allOrders.filter((o) => {
    // Date filter
    if (dateFilter && o.dateKey !== dateFilter) return false

    // Status filter
    if (statusFilter !== 'all') {
      const st = (o.orderStatus || o.status || '').toLowerCase()
      if (statusFilter === 'delivered' && st !== 'delivered') return false
      if (statusFilter === 'cancelled' && !['cancelled', 'rejected', 'payment failed'].includes(st)) return false
      if (statusFilter === 'active' && ['delivered', 'cancelled', 'rejected', 'refunded', 'payment failed'].includes(st)) return false
      if (statusFilter === 'refunded' && st !== 'refunded' && (o.refund?.status || '').toUpperCase() !== 'REFUNDED') return false
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const nameMatch = (o.customerName || o.userName || '').toLowerCase().includes(q)
      const phoneMatch = (o.customerPhone || o.userPhone || '').toLowerCase().includes(q)
      const idMatch = (o.orderId || o.id || '').toLowerCase().includes(q)
      const addressMatch = (o.deliveryAddress || '').toLowerCase().includes(q)
      const emailMatch = (o.customerEmail || o.userEmail || '').toLowerCase().includes(q)
      return nameMatch || phoneMatch || idMatch || addressMatch || emailMatch
    }

    return true
  })

  // Stats
  const totalOrders = allOrders.length
  const deliveredCount = allOrders.filter(o => (o.orderStatus || '').toLowerCase() === 'delivered').length
  const cancelledCount = allOrders.filter(o => ['cancelled', 'rejected'].includes((o.orderStatus || '').toLowerCase())).length
  const totalRevenue = allOrders
    .filter(o => (o.orderStatus || '').toLowerCase() === 'delivered' || (o.paymentStatus || '').toLowerCase() === 'paid')
    .reduce((sum, o) => sum + (o.grandTotal || 0), 0)


  return (
    <AdminLayout activePage="all-orders" title="All Orders">
      <Head>
        <title>All Orders | Biryani Badshah Admin</title>
      </Head>

      <div className="admin-page-container">
        {/* HERO CARD */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '24px', border: '1px solid rgba(203, 32, 45,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.02)', marginBottom: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: 'var(--deep-green)', textTransform: 'uppercase' }}>
                📋 COMPLETE ORDER HISTORY
              </span>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)', fontWeight: 900, color: 'var(--ink)', margin: '2px 0 0 0' }}>
                All Orders
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--muted)', fontWeight: 600 }}>
                Browse, search, and review every order placed since launch
              </p>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchAllOrders}
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: '1.5px solid var(--deep-green)',
                background: loading ? 'rgba(203, 32, 45,0.05)' : '#ffffff',
                color: 'var(--deep-green)',
                fontWeight: 900,
                fontSize: '0.84rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Outfit', sans-serif",
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              {loading ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>

          {/* Search + Filters Row */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
            {/* Search */}
            <div className="admin-search-box" style={{ flex: '1 1 280px' }}>
              <span className="admin-search-icon" style={{ color: 'var(--deep-green)', opacity: 1 }}>🔍</span>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search by Order ID, Name, Phone, Email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="admin-search-clear" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>

            {/* Date Filter */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1.5px solid rgba(203, 32, 45,0.18)',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--ink)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: '#ffffff',
                cursor: 'pointer',
                outline: 'none'
              }}
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  background: '#fef3c7',
                  color: '#b45309',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
              >
                ✕ Clear Date
              </button>
            )}

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1.5px solid rgba(203, 32, 45,0.18)',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--ink)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: '#ffffff',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active / In-Progress</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <div style={{ borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)', background: '#FFFDF2', textAlign: 'left' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📦 TOTAL ORDERS</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--deep-green)', marginTop: '4px' }}>
                {totalOrders}
              </div>
            </div>
            <div style={{ borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)', background: '#FFFDF2', textAlign: 'left' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>✅ DELIVERED</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#CB202D', marginTop: '4px' }}>
                {deliveredCount}
              </div>
            </div>
            <div style={{ borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)', background: '#FFFDF2', textAlign: 'left' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>❌ CANCELLED</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#dc2626', marginTop: '4px' }}>
                {cancelledCount}
              </div>
            </div>
            <div style={{ borderRadius: '12px', padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)', background: '#FFFDF2', textAlign: 'left' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>💰 REVENUE</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--deep-green)', marginTop: '4px' }}>
                ₹{totalRevenue.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--muted)' }}>
            Showing {filteredOrders.length} of {totalOrders} orders
            {dateFilter && <span> · Date: {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            {searchQuery && <span> · Search: "{searchQuery}"</span>}
          </span>
        </div>

        {/* LOADING STATE */}
        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px dashed rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
            <p style={{ color: 'var(--muted)', fontSize: '0.95rem', fontWeight: 700 }}>Loading all orders from database...</p>
          </div>
        ) : (
          /* ORDERS TABLE / CARD LIST */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {filteredOrders.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '60px 20px', background: '#ffffff', borderRadius: '16px', textAlign: 'center', border: '1px dashed rgba(0,0,0,0.12)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
                <p style={{ color: 'var(--muted)', fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                  {searchQuery ? `No orders matching "${searchQuery}"` : 'No orders found with the selected filters.'}
                </p>
                {(searchQuery || dateFilter || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setDateFilter(''); setStatusFilter('all') }}
                    style={{
                      marginTop: '12px',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      border: '1.5px solid var(--deep-green)',
                      background: '#ffffff',
                      color: 'var(--deep-green)',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: 'pointer'
                    }}
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            ) : (
              filteredOrders.map((ord) => {
                const isDelivered = (ord.orderStatus || '').toLowerCase() === 'delivered'
                const isCancelled = ['cancelled', 'rejected', 'payment failed'].includes((ord.orderStatus || '').toLowerCase()) || (ord.paymentStatus || '').toLowerCase() === 'rejected'
                const isRefunded = (ord.orderStatus || '').toLowerCase() === 'refunded' || (ord.paymentStatus || '').toLowerCase() === 'refunded' || (ord.refund?.status || '').toUpperCase() === 'REFUNDED'
                const customerName = ord.customerName || ord.userName || 'Customer'
                const initials = getInitials(customerName)
                const statusMeta = getStatusMeta(ord.orderStatus, isDelivered, isCancelled)

                return (
                  <div
                    key={ord.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      border: '1.5px solid rgba(203, 32, 45,0.12)',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                    }}
                  >
                    {/* Status Color Bar */}
                    <div style={{ height: '4px', width: '100%', background: statusMeta.color }} />

                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Header: Status + Order ID */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        padding: '6px 10px',
                        background: statusMeta.bg,
                        borderRadius: '10px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.76rem', fontWeight: 900, color: statusMeta.color, letterSpacing: '0.04em', fontFamily: "'Outfit', sans-serif" }}>
                            {statusMeta.icon} {statusMeta.text}
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)' }}>
                            • {ord.createdAtFormatted}
                          </span>
                        </div>

                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#ffffff',
                          border: '1.5px solid var(--deep-green)',
                          padding: '3px 9px',
                          borderRadius: '7px',
                          boxShadow: '0 1px 4px rgba(203, 32, 45,0.1)'
                        }}>
                          <span style={{ fontSize: '0.58rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Outfit', sans-serif" }}>ID:</span>
                          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--deep-green)', letterSpacing: '0.04em', fontFamily: "'JetBrains Mono', monospace" }}>
                            #{ord.orderId || ord.id?.slice(0, 8) || 'UNKNOWN'}
                          </span>
                        </div>
                      </div>

                      {/* Items Summary (compact) */}
                      <div style={{
                        background: '#f6fbf8',
                        border: '1px solid rgba(203, 32, 45,0.1)',
                        borderRadius: '10px',
                        padding: '10px 12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--deep-green)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Outfit', sans-serif" }}>
                            🍱 {ord.items?.length || 0} Item(s)
                          </span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--deep-green)', fontFamily: "'Outfit', sans-serif" }}>
                            ₹{(ord.grandTotal || 0).toFixed(0)}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.5 }}>
                          {ord.items?.map((item, idx) => (
                            <span key={idx}>
                              {item.qty || 1}x {item.title || item.name}{idx < ord.items.length - 1 ? ' · ' : ''}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Customer + Payment Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ background: '#fafaf6', borderRadius: '10px', padding: '8px 10px', border: '1px solid rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{
                              width: '26px', height: '26px', borderRadius: '50%', background: 'var(--deep-green)', color: '#fff',
                              display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '0.68rem', flexShrink: 0, fontFamily: "'Outfit', sans-serif"
                            }}>{initials}</div>
                            <div style={{ overflow: 'hidden' }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Outfit', sans-serif" }}>
                                {customerName}
                              </div>
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)' }}>
                                📞 {ord.customerPhone || ord.userPhone || '—'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const isPaymentPaid = ord.paymentStatus === 'paid' || ord.paymentStatus === 'Paid' || Boolean(ord.razorpayPaymentId) || ord.paymentVerifiedBy === 'CLIENT_VERIFY'
                          return (
                            <div style={{
                              background: isPaymentPaid ? '#EFF3E6' : (ord.paymentStatus === 'refunded' || ord.paymentStatus === 'Refunded' || isRefunded) ? '#fff7ed' : isCancelled ? '#fce8e6' : '#fef3c7',
                              borderRadius: '10px', padding: '8px 10px', border: '1px solid rgba(0,0,0,0.04)'
                            }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--ink)' }}>
                                💳 {ord.paymentMethod === 'RAZORPAY' || ord.isRazorpay || ord.razorpayPaymentId ? 'Razorpay Online' : (ord.paymentMethod === 'UPI' ? 'UPI Online' : 'Cash on Delivery')}
                              </div>
                              <div style={{ fontSize: '0.76rem', fontWeight: 900, marginTop: '2px', color: isPaymentPaid ? '#CB202D' : (ord.paymentStatus === 'refunded' || ord.paymentStatus === 'Refunded' || isRefunded) ? '#d97706' : isCancelled ? '#dc2626' : '#b45309' }}>
                                {isPaymentPaid ? '🟢 Paid' : (ord.paymentStatus === 'refunded' || ord.paymentStatus === 'Refunded' || isRefunded) ? '💸 Refunded' : isCancelled ? '🔴 Rejected' : '🟡 Verification Pending'}
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      {/* Address */}
                      <div style={{ background: '#FFFDF2', borderRadius: '8px', padding: '6px 10px', fontSize: '0.74rem', color: 'var(--ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(0,0,0,0.03)' }}>
                        <span style={{ fontSize: '0.85rem' }}>📍</span>
                        <span style={{ wordBreak: 'break-word', lineHeight: 1.3 }}>{ord.deliveryAddress || 'Address not provided'}</span>
                      </div>

                      {/* Source badge */}
                      {ord._source === 'archive' && (
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#6b7280', textAlign: 'center', padding: '4px', background: '#f3f4f6', borderRadius: '6px' }}>
                          📂 From Archived Orders
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
