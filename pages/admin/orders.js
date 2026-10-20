import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
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
      return { color: '#b45309', bg: '#fef3c7', text: 'UPI VERIFICATION REQUIRED', icon: '💳' }
    case 'Pending':
      return { color: '#d97706', bg: '#fef3c7', text: 'PENDING CONFIRMATION', icon: '⏳' }
    case 'Accepted':
      return { color: '#1a73e8', bg: '#e8f0fe', text: 'ACCEPTED', icon: '👍' }
    case 'Preparing':
      return { color: '#d97706', bg: '#fef3c7', text: 'PREPARING IN KITCHEN', icon: '👨‍🍳' }
    case 'Ready':
      return { color: '#7e22ce', bg: '#f3e8ff', text: 'READY FOR PICKUP', icon: '🍱' }
    case 'Out For Delivery':
      return { color: '#0891b2', bg: '#e0f2fe', text: 'OUT FOR DELIVERY', icon: '🛵' }
    default:
      return { color: '#CB202D', bg: '#EFF3E6', text: (status || 'CONFIRMED').toUpperCase(), icon: '📦' }
  }
}

export default function AdminOrdersDesk() {
  const { user, isAdmin, accessToken } = useAuth()
  const [orders, setOrders] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const [mounted, setMounted] = useState(false)
  const [firestoreError, setFirestoreError] = useState(null)
  const [actionFeedback, setActionFeedback] = useState(null)
  const prevOrderCount = useRef(0)
  const isFirstLoad = useRef(true)

  // Click outside to close status dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setMounted(true)

    // Helper: check if a timestamp falls within today (IST)
    const isToday = (dateObj) => {
      const now = new Date()
      // Compare using IST date strings to avoid timezone edge cases
      const todayStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      const dateStr = dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      return todayStr === dateStr
    }

    const unsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
      setFirestoreError(null)
      const fetched = snapshot.docs.map((d) => {
        const data = d.data() || {}
        let dateObj = new Date()
        try {
          if (data.createdAt?.toDate) {
            dateObj = data.createdAt.toDate()
          } else if (data.createdAtSeconds) {
            dateObj = new Date(data.createdAtSeconds * 1000)
          } else if (data.createdAt && typeof data.createdAt === 'string') {
            dateObj = new Date(data.createdAt)
          }
          if (isNaN(dateObj.getTime())) dateObj = new Date()
        } catch (e) {
          dateObj = new Date()
        }

        const createdAtFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
          ' (' + dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')'

        return {
          id: d.id,
          ...data,
          createdAtFormatted,
          createdAtSeconds: Math.floor(dateObj.getTime() / 1000),
          _dateObj: dateObj
        }
      })

      // Only keep today's orders for Live Orders view
      const todayOrders = fetched.filter(o => isToday(o._dateObj))
      todayOrders.sort((a, b) => (b.createdAtSeconds || 0) - (a.createdAtSeconds || 0))

      if (!isFirstLoad.current && todayOrders.length > prevOrderCount.current) {
        try {
          const audio = new Audio('/sounds/notification.mp3')
          audio.play().catch(() => {})
        } catch (e) {}
      }

      isFirstLoad.current = false
      prevOrderCount.current = todayOrders.length
      setOrders(todayOrders)
    }, (err) => {
      setFirestoreError('Real-time sync paused. Check your connection.')
    })

    return () => unsub()
  }, [])

  const triggerFeedback = (msg) => {
    setActionFeedback(msg)
    setTimeout(() => setActionFeedback(null), 3500)
  }

  const handleUpdateStatus = async (orderId, newStatus) => {
    const targetOrd = orders.find(o => o.id === orderId || o.orderId === orderId)
    const paySt = (targetOrd?.paymentStatus || '').toLowerCase()
    const ordSt = (targetOrd?.orderStatus || targetOrd?.status || '').toLowerCase()
    const isPaid = paySt === 'paid' || paySt === 'verified' || ordSt === 'payment_verified'
      || ordSt === 'accepted' || ordSt === 'preparing' || ordSt === 'ready' || ordSt === 'out for delivery'

    // ── PAYMENT-FIRST RULE: staff cannot accept/advance an order until the
    // admin has verified & approved the UPI payment. Cancel stays allowed.
    if (newStatus !== 'Cancelled' && !isPaid) {
      triggerFeedback('⚠️ Admin must verify & approve the UPI payment before this order can be accepted or advanced.')
      return
    }

    if (newStatus === 'Cancelled') {
      if (!confirm('Are you sure you want to cancel this order?')) return

      const cleanDocId = String(orderId).replace(/^#/, '').trim()

      try {
        const targetDoc = doc(db, 'orders', cleanDocId)
        await updateDoc(targetDoc, {
          orderStatus: 'Cancelled',
          status: 'Cancelled',
          updatedAt: serverTimestamp(),
        }).catch(async () => {
          if (orderId !== cleanDocId) {
            await updateDoc(doc(db, 'orders', orderId), {
              orderStatus: 'Cancelled',
              status: 'Cancelled',
              updatedAt: serverTimestamp(),
            }).catch(() => {})
          }
        })

        fetch('/api/orders/cancel', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ orderId: cleanDocId, cancellationReason: 'Cancelled by Admin' })
        }).catch(() => {})

        triggerFeedback('Order cancelled successfully.')
        return
      } catch (e) {
        triggerFeedback('Error cancelling order: ' + e.message)
        return
      }
    }

    let newPaymentStatus = undefined
    if (newStatus === 'Delivered') {
      newPaymentStatus = 'paid'
    } else if (newStatus === 'Cancelled') {
      newPaymentStatus = 'rejected'
    }

    try {
      const targetDoc = doc(db, 'orders', orderId)
      const updateData = { orderStatus: newStatus, updatedAt: serverTimestamp() }
      if (newPaymentStatus) updateData.paymentStatus = newPaymentStatus
      await updateDoc(targetDoc, updateData)

      fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ orderId, status: newStatus, orderStatus: newStatus, paymentStatus: newPaymentStatus })
      }).catch(() => {})

      triggerFeedback(`Order status updated to ${newStatus}`)
    } catch (e) {
      triggerFeedback(`Status update error: ${e.message}`)
    }
  }

  const handleApprovePayment = async (orderId) => {
    try {
      const targetDoc = doc(db, 'orders', orderId)
      await updateDoc(targetDoc, {
        paymentStatus: 'paid',
        orderStatus: 'PAYMENT_VERIFIED',
        updatedAt: serverTimestamp()
      })

      fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ orderId, status: 'PAYMENT_VERIFIED', orderStatus: 'PAYMENT_VERIFIED', paymentStatus: 'paid' })
      }).catch(() => {})

      triggerFeedback(`UPI Payment Verified! Order set to Payment Verified.`)
    } catch (e) {
      triggerFeedback(`Error approving payment: ${e.message}`)
    }
  }

  const handleRejectPayment = async (orderId) => {
    if (!confirm('Reject UPI payment and cancel order?')) return
    try {
      const targetDoc = doc(db, 'orders', orderId)
      await updateDoc(targetDoc, {
        paymentStatus: 'rejected',
        orderStatus: 'Cancelled',
        updatedAt: serverTimestamp()
      })

      fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ orderId, status: 'Cancelled', orderStatus: 'Cancelled', paymentStatus: 'rejected', rejectionReason: 'UPI payment rejected by admin' })
      }).catch(() => {})

      triggerFeedback(`UPI Payment Rejected. Order Cancelled.`)
    } catch (e) {
      triggerFeedback(`Error rejecting payment: ${e.message}`)
    }
  }

  // Calculate Metrics
  const countUpiPending = orders.filter(o => o.paymentStatus === 'verification_pending' || o.paymentStatus === 'Verification Pending' || o.orderStatus === 'payment_verification_pending').length
  const countPending = orders.filter(o => o.orderStatus === 'Pending' || o.orderStatus === 'pending').length
  const countAccepted = orders.filter(o => o.orderStatus === 'Accepted' || o.orderStatus === 'accepted').length
  const countPreparing = orders.filter(o => o.orderStatus === 'Preparing' || o.orderStatus === 'preparing').length
  const countReady = orders.filter(o => o.orderStatus === 'Ready' || o.orderStatus === 'ready').length
  const countOut = orders.filter(o => o.orderStatus === 'Out For Delivery' || o.orderStatus === 'out_for_delivery').length
  const countDelivered = orders.filter(o => o.orderStatus === 'Delivered' || o.orderStatus === 'delivered').length
  const countCancelled = orders.filter(o => o.orderStatus === 'Cancelled' || o.orderStatus === 'cancelled' || o.orderStatus === 'rejected').length

  // Filter Logic
  const filteredOrders = orders.filter((o) => {
    // 1. Status Filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'UPI Verification Pending') {
        const isUpi = o.paymentStatus === 'verification_pending' || o.paymentStatus === 'Verification Pending' || o.orderStatus === 'payment_verification_pending'
        if (!isUpi) return false
      } else if (filterStatus === 'in_kitchen_transit') {
        const st = (o.orderStatus || o.status || '').toLowerCase()
        const isKitchenTransit = ['payment_verified', 'accepted', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'out for delivery'].includes(st)
        if (!isKitchenTransit) return false
      } else {
        if ((o.orderStatus || '').toLowerCase() !== filterStatus.toLowerCase()) return false
      }
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const nameMatch = (o.customerName || o.userName || '').toLowerCase().includes(q)
      const phoneMatch = (o.customerPhone || o.userPhone || '').toLowerCase().includes(q)
      const idMatch = (o.orderId || o.id || '').toLowerCase().includes(q)
      const addressMatch = (o.deliveryAddress || '').toLowerCase().includes(q)
      return nameMatch || phoneMatch || idMatch || addressMatch
    }

    return true
  })

  return (
    <AdminLayout activePage="orders" title="Orders Dashboard">
      <Head>
        <title>Orders Dashboard | Biryani Badshah Admin</title>
      </Head>

      <div className="admin-page-container">
        {/* Action Feedback Toast */}
        {actionFeedback && (
          <div style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            background: 'var(--ink, #0c0c0b)',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '0.86rem',
            fontWeight: 800,
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
          }}>
            {actionFeedback}
          </div>
        )}

        {/* HERO CONTROL CARD */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '24px', border: '1px solid rgba(203, 32, 45,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.02)', marginBottom: '24px' }}>
          {/* Header Row: Title & Search/Filter Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: 'var(--deep-green)', textTransform: 'uppercase' }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>🟢</span> LIVE ORDER STREAM — TODAY
              </span>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)', fontWeight: 900, color: 'var(--ink)', margin: '2px 0 0 0' }}>
                Today's Orders
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--muted)', fontWeight: 600 }}>
                Live orders placed today · For past orders, visit <Link href="/admin/all-orders" style={{ color: 'var(--deep-green)', fontWeight: 800, textDecoration: 'underline' }}>All Orders</Link>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flex: 1, maxWidth: '640px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
              {/* Standout Search Box */}
              <div className="admin-search-box" style={{ flex: '1 1 240px' }}>
                <span className="admin-search-icon" style={{ color: 'var(--deep-green)', opacity: 1 }}>🔍</span>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Search Order ID, Phone, Customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" className="admin-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>

              {/* Custom Status Dropdown Menu (Opens Inwards) */}
              <div ref={dropdownRef} style={{ position: 'relative', flex: '1 1 180px', minWidth: '160px', maxWidth: '240px' }}>
                <button
                  type="button"
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid rgba(203, 32, 45,0.18)',
                    background: '#ffffff',
                    fontSize: '0.84rem',
                    fontWeight: 800,
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    outline: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span>
                      {filterStatus === 'all' ? '📦' :
                       filterStatus === 'UPI Verification Pending' ? '💳' :
                       filterStatus === 'Pending' ? '⏳' :
                       filterStatus === 'Accepted' ? '👍' :
                       filterStatus === 'Preparing' ? '👨‍🍳' :
                       filterStatus === 'Ready' ? '🍱' :
                       filterStatus === 'Out For Delivery' ? '🛵' :
                       filterStatus === 'Delivered' ? '✅' : '❌'}
                    </span>
                    <span>
                      {filterStatus === 'all' ? `All (${orders.length})` :
                       filterStatus === 'UPI Verification Pending' ? `UPI (${countUpiPending})` :
                       filterStatus === 'Pending' ? `Pending (${countPending})` :
                       filterStatus === 'Accepted' ? `Accepted (${countAccepted})` :
                       filterStatus === 'Preparing' ? `Preparing (${countPreparing})` :
                       filterStatus === 'Ready' ? `Ready (${countReady})` :
                       filterStatus === 'Out For Delivery' ? `Out Delivery (${countOut})` :
                       filterStatus === 'Delivered' ? `Delivered (${countDelivered})` : `Cancelled (${countCancelled})`}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.65rem', opacity: 0.6, transform: statusDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', marginLeft: '6px' }}>▼</span>
                </button>

                {statusDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      background: '#ffffff',
                      borderRadius: '14px',
                      border: '1px solid rgba(203, 32, 45,0.18)',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                      padding: '6px',
                      minWidth: '220px',
                      maxWidth: 'calc(100vw - 32px)',
                      zIndex: 2000,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}
                  >
                    {[
                      { id: 'all', label: 'All Orders', icon: '📦', count: orders.length },
                      { id: 'UPI Verification Pending', label: 'UPI Verification', icon: '💳', count: countUpiPending, highlight: countUpiPending > 0 },
                      { id: 'Pending', label: 'Pending Confirmation', icon: '⏳', count: countPending, highlight: countPending > 0 },
                      { id: 'in_kitchen_transit', label: 'In Kitchen & Transit', icon: '👨‍🍳 🛵', count: countAccepted + countPreparing + countReady + countOut },
                      { id: 'Accepted', label: 'Accepted Orders', icon: '👍', count: countAccepted },
                      { id: 'Preparing', label: 'Preparing in Kitchen', icon: '👨‍🍳', count: countPreparing },
                      { id: 'Ready', label: 'Ready for Pickup', icon: '🍱', count: countReady },
                      { id: 'Out For Delivery', label: 'Out For Delivery', icon: '🛵', count: countOut },
                      { id: 'Delivered', label: 'Delivered & Closed', icon: '✅', count: countDelivered },
                      { id: 'Cancelled', label: 'Cancelled Orders', icon: '❌', count: countCancelled }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFilterStatus(opt.id)
                          setStatusDropdownOpen(false)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: filterStatus === opt.id ? 'rgba(203, 32, 45,0.08)' : 'transparent',
                          color: filterStatus === opt.id ? 'var(--deep-green)' : 'var(--ink)',
                          fontWeight: filterStatus === opt.id ? 900 : 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{opt.icon}</span>
                          <span>{opt.label}</span>
                        </span>
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: opt.highlight ? '#f59e0b' : 'rgba(0,0,0,0.06)',
                          color: opt.highlight ? '#ffffff' : 'var(--ink)'
                        }}>
                          {opt.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Descriptive Flat Stat Cards (12px Radius, 16px Spacing) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {/* Card 1: All Orders */}
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              style={{
                borderRadius: '12px',
                padding: '14px 16px',
                border: filterStatus === 'all' ? '2px solid var(--deep-green)' : '1px solid rgba(0,0,0,0.06)',
                background: filterStatus === 'all' ? 'rgba(203, 32, 45,0.05)' : '#FFFDF2',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.18s ease'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📦 ALL ORDERS
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--deep-green)', marginTop: '4px' }}>
                {orders.length} <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>total</span>
              </div>
            </button>

            {/* Card 2: Requires Attention */}
            <button
              type="button"
              onClick={() => setFilterStatus(countUpiPending > 0 ? 'UPI Verification Pending' : 'Pending')}
              style={{
                borderRadius: '12px',
                padding: '14px 16px',
                border: (countUpiPending + countPending) > 0 ? '1.5px solid #f59e0b' : '1px solid rgba(0,0,0,0.06)',
                background: (countUpiPending + countPending) > 0 ? '#fffbeb' : '#FFFDF2',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.18s ease'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: (countUpiPending + countPending) > 0 ? '#b45309' : 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ⚡ REQUIRES ATTENTION
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: (countUpiPending + countPending) > 0 ? '#b45309' : 'var(--ink)', marginTop: '4px' }}>
                {countUpiPending + countPending} <span style={{ fontSize: '0.75rem', fontWeight: 700, color: (countUpiPending + countPending) > 0 ? '#d97706' : 'var(--muted)' }}>pending</span>
              </div>
            </button>

            {/* Card 3: Kitchen & Transit */}
            <button
              type="button"
              onClick={() => setFilterStatus('in_kitchen_transit')}
              style={{
                borderRadius: '12px',
                padding: '14px 16px',
                border: filterStatus === 'in_kitchen_transit' ? '2px solid var(--deep-green)' : '1px solid rgba(0,0,0,0.06)',
                background: filterStatus === 'in_kitchen_transit' ? 'rgba(203, 32, 45,0.05)' : '#FFFDF2',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.18s ease'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                👨‍🍳 🛵 IN KITCHEN & TRANSIT
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--ink)', marginTop: '4px' }}>
                {countAccepted + countPreparing + countReady + countOut} <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>active</span>
              </div>
            </button>

            {/* Card 4: Delivered & Closed */}
            <button
              type="button"
              onClick={() => setFilterStatus('Delivered')}
              style={{
                borderRadius: '12px',
                padding: '14px 16px',
                border: filterStatus === 'Delivered' ? '2px solid var(--deep-green)' : '1px solid rgba(0,0,0,0.06)',
                background: filterStatus === 'Delivered' ? 'rgba(203, 32, 45,0.05)' : '#FFFDF2',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.18s ease'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ✅ DELIVERED & CLOSED
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--deep-green)', marginTop: '4px' }}>
                {countDelivered} <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>completed</span>
              </div>
            </button>
          </div>
        </div>

        {/* 2-COLUMN RESPONSIVE ORDERS CARDS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredOrders.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '60px 20px', background: '#ffffff', borderRadius: '16px', textAlign: 'center', border: '1px dashed rgba(0,0,0,0.12)' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                {searchQuery ? `No orders matching "${searchQuery}"` : 'No orders found under this status filter.'}
              </p>
            </div>
          ) : (
            filteredOrders.map((ord) => {
              const isDelivered = ord.orderStatus === 'Delivered' || ord.orderStatus === 'delivered'
              const isCancelled = ord.orderStatus === 'Cancelled' || ord.orderStatus === 'cancelled' || ord.orderStatus === 'rejected' || ord.orderStatus === 'Payment Failed' || ord.paymentStatus === 'rejected' || ord.paymentStatus === 'Payment Failed'
              const isRefunded = ord.orderStatus === 'Refunded' || ord.orderStatus === 'refunded' || ord.paymentStatus === 'refunded' || ord.paymentStatus === 'Refunded' || (ord.refund?.status || '').toUpperCase() === 'REFUNDED'
              const isLocked = isDelivered || isCancelled || isRefunded
              const customerName = ord.customerName || ord.userName || 'Customer'
              const initials = getInitials(customerName)
              const rawPhone = (ord.customerPhone || ord.userPhone || '').replace(/[^0-9]/g, '')
              const displayId = ord.orderId || ord.id?.slice(0, 8) || 'UNKNOWN'
              const waMessage = encodeURIComponent(`Hi ${customerName}, updating you regarding your Biryani Badshah Order #${displayId} (Status: ${ord.orderStatus || 'Confirmed'}).`)
              const statusMeta = getStatusMeta(ord.orderStatus, isDelivered, isCancelled)

              return (
                <div
                  key={ord.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    border: '1.5px solid rgba(203, 32, 45,0.12)',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.04)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    position: 'relative',
                    fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif"
                  }}
                >
                  {/* TOP COLORED STATUS ACCENT BAR */}
                  <div style={{ height: '5px', width: '100%', background: statusMeta.color }} />

                  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* HEADER STRIP: Status Meta & Prominent SECOND PRIORITY Order ID */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      padding: '8px 12px',
                      background: statusMeta.bg,
                      borderRadius: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 900, color: statusMeta.color, letterSpacing: '0.04em', fontFamily: "'Outfit', sans-serif" }}>
                          {statusMeta.icon} {statusMeta.text}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)' }}>
                          • {ord.createdAtFormatted}
                        </span>
                      </div>

                      {/* SECOND PRIORITY VISUAL ANCHOR: Standout Monospace Order ID */}
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: '#ffffff',
                        border: '1.5px solid var(--deep-green)',
                        padding: '4px 11px',
                        borderRadius: '8px',
                        boxShadow: '0 2px 6px rgba(203, 32, 45,0.1)'
                      }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Outfit', sans-serif" }}>ID:</span>
                        <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--deep-green)', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono', monospace" }}>
                          #{ord.orderId || ord.id?.slice(0, 8) || 'UNKNOWN'}
                        </span>
                      </div>
                    </div>

                    {/* PRIMARY FOCUS (#1 CENTER OF ATTENTION): WHAT HE ORDERED */}
                    <div style={{
                      background: 'linear-gradient(180deg, #ffffff 0%, #f6fbf8 100%)',
                      border: '2px solid rgba(203, 32, 45,0.2)',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      boxShadow: '0 4px 16px rgba(203, 32, 45,0.06)',
                      position: 'relative'
                    }}>
                      {/* Box Header Label */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 900,
                          letterSpacing: '0.08em',
                          color: 'var(--deep-green)',
                          textTransform: 'uppercase',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontFamily: "'Outfit', sans-serif"
                        }}>
                          🍱 ORDERED ITEMS & QUANTITIES
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', background: 'rgba(0,0,0,0.04)', padding: '2px 8px', borderRadius: '999px', fontFamily: "'Outfit', sans-serif" }}>
                          {ord.items?.reduce((sum, i) => sum + (i.qty || i.quantity || 1), 0) || 0} Total Items
                        </span>
                      </div>

                      {/* Items List with Formatted Separation */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                        {ord.items?.map((item, idx) => {
                          const qty = Number(item.qty || item.quantity || 1)
                          const unitPrice = Number(item.price || 0)
                          const itemTotal = (unitPrice * qty).toFixed(0)

                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '14px',
                                padding: '10px 12px',
                                background: '#ffffff',
                                borderRadius: '10px',
                                border: '1px solid rgba(203, 32, 45,0.1)',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                              }}
                            >
                              {/* Left: Quantity Badge + Item Title */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                <span style={{
                                  background: 'var(--deep-green)',
                                  color: '#ffffff',
                                  fontSize: '0.84rem',
                                  fontWeight: 900,
                                  padding: '3px 9px',
                                  borderRadius: '6px',
                                  flexShrink: 0,
                                  fontFamily: "'Outfit', sans-serif"
                                }}>
                                  {qty}x
                                </span>
                                <span style={{
                                  fontSize: '0.94rem',
                                  fontWeight: 800,
                                  color: 'var(--ink)',
                                  fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
                                  lineHeight: 1.3,
                                  wordBreak: 'break-word'
                                }}>
                                  {item.title || item.name}
                                </span>
                              </div>

                              {/* Right: Formatted Price Tag Badge */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                                <span style={{
                                  fontSize: '0.92rem',
                                  fontWeight: 900,
                                  color: 'var(--deep-green)',
                                  background: 'rgba(203, 32, 45,0.08)',
                                  border: '1px solid rgba(203, 32, 45,0.18)',
                                  padding: '3px 10px',
                                  borderRadius: '8px',
                                  fontFamily: "'Outfit', sans-serif",
                                  letterSpacing: '-0.01em',
                                  whiteSpace: 'nowrap'
                                }}>
                                  ₹{itemTotal}
                                </span>
                                {qty > 1 && (
                                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', marginTop: '2px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                    ₹{unitPrice.toFixed(0)} / ea
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* GRAND TOTAL HIGHLIGHT */}
                      <div style={{
                        borderTop: '2px dashed rgba(203, 32, 45,0.2)',
                        paddingTop: '10px',
                        marginTop: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between'
                      }}>
                        <div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif" }}>
                            GRAND TOTAL AMOUNT
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--deep-green)', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            Inclusive of all taxes & delivery
                          </span>
                        </div>
                        <strong style={{ fontSize: '1.65rem', fontWeight: 900, color: 'var(--deep-green)', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>
                          ₹{(Number(ord.grandTotal) || 0).toFixed(0)}
                        </strong>
                      </div>
                    </div>

                    {/* SHAPED AROUND #1: Customer Details & Payment Info (2-Column Grid) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {/* Customer Info Card */}
                      <div style={{
                        background: '#fafaf6',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        border: '1px solid rgba(0,0,0,0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        justify: 'space-between'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'var(--deep-green)',
                            color: '#ffffff',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 900,
                            fontSize: '0.78rem',
                            flexShrink: 0,
                            fontFamily: "'Outfit', sans-serif"
                          }}>
                            {initials}
                          </div>
                          <div style={{ overflow: 'hidden' }}>
                            <h4 style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--ink)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Outfit', sans-serif" }}>
                              {customerName}
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 700 }}>
                              📞 {ord.customerPhone || ord.userPhone || 'No Phone'}
                            </p>
                          </div>
                        </div>

                        {rawPhone && (
                          <a
                            href={`https://wa.me/91${rawPhone}?text=${waMessage}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justify: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              background: '#25d366',
                              color: '#ffffff',
                              borderRadius: '6px',
                              textDecoration: 'none',
                              marginTop: '4px',
                              fontFamily: "'Outfit', sans-serif"
                            }}
                          >
                            WhatsApp 💬
                          </a>
                        )}
                      </div>

                      {/* Payment Card */}
                      {(() => {
                        const isPaymentPaid = ord.paymentStatus === 'paid' || ord.paymentStatus === 'Paid' || Boolean(ord.razorpayPaymentId) || ord.paymentVerifiedBy === 'CLIENT_VERIFY'
                        return (
                          <div style={{
                            background: isPaymentPaid ? '#EFF3E6' : (ord.paymentStatus === 'refunded' || ord.paymentStatus === 'Refunded' || isRefunded) ? '#fff7ed' : isCancelled ? '#fce8e6' : '#fef3c7',
                            borderRadius: '12px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            justify: 'space-between',
                            border: '1px solid rgba(0,0,0,0.05)'
                          }}>
                            <div>
                              <div style={{ fontSize: '0.76rem', fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                💳 {ord.paymentMethod === 'RAZORPAY' || ord.isRazorpay || ord.razorpayPaymentId ? 'Razorpay Online' : (ord.paymentMethod === 'UPI' ? 'UPI Online' : 'Cash on Delivery')}
                              </div>

                              <div style={{ fontSize: '0.76rem', fontWeight: 900, marginTop: '2px', color: isPaymentPaid ? '#CB202D' : (ord.paymentStatus === 'refunded' || ord.paymentStatus === 'Refunded' || isRefunded) ? '#d97706' : isCancelled ? '#dc2626' : '#b45309' }}>
                                {isPaymentPaid ? '🟢 Paid' : (ord.paymentStatus === 'refunded' || ord.paymentStatus === 'Refunded' || isRefunded) ? '💸 Refunded' : isCancelled ? '🔴 Rejected' : '🟡 Verification Pending'}
                              </div>

                              {ord.transactionReference && (
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ink)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  Ref: {ord.transactionReference}
                                </div>
                              )}
                            </div>

                            {!isLocked && !isPaymentPaid && (ord.paymentStatus === 'verification_pending' || ord.paymentStatus === 'Verification Pending' || ord.orderStatus === 'payment_verification_pending') && (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleApprovePayment(ord.id)}
                                  style={{ background: 'var(--deep-green)', color: '#ffffff', border: 'none', padding: '5px', borderRadius: '6px', fontWeight: 900, fontSize: '0.7rem', cursor: 'pointer', width: '100%' }}
                                >
                                  Approve ✅
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectPayment(ord.id)}
                                  style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '5px 8px', borderRadius: '6px', fontWeight: 900, fontSize: '0.7rem', cursor: 'pointer' }}
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* SHAPED AROUND #2: Delivery Location Strip */}
                    <div style={{ background: '#FFFDF2', borderRadius: '10px', padding: '8px 12px', fontSize: '0.78rem', color: 'var(--ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(0,0,0,0.04)' }}>
                      <span style={{ fontSize: '0.9rem' }}>📍</span>
                      <span style={{ wordBreak: 'break-word', lineHeight: 1.3 }}>{ord.deliveryAddress || 'Patna Delivery Address'}</span>
                    </div>

                    {/* SHAPED AROUND #3: Pipeline Controls / Action Buttons */}
                    <div>
                      {isDelivered ? (
                        <div style={{ padding: '8px 12px', borderRadius: '10px', background: '#EFF3E6', color: '#CB202D', fontWeight: 900, fontSize: '0.82rem', textAlign: 'center' }}>
                          Delivered ✓
                        </div>
                      ) : isCancelled ? (
                        <div style={{ padding: '8px 12px', borderRadius: '10px', background: '#fce8e6', color: '#dc2626', fontWeight: 900, fontSize: '0.82rem', textAlign: 'center' }}>
                          ❌ Cancelled
                        </div>
                      ) : (
                        <div className="pipeline-container" style={{ margin: 0, padding: '6px', gap: '4px' }}>
                          {[
                            { key: 'Accepted', label: 'Accept', color: '#1a73e8' },
                            { key: 'Preparing', label: 'Preparing', color: '#d97706' },
                            { key: 'Ready', label: 'Ready', color: '#7e22ce' },
                            { key: 'Out For Delivery', label: 'Out Delivery', color: '#0891b2' },
                            { key: 'Delivered', label: 'Delivered', color: '#CB202D' },
                            { key: 'Cancelled', label: 'Cancel', color: '#dc2626' }
                          ].map(stepBtn => {
                            const isCurrent = ord.orderStatus === stepBtn.key
                            return (
                              <button
                                key={stepBtn.key}
                                disabled={isLocked}
                                onClick={() => handleUpdateStatus(ord.id, stepBtn.key)}
                                className={`pipeline-btn ${isCurrent ? 'active' : ''}`}
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '5px 8px',
                                  borderColor: isCurrent ? stepBtn.color : undefined,
                                  background: isCurrent ? stepBtn.color : undefined
                                }}
                              >
                                {stepBtn.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
