import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { collection, onSnapshot, getDocs, getCountFromServer } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import AdminLayout from '../../components/AdminLayout'

export default function AdminDashboard() {
  const [orders, setOrders] = useState([])
  const [archivedOrders, setArchivedOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [usersList, setUsersList] = useState([])

  // One-time static reads & active orders listener
  useEffect(() => {
    // 1. One-time read for Menu items & Users list
    getDocs(collection(db, 'menu')).then(snap => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }).catch(err => console.warn('Menu fetch notice:', err.message))

    getDocs(collection(db, 'users')).then(snap => {
      setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }).catch(err => console.warn('Users fetch notice:', err.message))

    // 2. Fetch completed/archived orders once for metrics
    getDocs(collection(db, 'orders_archive')).then(snap => {
      setArchivedOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }).catch(err => console.warn('Archive fetch notice:', err.message))

    // 3. Realtime sync for active orders only (orders collection contains active orders)
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => console.warn('Orders snap notice:', err.message))

    return () => unsubOrders()
  }, [])

  // Calculate Metrics from Active + Archived Orders
  const allCombinedOrders = [...orders, ...archivedOrders]

  const pendingCount = orders.filter(o => {
    const st = (o.orderStatus || o.status || '').toLowerCase()
    return st === 'pending' || st === 'upi verification pending' || st === 'payment_verification_pending' || st === 'accepted' || st === 'preparing'
  }).length

  const completedCount = allCombinedOrders.filter(o => (o.orderStatus || o.status || '').toLowerCase() === 'delivered').length

  const totalRevenue = allCombinedOrders.filter(o => {
    const st = (o.orderStatus || o.status || '').toLowerCase()
    const paySt = (o.paymentStatus || '').toLowerCase()
    return paySt === 'paid' || paySt === 'verified' || st === 'accepted' || st === 'confirmed' || st === 'delivered'
  }).reduce((sum, o) => sum + (o.grandTotal || o.amount || 0), 0)

  const totalOrderCount = allCombinedOrders.length

  return (
    <AdminLayout activePage="dashboard" title="Overview Dashboard">
      <Head>
        <title>Overview Dashboard | Biryani Badshah Admin</title>
      </Head>

      <div className="admin-page-container">
        {/* HERO HEADER CARD */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '24px', border: '1px solid rgba(203, 32, 45,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.02)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: 'var(--deep-green)', textTransform: 'uppercase' }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>🟢</span> LIVE SYNC ACTIVE
              </span>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)', fontWeight: 900, color: 'var(--ink)', margin: '2px 0 0 0' }}>
                Overview Dashboard
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--muted)', fontWeight: 600 }}>
                Real-time store metrics & operational summary
              </p>
            </div>

            <Link
              href="/admin/orders"
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                background: 'var(--deep-green)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '0.84rem',
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(203, 32, 45,0.2)'
              }}
            >
              Open Live Orders Desk →
            </Link>
          </div>

          {/* Metric Cards Grid (12px Radius, Clean Alignment) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div style={{ borderRadius: '12px', padding: '16px', background: '#FFFDF2', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📦 TOTAL ORDERS
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--ink)', marginTop: '4px' }}>
                {totalOrderCount}
              </div>
            </div>

            <div style={{ borderRadius: '12px', padding: '16px', background: pendingCount > 0 ? '#fffbeb' : '#FFFDF2', border: pendingCount > 0 ? '1.5px solid #f59e0b' : '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: pendingCount > 0 ? '#b45309' : 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ⚡ PENDING / ACTIVE
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: pendingCount > 0 ? '#b45309' : 'var(--ink)', marginTop: '4px' }}>
                {pendingCount}
              </div>
            </div>

            <div style={{ borderRadius: '12px', padding: '16px', background: '#FFFDF2', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ✅ COMPLETED ORDERS
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--deep-green)', marginTop: '4px' }}>
                {completedCount}
              </div>
            </div>

            <div style={{ borderRadius: '12px', padding: '16px', background: 'var(--deep-green)', border: '1px solid var(--deep-green)', color: '#ffffff', boxShadow: '0 4px 14px rgba(203, 32, 45,0.2)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.8)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                💰 TOTAL REVENUE
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                ₹{totalRevenue.toFixed(0)}
              </div>
            </div>
          </div>
        </div>

        {/* RECENT ORDERS LIST */}
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '24px', border: '1px solid rgba(203, 32, 45,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)', fontFamily: '"Playfair Display", serif' }}>
              Recent Live Orders
            </h3>
            <Link href="/admin/orders" style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--deep-green)', textDecoration: 'none' }}>
              View All Orders →
            </Link>
          </div>

          {orders.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontWeight: 700, textAlign: 'center', padding: '40px 0' }}>No orders placed yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {orders.slice(0, 6).map((ord) => {
                const isDelivered = ord.orderStatus === 'Delivered' || ord.orderStatus === 'delivered'
                const isCancelled = ord.orderStatus === 'Cancelled' || ord.orderStatus === 'cancelled' || ord.orderStatus === 'rejected'

                return (
                  <div
                    key={ord.id}
                    style={{
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '14px',
                      padding: '16px',
                      background: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      justify: 'space-between',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.95rem',
                        fontWeight: 900,
                        color: 'var(--deep-green)',
                        background: 'rgba(203, 32, 45,0.08)',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}>
                        #{ord.orderId || ord.id?.slice(0, 6) || 'UNKNOWN'}
                      </span>

                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 900,
                        padding: '3px 10px',
                        borderRadius: '999px',
                        background: isDelivered ? '#EFF3E6' : isCancelled ? '#fce8e6' : '#fef3c7',
                        color: isDelivered ? '#CB202D' : isCancelled ? '#dc2626' : '#b45309'
                      }}>
                        {isDelivered ? '🟢 DELIVERED' : isCancelled ? '🔴 CANCELLED' : (ord.orderStatus || 'CONFIRMED').toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>
                        {ord.customerName || ord.userName || 'Foodie Customer'}
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>
                        {ord.items?.length || 1} items
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                        {ord.paymentMethod === 'RAZORPAY' || ord.isRazorpay || ord.razorpayPaymentId ? '💳 Razorpay Online' : (ord.isUpi || ord.paymentMethod === 'UPI' ? '💳 UPI Online' : '💵 Cash on Delivery')}
                      </span>
                      <strong style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--deep-green)' }}>
                        ₹{(ord.grandTotal || 0).toFixed(0)}
                      </strong>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
