import { useState, useEffect } from 'react'
import UpiPaymentBox from './UpiPaymentBox'
import { getDocs, query, collection, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useSettings } from '../context/SettingsContext'
import AnnouncementBanner from './AnnouncementBanner'

export default function CheckoutModal({
  isOpen,
  onClose,
  cartItems = [],
  cartTotal = 0,
  deliveryFee = 0,
  grandTotal = 0,
  user = null,
  userProfile = null,
  openAuthModal,
  onPlaceOrder,
  coLoading = false
}) {
  const { settings } = useSettings()
  const [step, setStep] = useState(1) // 1: Delivery Details, 2: Payment & Review
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('UPI') // All payments via UPI QR code
  const [showItemSummary, setShowItemSummary] = useState(false)

  // Coupon State
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponError('')
    setCouponLoading(true)

    const cleanCode = couponInput.toUpperCase().trim()

    // Secret Promo Code Integration
    if (cleanCode === 'CODERSAPIEN50') {
      const calculatedDiscount = Math.round((cartTotal * 50) / 100)
      setAppliedCoupon({
        couponCode: 'CODERSAPIEN50',
        discountType: 'percent',
        discountValue: 50,
        discount: calculatedDiscount
      })
      setCouponInput('')
      setCouponLoading(false)
      return
    }

    try {
      const q = query(collection(db, 'coupons'), where('couponCode', '==', cleanCode))
      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        setCouponError('Invalid coupon code. Please check for typos.')
        setAppliedCoupon(null)
      } else {
        const coupon = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() }

        // Rule 1: Active Status
        if (!coupon.active) {
          setCouponError('This promo coupon is currently inactive.')
          setAppliedCoupon(null)
          return
        }

        // Rule 2: Expiry Date Validation
        if (coupon.expiryDate) {
          const today = new Date().toISOString().split('T')[0]
          if (today > coupon.expiryDate) {
            setCouponError(`This coupon expired on ${coupon.expiryDate}.`)
            setAppliedCoupon(null)
            return
          }
        }

        // Rule 3: Global Usage Limit
        if (coupon.usageLimit > 0 && (coupon.usedCount || 0) >= coupon.usageLimit) {
          setCouponError('This coupon has reached its maximum total redemption limit.')
          setAppliedCoupon(null)
          return
        }

        // Rule 3.5: Per-User Usage Limit Validation
        const perUserLimit = Number(coupon.perUserLimit) || 1
        let userUsageCount = 0

        if (user?.uid) {
          if (coupon.usedByUsers && typeof coupon.usedByUsers === 'object') {
            userUsageCount = Number(coupon.usedByUsers[user.uid]) || 0
          }

          try {
            const activeUserOrdersQ = query(
              collection(db, 'orders'),
              where('userId', '==', user.uid),
              where('appliedCoupon', '==', cleanCode)
            )
            const archiveUserOrdersQ = query(
              collection(db, 'orders_archive'),
              where('userId', '==', user.uid),
              where('appliedCoupon', '==', cleanCode)
            )
            const [activeSnap, archiveSnap] = await Promise.all([
              getDocs(activeUserOrdersQ).catch(() => ({ docs: [] })),
              getDocs(archiveUserOrdersQ).catch(() => ({ docs: [] }))
            ])
            const totalPreviousUses = (activeSnap.docs?.length || 0) + (archiveSnap.docs?.length || 0)
            userUsageCount = Math.max(userUsageCount, totalPreviousUses)
          } catch (e) {}
        }

        if (userUsageCount >= perUserLimit) {
          setCouponError(`You have already reached the maximum usage limit (${perUserLimit} time(s)) for this promo coupon.`)
          setAppliedCoupon(null)
          return
        }

        // Rule 4: Minimum Order Threshold
        if (cartTotal < coupon.minimumOrder) {
          setCouponError(`Minimum order requirement for this coupon is ₹${coupon.minimumOrder}.`)
          setAppliedCoupon(null)
          return
        }

        // Rule 5: Applicable Category Check
        if (coupon.applicableCategory && coupon.applicableCategory !== 'all') {
          const hasCategoryItem = cartItems.some(item => 
            (item.category || '').toLowerCase() === coupon.applicableCategory.toLowerCase()
          )
          if (!hasCategoryItem) {
            setCouponError(`This coupon is only valid for items in the '${coupon.applicableCategory}' category.`)
            setAppliedCoupon(null)
            return
          }
        }

        // Compute Discount Amount (Percentage vs Fixed Amount)
        let calculatedDiscount = 0
        if (coupon.discountType === 'percent') {
          calculatedDiscount = Math.round((cartTotal * coupon.discountValue) / 100)
        } else {
          calculatedDiscount = Number(coupon.discountValue) || 0
        }

        setAppliedCoupon({
          ...coupon,
          discount: calculatedDiscount
        })
        setCouponInput('')
      }
    } catch (err) {
      setCouponError('Failed to validate coupon. Please try again.')
      setAppliedCoupon(null)
    } finally {
      setCouponLoading(false)
    }
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponError('')
  }

  // Pre-fill user details from Auth Profile
  useEffect(() => {
    if (userProfile || user) {
      if (!name) setName(userProfile?.name || user?.displayName || '')
      if (!phone) setPhone((userProfile?.phone || '').replace(/[^0-9]/g, '').replace(/^91/, '').slice(0, 10))
      if (!address) setAddress(userProfile?.defaultAddress || '')
    }
  }, [userProfile, user])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setShowItemSummary(false)
    }
  }, [isOpen])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const handleStep1Submit = (e) => {
    if (e) e.preventDefault()
    if (settings?.isStoreOpen === false) {
      alert('🔴 Restaurant is currently closed. We are not accepting online orders right now.')
      return
    }
    if (!name || !name.trim()) {
      alert('⚠️ Name is mandatory! Please enter your full name to proceed.')
      return
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '').replace(/^91/, '').slice(0, 10)
    if (!cleanPhone || cleanPhone.length < 10) {
      alert('⚠️ Please enter a valid 10-digit mobile number (e.g. 9693999890). Do not include +91.')
      return
    }
    if (!address || !address.trim()) {
      alert('⚠️ Delivery Address is mandatory!')
      return
    }
    setPhone(cleanPhone)

    if (!user) {
      openAuthModal()
      return
    }    setStep(2)
  }

  const discountAmount = appliedCoupon ? (
    appliedCoupon.discountType === 'percent'
      ? Math.round((cartTotal * (Number(appliedCoupon.discountValue) || 0)) / 100)
      : Math.min(cartTotal, Number(appliedCoupon.discountValue) || 0)
  ) : 0

  const finalTotal = Math.max(0, grandTotal - discountAmount)

  const handleFinalOrderSubmit = (e, utr = null) => {
    if (e) e.preventDefault()
    if (settings?.isStoreOpen === false) {
      alert('🔴 Restaurant is currently closed. We are not accepting online orders right now.')
      return
    }
    if (!name || !name.trim()) {
      alert('⚠️ Name is mandatory! Please enter your full name before placing order.')
      return
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '').replace(/^91/, '').slice(0, 10)
    if (!cleanPhone || cleanPhone.length < 10) {
      alert('⚠️ Please enter a valid 10-digit mobile number (e.g. 9693999890). Do not include +91.')
      return
    }
    if (!address || !address.trim()) {
      alert('⚠️ Delivery Address is mandatory!')
      return
    }

    onPlaceOrder({
      name: name.trim(),
      phone: cleanPhone,
      address: address.trim(),
      paymentMethod,
      isUpi: paymentMethod === 'UPI',
      coupon: appliedCoupon ? { code: appliedCoupon.couponCode, discount: discountAmount } : null
    }, utr)
  }

  const handleQuickAddress = (landmark) => {
    if (!address.includes(landmark)) {
      setAddress((prev) => (prev ? `${prev}, ${landmark}` : landmark))
    }
  }

  return (
    <div className="chk-overlay" aria-hidden={isOpen ? 'false' : 'true'}>
      <button type="button" className="chk-backdrop" aria-label="Close checkout" onClick={onClose} />

      <div className="chk-panel" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle">
        {/* Mobile top handle bar */}
        <div className="chk-drag-handle" />

        {/* Top Header Bar */}
        <div className="chk-header">
          <div className="chk-header-left">
            <span className="chk-brand-tag">BIRYANI BADSHAH · PATNA</span>
            <h2 id="checkoutTitle" className="chk-title">Checkout</h2>
          </div>

          <button type="button" className="chk-close-btn" aria-label="Close checkout" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="chk-stepper-bar">
          <button
            type="button"
            className={`chk-step-tab ${step === 1 ? 'active' : 'completed'}`}
            onClick={() => setStep(1)}
          >
            <span className="step-number">{step > 1 ? '✓' : '1'}</span>
            <span className="step-name">Delivery Address</span>
          </button>

          <div className="step-line-divider" />

          <button
            type="button"
            className={`chk-step-tab ${step === 2 ? 'active' : ''}`}
            onClick={() => {
              if (name && phone && address) setStep(2)
            }}
          >
            <span className="step-number">2</span>
            <span className="step-name">Payment & Confirm</span>
          </button>
        </div>

        {/* Main Body Grid Layout */}
        <div className="chk-body-grid">
          {/* Left Column: Order Summary & Coupon */}
          <div className="chk-summary-col">
            <AnnouncementBanner placement="cart" />
            {/* Collapsible Order Accordion on Mobile */}
            <div className="chk-summary-card">
              <button
                type="button"
                className="chk-summary-toggle"
                onClick={() => setShowItemSummary(!showItemSummary)}
              >
                <div className="toggle-left">
                  <span className="cart-icon-badge">🛒</span>
                  <div>
                    <strong>Order Summary ({cartItems.reduce((s, i) => s + i.qty, 0)} items)</strong>
                    <span className="toggle-price">₹{finalTotal.toFixed(0)}</span>
                  </div>
                </div>
                <span className="toggle-arrow">{showItemSummary ? '▲' : '▼'}</span>
              </button>

              <div className={`chk-summary-expand ${showItemSummary ? 'open' : ''}`}>
                <div className="chk-item-list">
                  {cartItems.map((item) => (
                    <div className="chk-item-row" key={item.title}>
                      <img loading="lazy" decoding="async"  src={item.image} alt={item.title} className="chk-item-thumb" />
                      <div className="chk-item-meta">
                        <span className="chk-item-title">{item.title}</span>
                        <span className="chk-item-qty">x{item.qty} · ₹{item.price.toFixed(0)}</span>
                      </div>
                      <span className="chk-item-subtotal">₹{(item.price * item.qty).toFixed(0)}</span>
                    </div>
                  ))}
                </div>

                {/* Coupon Code Entry */}
                <div className="chk-coupon-box">
                  {!appliedCoupon ? (
                    <div className="coupon-input-row">
                      <input
                        type="text"
                        placeholder="Coupon code (e.g. PATNA10)"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        className="coupon-input"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponInput.trim()}
                        className="coupon-apply-btn"
                      >
                        {couponLoading ? '...' : 'APPLY'}
                      </button>
                    </div>
                  ) : (
                    <div className="applied-coupon-pill">
                      <div>
                        <span className="applied-code">✓ {appliedCoupon.couponCode} APPLIED</span>
                        <p className="applied-savings">Saved ₹{discountAmount} on this order!</p>
                      </div>
                      <button type="button" onClick={handleRemoveCoupon} className="coupon-remove-btn">REMOVE</button>
                    </div>
                  )}
                  {couponError && <p className="coupon-err-msg">⚠️ {couponError}</p>}
                </div>

                {/* Bill Details Breakdown */}
                <div className="chk-bill-details">
                  <div className="bill-row">
                    <span>Items Subtotal</span>
                    <span>₹{cartTotal.toFixed(0)}</span>
                  </div>

                  {appliedCoupon && (
                    <div className="bill-row discount">
                      <span>Coupon Discount</span>
                      <span>-₹{discountAmount}</span>
                    </div>
                  )}

                  <div className="bill-row">
                    <span>Delivery Charge</span>
                    <span>{deliveryFee > 0 ? `₹${deliveryFee}` : <strong className="free-badge">FREE 🎉</strong>}</span>
                  </div>

                  <div className="bill-row tax">
                    <span>Taxes (GST {settings?.gstPercentage || 18}%)</span>
                    <span>Included</span>
                  </div>

                  <div className="bill-row total">
                    <span>Total Payable</span>
                    <strong>₹{finalTotal.toFixed(0)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Step Forms */}
          <div className="chk-form-col">
            {settings?.isStoreOpen === false ? (
              <div className="store-closed-card">
                <div className="closed-icon">🔴</div>
                <h3>RESTAURANT CURRENTLY CLOSED</h3>
                <p>We are not taking online orders right now. Please check back during operating hours.</p>

                <div className="store-hours-info">
                  <p>🕒 Hours: <strong>{settings?.openingTime || '11:00 AM'} – {settings?.closingTime || '11:30 PM'}</strong></p>
                  <p>📞 Support: <strong>{settings?.supportPhone || '+91 96939 99890'}</strong></p>
                </div>

                <button type="button" onClick={onClose} className="btn closed-close-btn">
                  CLOSE CHECKOUT ✕
                </button>
              </div>
            ) : step === 1 ? (
              /* STEP 1: DELIVERY ADDRESS & CONTACT */
              <form onSubmit={handleStep1Submit} className="chk-form-step">
                <div className="step-intro">
                  <span className="step-badge">STEP 1 OF 2</span>
                  <h3>Where should we deliver?</h3>
                  <p>Enter your details so our agent can deliver your hot dum biryani.</p>
                </div>

                {!user && (
                  <div className="auth-prompt-banner">
                    <span>Have an account?</span>
                    <button type="button" onClick={openAuthModal} className="auth-btn-link">
                      Sign In for Fast Auto-fill
                    </button>
                  </div>
                )}

                <div className="chk-field-group">
                  <label htmlFor="chk-name">Full Name *</label>
                  <div className="input-wrap">
                    <span className="input-icon">👤</span>
                    <input
                      id="chk-name"
                      type="text"
                      placeholder="e.g. Amanullah Khan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="chk-field-group">
                  <label htmlFor="chk-phone">Phone Number *</label>
                  <div className="input-wrap">
                    <span className="input-icon">📞</span>
                    <input
                      id="chk-phone"
                      type="tel"
                      placeholder="e.g. 9693999890"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').replace(/^91/, '').slice(0, 10))}
                      maxLength={10}
                      required
                    />
                  </div>
                </div>

                <div className="chk-field-group">
                  <label htmlFor="chk-address">Delivery Address in Patna *</label>
                  <div className="input-wrap textarea-wrap">
                    <span className="input-icon">📍</span>
                    <textarea
                      id="chk-address"
                      rows={3}
                      placeholder="House No., Street, Landmark, Area, Patna..."
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Patna Quick Area Chips */}
                <div className="patna-chips-section">
                  <span className="chips-label">QUICK DELIVERY AREAS:</span>
                  <div className="chips-row">
                    {['Phulwari Sharif', 'Birla Colony', 'Bhagat Singh Chowk', 'Danapur', 'Khagaul'].map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => handleQuickAddress(chip)}
                        className="patna-chip"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="chk-action-btn primary">
                  CONTINUE TO PAYMENT →
                </button>
              </form>
            ) : (
              /* STEP 2: PAYMENT METHOD & CONFIRMATION */
              <div className="chk-form-step">
                <div className="step-intro">
                  <div className="step-top-row">
                    <span className="step-badge">STEP 2 OF 2</span>
                    <button type="button" onClick={() => setStep(1)} className="edit-addr-link">
                      ← Edit Address
                    </button>
                  </div>
                  <h3>Payment Method</h3>
                  <p className="delivering-to-text">Delivering to: <strong>{address}</strong></p>
                </div>

                {!user && (
                  <div className="auth-prompt-banner" style={{ marginBottom: '16px', background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>Please sign in so your order links to your account:</span>
                    <button type="button" onClick={openAuthModal} className="auth-btn-link" style={{ marginTop: '4px', fontWeight: 700 }}>
                      Sign In Now →
                    </button>
                  </div>
                )}

                <UpiPaymentBox
                  grandTotal={finalTotal}
                  upiId={settings?.storeUpiId || 'electrohousejsr@okicici'}
                  restaurantName="Biryani Badshah"
                  loading={coLoading}
                  onConfirmPayment={handleFinalOrderSubmit}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
