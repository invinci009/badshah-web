import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import SiteNav from '../components/SiteNav'
import MobileBottomBar from '../components/MobileBottomBar'
import StatusBadge from '../components/StatusBadge'
import ToastNotification from '../components/ToastNotification'

export default function MyOrdersPage() {
  const router = useRouter()
  const { user, isAdmin, openAuthModal, accessToken } = useAuth()
  const [orders, setOrders] = useState([])
  const [archivedOrders, setArchivedOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [toast, setToast] = useState(null)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const confirmationShownRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const triggerToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4500)
  }

  // Handle post-payment confirmation redirect parameters (fires once)
  useEffect(() => {
    if (!router.isReady) return
    if (confirmationShownRef.current) return
    if (!router.query?.success || !router.query?.orderId) return

    const targetId = router.query.orderId
    confirmationShownRef.current = true

    // Show success toast
    triggerToast(`🎉 Payment confirmed! Order #${targetId} placed successfully.`)

    // Auto-select the order receipt modal
    const matchingOrder = orders.find(o => o.orderId === targetId || o.id === targetId)
    if (matchingOrder && !selectedOrder) {
      setSelectedOrder(matchingOrder)
    }

    // Clean the URL to prevent re-triggering on refresh
    try {
      router.replace('/my-orders', undefined, { shallow: true }).catch(() => {})
    } catch (e) {}
  }, [router.isReady, router.query, orders])

  // 1. One-time fetch for archived completed orders of this user
  useEffect(() => {
    if (!user) return
    try {
      const archiveQ = query(
        collection(db, 'orders_archive'),
        where('userId', '==', user.uid)
      )
      getDocs(archiveQ).then(snap => {
        const fetched = snap.docs.map(docSnap => {
          const data = docSnap.data()
          let dateStr = new Date().toLocaleDateString()
          let createdMs = Date.now()
          try {
            if (data.createdAt?.toDate) {
              const d = data.createdAt.toDate()
              createdMs = d.getTime()
              dateStr = d.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            } else if (data.createdAtSeconds) {
              createdMs = data.createdAtSeconds * 1000
              dateStr = new Date(createdMs).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            } else if (data.createdAt) {
              const d = new Date(data.createdAt)
              createdMs = d.getTime() || Date.now()
              dateStr = d.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            }
          } catch (e) {}

          return {
            id: docSnap.id,
            orderId: data.orderId || docSnap.id,
            ...data,
            createdAt: dateStr,
            createdMs
          }
        })
        setArchivedOrders(fetched)
      }).catch(e => console.warn('Archived user orders notice:', e.message))
    } catch (e) {}
  }, [user])


  // 2. Realtime listener strictly for active orders of this user
  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)

    let unsubscribe = () => {}
    try {
      const ordersRef = collection(db, 'orders')
      const q = query(ordersRef, where('userId', '==', user.uid))

      unsubscribe = onSnapshot(q, (snapshot) => {
        const activeList = snapshot.docs.map(docSnap => {
          const data = docSnap.data()
          let dateStr = new Date().toLocaleDateString()
          let createdMs = Date.now()
          try {
            if (data.createdAt?.toDate) {
              const d = data.createdAt.toDate()
              createdMs = d.getTime()
              dateStr = d.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            } else if (data.createdAtSeconds) {
              createdMs = data.createdAtSeconds * 1000
              dateStr = new Date(createdMs).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            } else if (data.createdAt) {
              const d = new Date(data.createdAt)
              createdMs = d.getTime() || Date.now()
              dateStr = d.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            }
          } catch (e) {}

          return {
            id: docSnap.id,
            orderId: data.orderId || docSnap.id,
            ...data,
            createdAt: dateStr,
            createdMs
          }
        })

        // Sort newest first
        activeList.sort((a, b) => b.createdMs - a.createdMs)
        setOrders(activeList)
        setLoading(false)
      }, (err) => {
        console.warn('Realtime orders listener notice:', err.message)
        setLoading(false)
      })
    } catch (e) {
      setLoading(false)
    }

    return () => unsubscribe()
  }, [user])

  const getStatusColor = (status) => {
    switch (status) {
      case 'verification_pending':
      case 'payment_verification_pending':
      case 'Awaiting Payment Verification':
      case 'Pending':
        return { bg: 'rgba(203, 32, 45, 0.18)', color: '#A05A22', border: 'rgba(203, 32, 45, 0.4)' }
      case 'paid':
      case 'accepted':
      case 'Accepted':
      case 'CONFIRMED':
      case 'Confirmed':
        return { bg: 'rgba(203, 32, 45, 0.15)', color: 'var(--deep-green)', border: 'rgba(203, 32, 45, 0.3)' }
      case 'preparing':
      case 'Preparing':
        return { bg: 'rgba(255, 140, 0, 0.15)', color: '#d97706', border: 'rgba(255, 140, 0, 0.3)' }
      case 'ready':
      case 'Ready':
        return { bg: 'rgba(147, 51, 234, 0.15)', color: '#7e22ce', border: 'rgba(147, 51, 234, 0.3)' }
      case 'out_for_delivery':
      case 'Out For Delivery':
        return { bg: 'rgba(6, 182, 212, 0.15)', color: '#0891b2', border: 'rgba(6, 182, 212, 0.3)' }
      case 'delivered':
      case 'Delivered':
        return { bg: 'rgba(203, 32, 45, 0.25)', color: 'var(--deep-green)', border: 'rgba(203, 32, 45, 0.4)' }
      case 'rejected':
      case 'cancelled':
      case 'Cancelled':
      case 'Payment Failed':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' }
      default:
        return { bg: 'rgba(0, 0, 0, 0.08)', color: 'var(--ink)', border: 'rgba(0, 0, 0, 0.15)' }
    }
  }

  const standardSteps = ['Order Placed', 'Payment Verified', 'Accepted', 'Preparing', 'Ready', 'Out For Delivery', 'Delivered']

  const getStandardStepIndex = (order) => {
    const rawSt = (order.orderStatus || order.status || '').toLowerCase()
    const paySt = (order.paymentStatus || '').toLowerCase()

    if (rawSt === 'delivered') return 6
    if (rawSt === 'out_for_delivery' || rawSt === 'out for delivery') return 5
    if (rawSt === 'ready' || rawSt === 'ready_for_delivery') return 4
    if (rawSt === 'preparing') return 3
    if (rawSt === 'accepted' || rawSt === 'confirmed') return 2
    if (rawSt === 'payment_verified' || paySt === 'paid' || paySt === 'verified' || order.paymentVerifiedBy) return 1
    return 0 // Order Placed
  }

  const getStatusEmoji = (step) => {
    const map = {
      'Order Placed': '📋',
      'Payment Verification Pending': '🔄',
      'Payment Verified': '✅',
      'Accepted': '👍',
      'Preparing': '👨‍🍳',
      'Ready': '🍱',
      'Out For Delivery': '🛵',
      'Delivered': '🎉'
    }
    return map[step] || '📌'
  }

  useEffect(() => {
    if (selectedOrder) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selectedOrder])

  return (
    <>
      <Head>
        <title>My Orders | Biryani Badshah</title>
        <meta name="description" content="Track your Biryani Badshah orders live from kitchen preparation to delivery." />
      </Head>

      <ToastNotification toast={toast} />

      <SiteNav activeTab="orders" isNavOpen={isNavOpen} setIsNavOpen={setIsNavOpen} />

      <main style={{ paddingBottom: '90px', background: '#FFFDF2', minHeight: '100vh', paddingTop: '90px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 16px' }}>
          
          {/* Header Card */}
          <div style={{ background: '#ffffff', borderRadius: '24px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(203, 32, 45,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.2em', color: 'var(--deep-green)', textTransform: 'uppercase' }}>
              REAL-TIME ORDER TRACKING
            </span>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '2.2rem', fontWeight: 800, color: 'var(--ink)', margin: '4px 0 6px 0', fontStyle: 'italic' }}>
              My Orders & History
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: 0 }}>
              Track live food prep updates and delivery status for your dum biryanis.
            </p>
          </div>

          {!user ? (
            <div style={{ background: '#ffffff', borderRadius: '24px', padding: '40px 24px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔒</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Sign in to View Your Orders</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '20px' }}>Sign in to track live orders and view your order history.</p>
              <button type="button" onClick={openAuthModal} className="btn" style={{ padding: '14px 32px' }}>
                SIGN IN NOW →
              </button>
            </div>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>⏳</div>
              <p style={{ fontWeight: 700, color: 'var(--muted)' }}>Loading your orders...</p>
            </div>
          ) : orders.length === 0 && archivedOrders.length === 0 ? (
            <div style={{ background: '#ffffff', borderRadius: '24px', padding: '40px 24px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🍛</div>
              <h2>No Orders Placed Yet</h2>
              <p>Explore our authentic charcoal kawabs and dum biryanis to place your first order!</p>
              <Link href="/menu" className="btn" style={{ padding: '14px 32px' }}>EXPLORE MENU</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {orders.map((order) => {
                const statusStyle = getStatusColor(order.orderStatus || 'Confirmed')
                const activeSteps = standardSteps
                const currentStepIdx = getStandardStepIndex(order)

                return (
                  <div
                    key={order.id || order.orderId}
                    className="order-card-mobile"
                    style={{
                      background: '#ffffff',
                      borderRadius: '24px',
                      padding: '24px',
                      border: '1px solid rgba(203, 32, 45,0.1)',
                      boxShadow: '0 6px 24px rgba(0,0,0,0.04)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    {/* Order Card Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <div onClick={() => setSelectedOrder(order)} style={{ cursor: 'pointer' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.15em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                          ORDER ID
                        </span>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--ink)', margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                          #{order.orderId || order.id?.slice(0, 8)}
                        </h3>
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{order.createdAt}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span className="status-badge" style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}`, fontWeight: 900 }}>
                          ● {order.orderStatus || 'Confirmed'}
                        </span>
                      </div>
                    </div>

                    {/* Progress Timeline */}
                    <div className="order-progress-horizontal" style={{ margin: '16px 0', padding: '16px', background: '#FFFDF2', borderRadius: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', margin: '0 10px' }}>
                        {activeSteps.map((step, idx) => {
                          const isDone = currentStepIdx >= idx
                          const isCurrent = currentStepIdx === idx
                          return (
                            <div key={step} style={{ textAlign: 'center', zIndex: 1, flex: 1 }}>
                              <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: isDone ? 'var(--deep-green)' : '#e0e0e0',
                                color: isDone ? '#ffffff' : '#888888',
                                display: 'grid', placeItems: 'center',
                                margin: '0 auto 6px', fontSize: '0.75rem', fontWeight: '800',
                                border: isCurrent ? '3px solid var(--yellow)' : 'none'
                              }}>
                                {isDone ? '✓' : idx + 1}
                              </div>
                              <span style={{ fontSize: '0.68rem', fontWeight: isCurrent ? 800 : 600, color: isCurrent ? 'var(--deep-green)' : 'var(--muted)', display: 'block' }}>
                                {step}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Mobile Timeline */}
                    <div className="order-timeline-vertical" style={{ margin: '12px 0', padding: '16px', background: '#FFFDF2', borderRadius: '16px' }}>
                      {activeSteps.map((step, idx) => {
                        const isDone = currentStepIdx >= idx
                        const isCurrent = currentStepIdx === idx
                        const isPending = currentStepIdx < idx
                        return (
                          <div key={step} className={`timeline-step ${isDone && !isCurrent ? 'done' : ''}`}>
                            <div className={`timeline-dot ${isDone && !isCurrent ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}>
                              {isDone ? '✓' : getStatusEmoji(step)}
                            </div>
                            <div className="timeline-info">
                              <p className={`timeline-label ${isPending ? 'muted' : ''}`}>{step}</p>
                              {isCurrent && <p className="timeline-sublabel">Current status</p>}
                              {isDone && !isCurrent && <p className="timeline-sublabel">Completed</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', cursor: 'pointer' }} onClick={() => setSelectedOrder(order)}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {order.items?.length || 0} item{(order.items?.length || 0) === 1 ? '' : 's'} · Tap for receipt
                      </span>
                      <strong style={{ fontSize: '1.2rem', color: 'var(--deep-green)', fontFamily: "'Outfit', sans-serif" }}>
                        ₹{(Number(order.grandTotal) || 0).toFixed(0)}
                      </strong>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Order Detail Receipt Bottom Sheet */}
      {selectedOrder && (
        <div className="co-overlay" aria-hidden="false" style={{ opacity: 1, visibility: 'visible', zIndex: 5000, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <button type="button" className="co-backdrop" onClick={() => setSelectedOrder(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer' }} />
          <div className="order-detail-sheet" style={{ position: 'relative', zIndex: 10, width: 'min(540px, 94vw)', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', color: '#111827', borderRadius: '28px', padding: '24px 28px', boxShadow: '0 30px 60px rgba(0, 0, 0, 0.4)' }}>
            <div className="sheet-handle" style={{ width: '40px', height: '4px', background: '#e5e7eb', borderRadius: '2px', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--deep-green)', letterSpacing: '0.15em' }}>ORDER RECEIPT</span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>#{selectedOrder.orderId}</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.1rem', display: 'grid', placeItems: 'center', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ padding: '14px 18px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '16px', marginBottom: '20px', color: '#1f2937' }}>
              <p style={{ margin: '0 0 6px 0', fontSize: '0.88rem', color: '#1f2937' }}><strong style={{ color: '#111827' }}>Customer:</strong> {selectedOrder.customerName || selectedOrder.userName}</p>
              <p style={{ margin: '0 0 6px 0', fontSize: '0.88rem', color: '#1f2937' }}><strong style={{ color: '#111827' }}>Phone:</strong> {selectedOrder.customerPhone || selectedOrder.userPhone}</p>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#1f2937' }}><strong style={{ color: '#111827' }}>Address:</strong> {selectedOrder.deliveryAddress}</p>
            </div>

            <h4 style={{ fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--deep-green)', marginBottom: '12px', fontWeight: 800 }}>ORDERED ITEMS</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {selectedOrder.items?.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.92rem', padding: '12px 16px', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '12px', color: '#1f2937' }}>
                  <span style={{ color: '#1f2937' }}>{item.title || item.name} <strong style={{ color: 'var(--deep-green)' }}>x{item.qty || item.quantity}</strong></span>
                  <strong style={{ color: '#111827' }}>₹{((Number(item.price) || 0) * (Number(item.qty || item.quantity) || 1)).toFixed(0)}</strong>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: '800', color: '#111827' }}>
              <span>Total Paid</span>
              <span style={{ color: 'var(--deep-green)' }}>₹{(Number(selectedOrder.grandTotal) || 0).toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Bar */}
      <MobileBottomBar activeTab="orders" />
    </>
  )
}
