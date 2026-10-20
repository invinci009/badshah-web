import { useEffect, useState, useMemo, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ALL_MENU_ITEMS } from '../data/menuData'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

import SiteNav from '../components/SiteNav'
import CartDrawer from '../components/CartDrawer'
import MobileBottomBar from '../components/MobileBottomBar'
import ToastNotification from '../components/ToastNotification'

const CheckoutModal = dynamic(() => import('../components/CheckoutModal'), { ssr: false })
const AnnouncementBanner = dynamic(() => import('../components/AnnouncementBanner'), { ssr: false })

export default function MenuPage() {
  const router = useRouter()
  const { user, userProfile, isAdmin, openAuthModal, logout, accessToken } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [cartItems, setCartItems] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Order checkout form state
  const [coName, setCoName] = useState('')
  const [coPhone, setCoPhone] = useState('')
  const [coAddress, setCoAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('UPI')
  const [coLoading, setCoLoading] = useState(false)

  // Persist cart to localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('biryani_cart_v1')
      if (raw) setCartItems(JSON.parse(raw))
    } catch (e) { }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('biryani_cart_v1', JSON.stringify(cartItems))
    } catch (e) { }
  }, [cartItems])

  const addToCart = (item) => {
    setCartItems((currentItems) => {
      const existingItem = currentItems.find((entry) => entry.title === item.title)
      if (existingItem) {
        return currentItems.map((entry) => (
          entry.title === item.title ? { ...entry, qty: entry.qty + 1 } : entry
        ))
      }
      return [...currentItems, { ...item, qty: 1 }]
    })

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({
      title: item.title,
      image: item.image,
      id: Date.now()
    })

    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3000)
  }

  const updateCartQty = (title, delta) => {
    setCartItems((currentItems) =>
      currentItems
        .map((entry) => (
          entry.title === title ? { ...entry, qty: Math.max(0, entry.qty + delta) } : entry
        ))
        .filter((entry) => entry.qty > 0)
    )
  }

  const removeFromCart = (title) => {
    setCartItems((currentItems) => currentItems.filter((entry) => entry.title !== title))
  }

  const { settings } = useSettings()
  const cartCount = cartItems.reduce((sum, entry) => sum + entry.qty, 0)
  const cartTotal = cartItems.reduce((sum, entry) => sum + (entry.price * entry.qty), 0)
  const deliveryFee = cartTotal > 0 ? (settings?.deliveryCharge ?? 40) : 0
  const grandTotal = cartTotal + deliveryFee

  const handleProceedToCheckout = () => {
    if (settings?.isStoreOpen === false) {
      alert('🔴 Restaurant is currently closed. We are not accepting online orders right now.')
      return
    }
    if (!user) {
      openAuthModal()
      setToast({
        type: 'warning',
        message: 'Please sign in or create an account to proceed to checkout.',
        id: Date.now()
      })
      setTimeout(() => setToast(null), 3500)
      return
    }
    setCoName(user.displayName || '')
    setCartOpen(false)
    setCheckoutOpen(true)
  }

  const handlePlaceOrder = async (orderData = {}, utrString = null) => {
    if (settings?.isStoreOpen === false) {
      alert('🔴 Restaurant is currently closed. We are not accepting online orders right now.')
      return
    }

    const finalName = orderData.name || coName || user?.displayName || user?.email?.split('@')[0]
    const finalPhone = orderData.phone || coPhone
    const finalAddress = orderData.address || coAddress
    const isUpi = orderData.isUpi !== undefined ? orderData.isUpi : paymentMethod === 'UPI'

    // All online payments are pre-paid UPI (QR code). Sign-in is required below.

    if (!finalPhone || !finalAddress) {
      alert('Please enter your phone number and delivery address.')
      return
    }

    try {
      setCoLoading(true)

      // --- STANDARD FLOW (UPI): create order from scratch ---
      if (!user) {
        openAuthModal()
        setCoLoading(false)
        return
      }

      const ts = Date.now().toString(36).toUpperCase()
      const rnd = Math.floor(1000 + Math.random() * 9000).toString()
      const orderId = `BB-PATNA-${ts}-${rnd}`

      const discountValue = orderData.coupon ? orderData.coupon.discount : 0
      const finalGrandTotal = Math.max(0, grandTotal - discountValue)

      const payload = {
        orderId,
        userId: user.uid,
        userEmail: user.email,
        customerName: finalName,
        customerEmail: user.email,
        customerPhone: finalPhone,
        deliveryAddress: finalAddress,
        items: cartItems.map(i => ({ title: i.title, qty: i.qty, price: i.price, image: i.image })),
        subtotal: cartTotal,
        deliveryCharge: deliveryFee,
        tax: 0,
        discount: discountValue,
        appliedCoupon: orderData.coupon ? orderData.coupon.code : null,
        grandTotal: finalGrandTotal,
        paymentMethod: isUpi ? 'UPI' : 'COD',
        paymentStatus: isUpi ? 'verification_pending' : 'pending',
        orderStatus: isUpi ? 'payment_verification_pending' : 'pending',
        customerMarkedPaid: isUpi ? true : false,
        transactionReference: utrString || null,
        paymentVerifiedBy: null,
        paymentVerifiedAt: null,
        rejectionReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      // Non-blocking submit: race the Firestore write with a 4s cap so checkout
// never hangs; the write keeps retrying in background via Firestore
// offline persistence, and the server-verified merge corrects totals.
const writeOrder = setDoc(doc(db, 'orders', orderId), payload)
const race = await Promise.race([
  writeOrder.catch(e => { console.warn('Order write notice:', e.message); return 'error' }),
  new Promise(r => setTimeout(() => r('timeout'), 4000))
])
if (race === 'timeout') console.warn('Order write still in flight — finishing checkout optimistically')

      const syncOrderWithServer = async (attempts = 3) => {
        for (let i = 0; i < attempts; i++) {
          try {
            const res = await fetch('/api/orders/create', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify(payload)
            })
            if (res.ok) return
          } catch (e) {
            if (i === attempts - 1) console.warn('Server order verification notice:', e)
            await new Promise(r => setTimeout(r, 1000 * (i + 1)))
          }
        }
      }
      syncOrderWithServer()

      setCartItems([])
      setCheckoutOpen(false)
      setCoPhone('')
      setCoAddress('')
      router.push(`/my-orders?orderId=${orderId}&success=1`)
    } catch (err) {
      console.error('Order Error:', err)
      alert('Order placed! Redirecting to tracking...')
      router.push('/my-orders')
    } finally {
      setCoLoading(false)
    }
  }

  // Lock body scroll when drawer/modals open
  useEffect(() => {
    const locked = cartOpen || checkoutOpen || Boolean(selectedProduct)
    document.body.style.overflow = locked ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [cartOpen, checkoutOpen, selectedProduct])

  const [liveMenu, setLiveMenu] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(true)

  // Real-time Firestore sync for Menu
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'menu'), (snapshot) => {
      const docs = snapshot.docs.map(docSnap => {
        const data = docSnap.data()
        const codeItem = ALL_MENU_ITEMS.find(i => i.id === docSnap.id || i.title === (data.name || data.title))

        // Background update Firestore if image in DB is stale/old
        if (codeItem && codeItem.image && data.image !== codeItem.image) {
          try {
            setDoc(doc(db, 'menu', docSnap.id), {
              image: codeItem.image,
              category: codeItem.category,
              categoryName: codeItem.categoryName,
              vegNonVeg: codeItem.vegNonVeg || 'veg',
              updatedAt: serverTimestamp()
            }, { merge: true })
          } catch (e) {}
        }

        return {
          id: docSnap.id,
          ...data,
          title: data.name || data.title || codeItem?.title || 'Unknown Item',
          priceLabel: `₹${data.price || codeItem?.price || 0}`,
          price: data.price || codeItem?.price || 0,
          category: codeItem?.category || data.category || 'biryani',
          categoryName: codeItem?.categoryName || data.categoryName || 'Dishes',
          tags: codeItem?.tags || data.tags || (data.popular ? ['Bestseller'] : []),
          spice: codeItem?.spice || data.spice || 'Medium',
          time: codeItem?.time || data.preparationTime || '20-25 min',
          portion: codeItem?.portion || data.portion || 'Serves 1-2',
          description: codeItem?.description || data.description || '',
          image: codeItem?.image || data.image || '/generated_menu/baby_corn_chilli.png'
        }
      })

      const existingTitles = new Set(docs.map(d => (d.title || '').trim().toLowerCase()))
      const missingFromCode = ALL_MENU_ITEMS.filter(item => 
        !existingTitles.has((item.title || '').trim().toLowerCase())
      )

      // Auto-sync missing items into Firestore in background
      if (missingFromCode.length > 0) {
        missingFromCode.forEach(async (item) => {
          try {
            await setDoc(doc(db, 'menu', item.id), {
              name: item.title,
              title: item.title,
              description: item.description,
              price: item.price,
              category: item.category,
              categoryName: item.categoryName,
              image: item.image,
              available: true,
              rating: item.rating || 4.8,
              preparationTime: item.time || '20-25 min',
              popular: (item.category || '').includes('bestseller'),
              vegNonVeg: item.vegNonVeg || 'non-veg',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true })
          } catch (e) {
            console.warn('Auto-sync item notice:', e)
          }
        })
      }

      // Keep items from current menu definition or valid Firestore entries
      const codeItemTitles = new Set(ALL_MENU_ITEMS.map(i => i.title))
      const codeItemIds = new Set(ALL_MENU_ITEMS.map(i => i.id))
      const validDocs = docs.filter(d => codeItemIds.has(d.id) || codeItemTitles.has(d.title) || codeItemTitles.has(d.name))

      const fullList = [...validDocs, ...missingFromCode].filter(item => item.available !== false)
      setLiveMenu(fullList.length > 0 ? fullList : ALL_MENU_ITEMS)
      setLoadingMenu(false)
    }, (err) => {
      console.warn('Menu live sync notice:', err.message)
      setLiveMenu(ALL_MENU_ITEMS)
      setLoadingMenu(false)
    })

    return () => unsub()
  }, [])

  // Category counts calculation for restructured 7 categories
  const categoryCounts = useMemo(() => {
    const source = liveMenu.length > 0 ? liveMenu : ALL_MENU_ITEMS
    return {
      all: source.length,
      biryani: source.filter(d => (d.category || '').includes('biryani')).length,
      starters: source.filter(d => (d.category || '').includes('starters') || (d.category || '').includes('kawab')).length,
      main_course: source.filter(d => (d.category || '').includes('main_course') || (d.category || '').includes('gravy')).length,
      breads: source.filter(d => (d.category || '').includes('breads') || (d.category || '').includes('bread')).length,
      rolls: source.filter(d => (d.category || '').includes('rolls') || (d.category || '').includes('roll')).length,
      beverages: source.filter(d => (d.category || '').includes('beverages') || (d.category || '').includes('bev')).length,
      combos: source.filter(d => (d.category || '').includes('combos') || (d.category || '').includes('combo')).length,
      extras: source.filter(d => (d.category || '').includes('extras')).length,
      bestseller: source.filter(d => (d.category || '').includes('bestseller') || d.popular).length
    }
  }, [liveMenu])

  // Filtered menu items calculation
  const filteredDishes = useMemo(() => {
    const source = liveMenu.length > 0 ? liveMenu : ALL_MENU_ITEMS
    return source.filter((dish) => {
      const q = searchQuery.trim().toLowerCase()
      const title = (dish.name || dish.title || '').toLowerCase()
      const desc = (dish.description || '').toLowerCase()
      const catName = (dish.categoryName || '').toLowerCase()
      
      const matchesSearch = !q || title.includes(q) || desc.includes(q) || catName.includes(q)

      if (!matchesSearch) return false

      if (activeFilter === 'all') return true
      if (activeFilter === 'biryani') return (dish.category || '').includes('biryani')
      if (activeFilter === 'starters') return (dish.category || '').includes('starters') || (dish.category || '').includes('kawab')
      if (activeFilter === 'main_course') return (dish.category || '').includes('main_course') || (dish.category || '').includes('gravy')
      if (activeFilter === 'breads') return (dish.category || '').includes('breads') || (dish.category || '').includes('bread')
      if (activeFilter === 'rolls') return (dish.category || '').includes('rolls') || (dish.category || '').includes('roll')
      if (activeFilter === 'beverages') return (dish.category || '').includes('beverages') || (dish.category || '').includes('bev')
      if (activeFilter === 'combos') return (dish.category || '').includes('combos') || (dish.category || '').includes('combo')
      if (activeFilter === 'extras') return (dish.category || '').includes('extras')
      if (activeFilter === 'bestseller') return (dish.category || '').includes('bestseller') || dish.popular
      return true
    })
  }, [activeFilter, searchQuery, liveMenu])

  return (
    <>
      <Head>
        <title>Menu & Online Ordering | Biryani Badshah</title>
        <meta name="description" content={`Explore our complete menu of Biryani, Starters, Main Course, Indian Breads, Rolls, Beverages, and Super Saver Combos at Biryani Badshah.`} />
        <meta name="keywords" content="Biryani Menu, Starters, Main Course, Indian Breads, Rolls, Beverages, Super Saver Combos, Order Online Patna" />
        <link rel="canonical" href="https://www.biryanibadshah.in/menu" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.biryanibadshah.in/menu" />
        <meta property="og:title" content="Menu & Online Ordering | Biryani Badshah" />
        <meta property="og:description" content="Explore our complete menu of Biryani, Starters, Main Course, Indian Breads, Rolls, Beverages, and Super Saver Combos at Biryani Badshah." />
        <meta property="og:image" content="https://www.biryanibadshah.in/images/og-image.jpg" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://www.biryanibadshah.in/menu" />
        <meta property="twitter:title" content="Menu & Online Ordering | Biryani Badshah" />
        <meta property="twitter:description" content="Explore our complete menu of Biryani, Starters, Main Course, Indian Breads, Rolls, Beverages, and Super Saver Combos at Biryani Badshah." />
        <meta property="twitter:image" content="https://www.biryanibadshah.in/images/og-image.jpg" />
      </Head>

      <SiteNav activePage="menu" />

      {/* Store Closed Banner */}
      {settings?.isStoreOpen === false && (
        <div style={{ background: '#dc2626', color: '#ffffff', textAlign: 'center', padding: '10px 20px', fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span>🔴</span>
          <span>STORE CLOSED: Online ordering is currently suspended. Hours: {settings?.openingTime || '11:00 AM'} – {settings?.closingTime || '11:30 PM'}. Support: {settings?.supportPhone || '+91 96939 99890'}</span>
        </div>
      )}

      <main>
        {/* Luxury Hero Header Section */}
        <section className="menu-hero-seamless" style={{
          paddingTop: '40px',
          paddingBottom: '30px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div className="container">
            {/* Header badges and breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '999px', background: 'rgba(203, 32, 45,0.08)', border: '1px solid rgba(203, 32, 45,0.15)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--deep-green)' }}></span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.18em', color: 'var(--deep-green)', textTransform: 'uppercase' }}>
                  EST. 2026 · PHULWARI SHARIF SPECIALITY
                </span>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
                <Link href="/" style={{ color: 'var(--deep-green)', textDecoration: 'none' }}>Home</Link> / <span style={{ color: 'var(--ink)' }}>Menu</span>
              </div>
            </div>

            {/* Main Headline */}
            <div style={{ textAlign: 'center', maxWidth: '840px', margin: '0 auto' }}>
              <p className="section-label" style={{ marginBottom: '12px', letterSpacing: '0.3em', color: 'var(--deep-green)' }}>
                HANDCRAFTED DUM & SPECIALITIES
              </p>

              <h1 className="display" style={{
                fontSize: 'clamp(2.4rem, 5vw, 4.2rem)',
                lineHeight: '1.05',
                margin: '0 0 20px 0',
                color: 'var(--ink)',
                textTransform: 'uppercase',
                fontWeight: 900
              }}>
                THE COMPLETE <br />
                <span className="highlight-italic" style={{ color: 'var(--deep-green)' }}>AUTHENTIC PATNA</span> MENU.
              </h1>

              <p style={{
                fontSize: 'clamp(1rem, 1.8vw, 1.18rem)',
                color: 'var(--text-muted)',
                lineHeight: '1.65',
                maxWidth: '680px',
                margin: '0 auto 32px auto'
              }}>
                Authentic Dum Biryanis, Sizzling Starters, Rich Main Courses, Fresh Indian Breads, Flavorful Rolls, Refreshing Beverages, and Super Saver Combos.
              </p>

              {/* Quick stats pills */}
              <div style={{
                display: 'inline-flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px 24px',
                background: 'rgba(255, 255, 255, 0.75)',
                backdropFilter: 'blur(8px)',
                borderRadius: '20px',
                border: '1px solid rgba(203, 32, 45,0.12)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.04)'
              }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--deep-green)' }}>🍛 {categoryCounts.biryani} Biryanis</span>
                <span style={{ color: 'rgba(0,0,0,0.2)' }}>•</span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--deep-green)' }}>🍗 {categoryCounts.starters} Starters</span>
                <span style={{ color: 'rgba(0,0,0,0.2)' }}>•</span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--deep-green)' }}>🍲 {categoryCounts.main_course} Main Course</span>
                <span style={{ color: 'rgba(0,0,0,0.2)' }}>•</span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--deep-green)' }}>🫓 {categoryCounts.breads} Breads</span>
                <span style={{ color: 'rgba(0,0,0,0.2)' }}>•</span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--deep-green)' }}>🌯 {categoryCounts.rolls} Rolls</span>
                <span style={{ color: 'rgba(0,0,0,0.2)' }}>•</span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--deep-green)' }}>🥤 {categoryCounts.beverages} Drinks</span>
                <span style={{ color: 'rgba(0,0,0,0.2)' }}>•</span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--deep-green)' }}>🥗 {categoryCounts.extras} Extras</span>
              </div>
            </div>
          </div>
        </section>

        {/* Ticker marquee strip */}
        <section className="marquee marquee-one" aria-label="Menu ticker" style={{ marginBlock: '20px' }}>
          <div className="marquee-track reverse">
            <span>CHICKEN BIRYANI · CHILLI PANEER · CHICKEN BUTTER MASALA · LACCHA PARATHA · EGG ROLLS · SUPER SAVER COMBOS ·</span>
            <span>CHICKEN BIRYANI · CHILLI PANEER · CHICKEN BUTTER MASALA · LACCHA PARATHA · EGG ROLLS · SUPER SAVER COMBOS ·</span>
          </div>
        </section>

        {/* Main Controls & Menu Grid */}
        <section className="menu section-pad" id="menu" style={{ paddingTop: '20px' }}>
          <div className="container">
            <AnnouncementBanner placement="menu" />

            {/* Search and Category Filter Bar */}
            <div className="menu-controls-wrapper" style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              marginBottom: '40px',
              alignItems: 'center'
            }}>

              {/* Glassmorphic Search Bar */}
              <div className="search-bar-container" style={{ width: '100%', maxWidth: '580px', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search biryani, starters, chicken curry, naan, rolls, combos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '16px 24px 16px 54px',
                    borderRadius: '999px',
                    border: '2px solid rgba(203, 32, 45,0.18)',
                    background: '#ffffff',
                    fontSize: '1.02rem',
                    color: 'var(--ink)',
                    outline: 'none',
                    boxShadow: '0 10px 30px rgba(203, 32, 45,0.06)',
                    transition: 'all 0.25s ease',
                    fontWeight: '500'
                  }}
                />
                <span style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: '1.2rem' }}>🔍</span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '18px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(0,0,0,0.06)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      color: 'var(--ink)'
                    }}
                  >✕</button>
                )}
              </div>

              {/* Category Filter Chips */}
              <div className="menu-chips mobile-scroll-chips" role="tablist" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '10px' }}>
                {[
                  { id: 'all', label: `All (${categoryCounts.all})` },
                  { id: 'biryani', label: `Biryani (${categoryCounts.biryani})` },
                  { id: 'starters', label: `Starters (${categoryCounts.starters})` },
                  { id: 'main_course', label: `Main Course (${categoryCounts.main_course})` },
                  { id: 'breads', label: `Indian Breads (${categoryCounts.breads})` },
                  { id: 'rolls', label: `Rolls (${categoryCounts.rolls})` },
                  { id: 'beverages', label: `Beverages (${categoryCounts.beverages})` },
                  { id: 'extras', label: `Extras & Sides (${categoryCounts.extras})` },
                  { id: 'bestseller', label: `⭐ Bestsellers (${categoryCounts.bestseller})` }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`chip ${activeFilter === tab.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    style={{ transition: 'all 0.2s ease' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Counter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', borderBottom: '1px solid rgba(203, 32, 45,0.1)', paddingBottom: '16px' }}>
              <span style={{ fontSize: '0.92rem', color: 'var(--deep-green)', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {activeFilter === 'all' ? 'All Dishes' : activeFilter.toUpperCase()} ({filteredDishes.length})
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
                Click any dish for ingredients & details
              </span>
            </div>

            {/* Menu Grid */}
            {filteredDishes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '70px 20px', background: '#fff', borderRadius: '28px', border: '1px dashed rgba(203, 32, 45,0.2)', boxShadow: '0 12px 36px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '14px' }}>🍲</div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)' }}>No matching dishes found</h3>
                <p style={{ color: 'var(--muted)', marginTop: '8px', maxWidth: '420px', marginInline: 'auto' }}>We couldn't find any dish matching "{searchQuery}". Try selecting another category or resetting filters.</p>
                <button className="btn" onClick={() => { setActiveFilter('all'); setSearchQuery(''); }} style={{ marginTop: '24px' }}>
                  Reset Search & Filters
                </button>
              </div>
            ) : (
              <div className="menu-grid premium-grid">
                {filteredDishes.map((dish) => (
                  <article
                    key={dish.id}
                    className="menu-card"
                    tabIndex={0}
                    role="button"
                    onClick={() => setSelectedProduct(dish)}
                  >
                    <div className="dish-media" style={{ height: '240px', overflow: 'hidden', position: 'relative' }}>
                      <img
                        src={dish.image}
                        alt={dish.title}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }}
                      />
                      <span className="dish-tag">{dish.categoryName.toUpperCase()}</span>
                      <span className="price-badge">{dish.priceLabel}</span>
                      <div className="dish-overlay"></div>
                    </div>

                    <div className="menu-body">
                      <div className="menu-head">
                        <h3 className="dish-title">{dish.title.toUpperCase()}</h3>
                        <strong className="dish-price">{dish.priceLabel}</strong>
                      </div>

                      <p className="dish-desc">{dish.description}</p>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '14px 0 18px 0' }}>
                        <span style={{ fontSize: '0.76rem', background: 'rgba(203, 32, 45,0.08)', color: 'var(--deep-green)', padding: '4px 10px', borderRadius: '8px', fontWeight: 700 }}>
                          🌶️ {dish.spice}
                        </span>
                        <span style={{ fontSize: '0.76rem', background: 'rgba(0,0,0,0.04)', color: 'var(--ink)', padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>
                          ⏱️ {dish.time}
                        </span>
                        <span style={{ fontSize: '0.76rem', background: 'rgba(203, 32, 45, 0.2)', color: '#A05A22', padding: '4px 10px', borderRadius: '8px', fontWeight: 700 }}>
                          {dish.portion}
                        </span>
                      </div>

                      <div className="menu-actions">
                        <button
                          type="button"
                          className="btn-order"
                          onClick={(event) => {
                            event.stopPropagation()
                            addToCart({ title: dish.title, price: dish.price, image: dish.image })
                          }}
                        >
                          ADD TO CART
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Floating Cart Button */}
      <button
        type="button"
        className={`cart-floater ${cartOpen ? 'is-hidden' : ''}`}
        onClick={() => setCartOpen(true)}
        aria-label={`Open cart with ${cartCount} item${cartCount === 1 ? '' : 's'}`}
      >
        <img src="/cart.webp" width="34" height="34" alt="Cart" loading="lazy" decoding="async" />
        {cartCount > 0 ? <span className="cart-floater-count">{cartCount}</span> : null}
      </button>

      {/* Cart Drawer */}
      <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`} aria-label="Shopping cart" aria-hidden={cartOpen ? 'false' : 'true'}>
        <div className="cart-hd">
          <div className="cart-hd-left">
            <span className="cart-hd-eyebrow">YOUR CART</span>
            <h2 className="cart-hd-title">Fresh from<br />the Pot 🍲</h2>
          </div>
          <button type="button" className="cart-x" aria-label="Close cart" onClick={() => setCartOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M1 1l16 16M17 1L1 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="cart-body">
          <AnnouncementBanner placement="cart" />
          {cartItems.length === 0 ? (
            <div className="cart-empty-state">
              <div className="cart-empty-icon">🫙</div>
              <p className="cart-empty-title">Nothing here yet</p>
              <p className="cart-empty-sub">Add a dish to get the feast going.</p>
            </div>
          ) : (
            cartItems.map((item) => (
              <div className="citem" key={item.title}>
                <div className="citem-img-wrap">
                  <img loading="lazy" decoding="async"  src={item.image} alt={item.title} className="citem-img" />
                </div>
                <div className="citem-info">
                  <p className="citem-name">{item.title}</p>
                  <p className="citem-unit">₹{item.price.toFixed(0)} each</p>
                  <div className="citem-stepper">
                    <button type="button" className="stepper-btn" onClick={() => updateCartQty(item.title, -1)}>
                      <svg width="10" height="2" viewBox="0 0 10 2"><rect width="10" height="2" rx="1" fill="currentColor" /></svg>
                    </button>
                    <span className="stepper-qty">{item.qty}</span>
                    <button type="button" className="stepper-btn" onClick={() => updateCartQty(item.title, 1)}>
                      <svg width="10" height="10" viewBox="0 0 10 10"><rect x="4" width="2" height="10" rx="1" fill="currentColor" /><rect y="4" width="10" height="2" rx="1" fill="currentColor" /></svg>
                    </button>
                  </div>
                </div>
                <div className="citem-right">
                  <p className="citem-subtotal">₹{(item.price * item.qty).toFixed(0)}</p>
                  <button type="button" className="citem-remove" onClick={() => removeFromCart(item.title)}>
                    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-foot">
          <div className="cart-foot-row">
            <span>Subtotal</span>
            <strong>₹{cartTotal.toFixed(0)}</strong>
          </div>
          <p className="cart-foot-note">Delivery fee calculated at checkout</p>
          <button
            type="button"
            className="cart-cta"
            onClick={handleProceedToCheckout}
            disabled={cartItems.length === 0}
          >
            <span>Proceed to Checkout</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </aside>

      {cartOpen ? <button type="button" className="cart-backdrop" aria-label="Close cart overlay" onClick={() => setCartOpen(false)} /> : null}

      {/* Detail Modal */}
      {selectedProduct ? (
        <div className="product-modal" aria-hidden="false">
          <button type="button" className="product-modal-backdrop" aria-label="Close product details" onClick={() => setSelectedProduct(null)} />
          <section className="product-modal-panel" role="dialog" aria-modal="true" aria-labelledby="productModalTitle">
            <button type="button" className="modal-close product-modal-close" aria-label="Close product details" onClick={() => setSelectedProduct(null)}>×</button>

            <div className="product-modal-visual">
              <div className="product-modal-ribbon">{selectedProduct.categoryName}</div>
              <img loading="lazy" decoding="async"  src={selectedProduct.image} alt={selectedProduct.title} className="product-modal-image" />
              <div className="product-modal-glow" aria-hidden="true" />
            </div>

            <div className="product-modal-body">
              <p className="section-label">{selectedProduct.categoryName.toUpperCase()}</p>
              <h2 id="productModalTitle">{selectedProduct.title}</h2>
              <p className="product-modal-copy">{selectedProduct.description}</p>

              <div className="product-modal-tags" aria-label="Dish tags">
                {selectedProduct.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              <div className="product-modal-facts">
                <div>
                  <span>PRICE</span>
                  <strong>{selectedProduct.priceLabel}</strong>
                </div>
                <div>
                  <span>SPICE</span>
                  <strong>{selectedProduct.spice || 'Balanced'}</strong>
                </div>
                <div>
                  <span>TIME</span>
                  <strong>{selectedProduct.time || 'Freshly packed'}</strong>
                </div>
                <div>
                  <span>PORTION</span>
                  <strong>{selectedProduct.portion || 'Generous'}</strong>
                </div>
              </div>

              <div className="product-modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    addToCart({ title: selectedProduct.title, price: selectedProduct.price, image: selectedProduct.image })
                    setSelectedProduct(null)
                  }}
                >
                  ADD TO CART
                </button>
                <button type="button" className="btn secondary" onClick={() => setSelectedProduct(null)}>CLOSE</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cartItems={cartItems}
        cartTotal={cartTotal}
        deliveryFee={deliveryFee}
        grandTotal={grandTotal}
        user={user}
        userProfile={userProfile}
        openAuthModal={openAuthModal}
        onPlaceOrder={handlePlaceOrder}
        coLoading={coLoading}
      />

      {/* Footer */}
      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        cartTotal={cartTotal}
        updateCartQty={updateCartQty}
        removeFromCart={removeFromCart}
        onProceedToCheckout={handleProceedToCheckout}
      />

      {/* Mobile Bottom Tab Bar */}
      <MobileBottomBar activeTab="menu" cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />

      <footer className="footer-brutalist" role="contentinfo">
        <div className="marquee marquee-footer" aria-label="Order ticker">
          <div className="marquee-track">
            <span>HUNGRY? ORDER NOW • HUNGRY? ORDER NOW • HUNGRY? ORDER NOW • HUNGRY? ORDER NOW • </span>
            <span>HUNGRY? ORDER NOW • HUNGRY? ORDER NOW • HUNGRY? ORDER NOW • HUNGRY? ORDER NOW • </span>
          </div>
        </div>

        <div className="footer-massive-nav container">
          <nav className="massive-links">
            <Link href="/" data-text="HOME">HOME</Link>
            <Link href="/menu" data-text="MENU">MENU</Link>
            <a href="/#about" data-text="ABOUT">ABOUT</a>
            <a href="/#order" data-text="ORDER">ORDER</a>
          </nav>
          <div className="footer-info-grid">
            <div className="info-block">
              <span>📍 LOCATION</span>
              <p>Phulwari Shareef, Patna, Bihar</p>
            </div>
            <div className="info-block">
              <span>💬 CONTACT</span>
              <p><span className="aman">
                <a href="https://igniusstudios.vercel.app" target="_blank" rel="noopener noreferrer" >   igniusstudios.com</a> </span></p>
            </div>
            <div className="info-block socials-brutalist">
              <a href="https://instagram.com/_.hussain29" target="_blank" rel="noopener noreferrer" >INSTAGRAM</a>
              <a href="https://wa.me/919693999890" target="_blank" rel="noreferrer">WHATSAPP</a>
              <a href="https://github.com/amaan-exe" target="_blank" rel="noopener noreferrer">Github</a>
            </div>
          </div>
        </div>

        <div className="footer-bleeding-edge">
          BIRYANI BADSHAH
        </div>

        <div className="footer-bottom-bar container">
          <p>© 2026 Biryani Badshah · Patna, Bihar</p>
          <div className="legal-links">
            <a href="#">COOKIES</a>
            <a href="#">PRIVACY POLICY</a>
          </div>
          <p>Made by
            <span className="aman">
              <a href="https://instagram.com/_.hussain29" target="_blank" rel="noopener noreferrer" >   Amanullah</a> </span>
            <span> with ❤️ </span></p>
        </div>
      </footer>

      {/* Toast Notification */}
      <ToastNotification toast={toast} />
    </>
  )
}
