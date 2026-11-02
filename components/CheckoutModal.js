import { useState, useEffect } from 'react'
import { getDocs, query, collection, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
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
  const { accessToken } = useAuth() || {}
  const [step, setStep] = useState(1) // 1: Delivery Details, 2: Cash On Delivery Review
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('COD') // Cash on Delivery exclusively
  const [showItemSummary, setShowItemSummary] = useState(false)

  // Coupon State
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)

  // VIP Loyalty Rewards State
  const [rewardsList, setRewardsList] = useState([])
  const [customerPoints, setCustomerPoints] = useState(0)
  const [appliedReward, setAppliedReward] = useState(null)
  const [rewardError, setRewardError] = useState('')

  // Fetch available loyalty perks for current user / phone
  useEffect(() => {
    if (!isOpen) return
    const activePhone = phone ? phone.replace(/\D/g, '').replace(/^91/, '').slice(-10) : (userProfile?.phone || '')
    const activeCid = activePhone || user?.uid || user?.email || ''
    const url = `/api/loyalty/rewards?subtotal=${cartTotal}${activePhone ? `&phone=${encodeURIComponent(activePhone)}` : ''}${activeCid ? `&customerId=${encodeURIComponent(activeCid)}` : ''}`
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

    fetch(url, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          if (Array.isArray(d.rewards)) setRewardsList(d.rewards)
          if (d.customerPoints !== undefined) setCustomerPoints(d.customerPoints)
        }
      })
      .catch(() => {})
  }, [isOpen, phone, userProfile, user, accessToken, cartTotal])

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

  const loyaltyDiscountAmount = appliedReward ? (Number(appliedReward.discount) || 0) : 0
  const finalTotal = Math.max(0, grandTotal - discountAmount - loyaltyDiscountAmount)

  const handleFinalOrderSubmit = (e) => {
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
      paymentMethod: 'COD',
      isUpi: false,
      coupon: appliedCoupon ? { code: appliedCoupon.couponCode, discount: discountAmount } : null,
      appliedReward: appliedReward ? {
        id: appliedReward.id,
        name: appliedReward.name,
        discount: loyaltyDiscountAmount,
        pointsCost: appliedReward.pointsCost,
      } : null,
    })
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
            <span className="step-name">Cash on Delivery</span>
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

                {/* 👑 VIP CLUB POINTS & TOP-UP STATION */}
                <div className="chk-loyalty-container">
                  {/* Top Status Strip */}
                  <div className="chk-loyalty-header">
                    <div className="chk-loyalty-title-wrap">
                      <span className="chk-loyalty-crown">👑</span>
                      <div>
                        <span className="chk-loyalty-heading">BADSHAH VIP CLUB</span>
                        <div className="chk-loyalty-subheading">
                          Top up complimentary delicacies with points
                        </div>
                      </div>
                    </div>

                    <div className="chk-loyalty-pts-pill">
                      <span className="chk-loyalty-pts-num">{customerPoints}</span>
                      <span className="chk-loyalty-pts-lbl">POINTS</span>
                    </div>
                  </div>

                  {/* Earning banner */}
                  <div className="chk-loyalty-earn-notice">
                    <span>✨</span>
                    <span><strong>+20 VIP Points</strong> will be credited on delivery of this feast</span>
                  </div>

                  {/* ACTIVE TOPPED-UP REWARD CARD */}
                  {appliedReward ? (
                    <div className="chk-applied-topup-card">
                      <div className="chk-applied-topup-left">
                        <span className="chk-applied-topup-badge">✓ TOPPED UP INTO ORDER</span>
                        <h4 className="chk-applied-topup-name">{appliedReward.name}</h4>
                        <p className="chk-applied-topup-detail">
                          {appliedReward.type === 'FREE_ITEM' ? 'Complimentary Delicacy (₹0)' : `Privilege Discount (-₹${loyaltyDiscountAmount})`}
                          {' • '}Used {appliedReward.pointsCost} points
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAppliedReward(null)}
                        className="chk-applied-topup-remove"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : (
                    /* AVAILABLE TOP-UPS TRAY */
                    <div className="chk-topups-tray">
                      <div className="chk-topups-tray-header">
                        <span className="chk-topups-tray-title">AVAILABLE TOP-UP DELICACIES</span>
                        <span className="chk-topups-tray-count">{rewardsList.length} Options</span>
                      </div>

                      {rewardsList.length > 0 ? (
                        <div className="chk-topup-cards-grid">
                          {rewardsList.map((r) => {
                            const canAfford = customerPoints >= r.pointsCost
                            const meetsMinOrder = cartTotal >= (r.minOrder || 0)
                            const isEligible = canAfford && meetsMinOrder
                            const ptsNeeded = Math.max(0, r.pointsCost - customerPoints)
                            const progressPct = Math.min(100, Math.round((customerPoints / r.pointsCost) * 100))

                            return (
                              <div
                                key={r.id}
                                className={`chk-topup-item-card ${isEligible ? 'eligible' : 'locked'}`}
                              >
                                <div className="chk-topup-item-main">
                                  <div className="chk-topup-item-icon">
                                    {r.type === 'FREE_ITEM' ? '🍮' : '🏷️'}
                                  </div>
                                  <div className="chk-topup-item-info">
                                    <div className="chk-topup-item-tags">
                                      <span className="chk-topup-tag type">
                                        {r.type === 'FREE_ITEM' ? 'FREE DISH' : 'DISCOUNT'}
                                      </span>
                                      <span className="chk-topup-tag cost">
                                        🪙 {r.pointsCost} PTS
                                      </span>
                                    </div>
                                    <h5 className="chk-topup-item-name">{r.name}</h5>
                                    <p className="chk-topup-item-desc">
                                      {r.description || (r.type === 'FREE_ITEM' ? 'Free delicacy added to order' : `Save ₹${r.discountValue} on order`)}
                                    </p>
                                    {r.minOrder > 0 && (
                                      <span className="chk-topup-min-order">
                                        Min order ₹{r.minOrder}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Action / Status Bar */}
                                <div className="chk-topup-action-bar">
                                  {isEligible ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const calcDiscount = r.type === 'PERCENT_DISCOUNT'
                                          ? Math.min(r.discountMax || 9999, Math.round((cartTotal * (r.discountValue || 0)) / 100))
                                          : (r.discountValue || 0)
                                        setAppliedReward({
                                          ...r,
                                          discount: Math.min(calcDiscount, cartTotal),
                                        })
                                        setRewardError('')
                                      }}
                                      className="chk-topup-btn-claim"
                                    >
                                      <span>+ TOP UP THIS DELICACY</span>
                                      <span className="chk-topup-free-tag">FREE</span>
                                    </button>
                                  ) : !canAfford ? (
                                    <div className="chk-topup-locked-box">
                                      <div className="chk-topup-locked-label">
                                        <span>🔒 Need {ptsNeeded} more pts</span>
                                        <span>{customerPoints}/{r.pointsCost}</span>
                                      </div>
                                      <div className="chk-topup-progress-track">
                                        <div
                                          className="chk-topup-progress-fill"
                                          style={{ width: `${progressPct}%` }}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="chk-topup-min-needed">
                                      Add ₹{(r.minOrder - cartTotal).toFixed(0)} more items to qualify
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="chk-topups-empty">
                          No top-up perks configured at this time.
                        </div>
                      )}
                    </div>
                  )}

                  {rewardError && <p className="chk-topup-err">⚠️ {rewardError}</p>}
                </div>

                {/* Bill Details Breakdown */}
                <div className="chk-bill-details">
                  <div className="bill-row">
                    <span>Items Subtotal</span>
                    <span>₹{cartTotal.toFixed(0)}</span>
                  </div>

                  {appliedCoupon && (
                    <div className="bill-row discount">
                      <span>Coupon Discount ({appliedCoupon.couponCode})</span>
                      <span>-₹{discountAmount}</span>
                    </div>
                  )}

                  {appliedReward && (
                    <div className="bill-row discount" style={{ color: '#15803D' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🎁</span>
                        <span>{appliedReward.type === 'FREE_ITEM' ? `Complimentary ${appliedReward.name}` : `VIP Discount (${appliedReward.name})`}</span>
                      </span>
                      <span>
                        {appliedReward.type === 'FREE_ITEM' ? (
                          <>
                            <span style={{ textDecoration: 'line-through', opacity: 0.6, marginRight: '6px' }}>
                              ₹{loyaltyDiscountAmount}
                            </span>
                            <strong style={{ color: '#15803D' }}>FREE (₹0)</strong>
                          </>
                        ) : (
                          `-₹${loyaltyDiscountAmount}`
                        )}
                      </span>
                    </div>
                  )}

                  <div className="bill-row" style={{ color: '#B45309', fontWeight: 800, fontSize: '0.74rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>✨</span>
                      <span>VIP Points To Earn On Delivery</span>
                    </span>
                    <span>+20 Points</span>
                  </div>

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
                  CONTINUE TO CASH ON DELIVERY →
                </button>
              </form>
            ) : (
              /* STEP 2: CASH ON DELIVERY & FINAL CONFIRMATION */
              <div className="chk-form-step">
                <div className="step-intro">
                  <div className="step-top-row">
                    <span className="step-badge">STEP 2 OF 2</span>
                    <button type="button" onClick={() => setStep(1)} className="edit-addr-link">
                      ← Edit Address
                    </button>
                  </div>
                  <h3>Cash On Delivery (COD)</h3>
                  <p className="delivering-to-text">Confirm your order & pay upon doorstep delivery</p>
                </div>

                {!user && (
                  <div className="auth-prompt-banner" style={{ marginBottom: '16px', background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>Please sign in so your order links to your account:</span>
                    <button type="button" onClick={openAuthModal} className="auth-btn-link" style={{ marginTop: '4px', fontWeight: 700 }}>
                      Sign In Now →
                    </button>
                  </div>
                )}

                <div className="cod-box-wrapper">
                  {/* Selected Payment Method Card */}
                  <div className="cod-selection-card">
                    <span className="cod-active-badge">
                      <span>●</span> ACTIVE PAYMENT
                    </span>
                    <div className="cod-icon-wrap">
                      💵
                    </div>
                    <div className="cod-meta-info">
                      <h4 className="cod-meta-title">Cash on Delivery (COD)</h4>
                      <p className="cod-meta-desc">Pay physical cash or scan the rider&apos;s UPI QR when your piping hot dum biryani arrives.</p>
                    </div>
                    <div className="cod-check-indicator">
                      ✓
                    </div>
                  </div>

                  {/* Delivery Location Preview */}
                  <div className="cod-dest-card">
                    <div className="cod-dest-text">
                      <strong>📍 Delivering to {name} ({phone})</strong>
                      <span>{address}</span>
                    </div>
                    <button type="button" onClick={() => setStep(1)} className="cod-edit-btn">
                      Change
                    </button>
                  </div>

                  {/* Topped-Up VIP Delicacy Confirmation */}
                  {appliedReward && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px 14px',
                      background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
                      border: '1.5px solid #86EFAC',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
                    }}>
                      <span style={{ fontSize: '1.4rem' }}>🎁</span>
                      <div style={{ flex: 1, fontSize: '0.8rem', color: '#166534', lineHeight: 1.35 }}>
                        <strong style={{ display: 'block', color: '#15803D', fontSize: '0.86rem' }}>
                          ✓ Topped-Up: {appliedReward.name}
                        </strong>
                        <span>Packed complimentary with your feast! (Redeemed with {appliedReward.pointsCost} points)</span>
                      </div>
                    </div>
                  )}

                  {/* COD Exact Amount Due Tip */}
                  <div className="cod-change-tip">
                    <span>💡</span>
                    <div>
                      <strong>Payable Amount: ₹{finalTotal.toFixed(0)}</strong>
                      <div>Please keep exact cash ready or request the rider to present their UPI scanner on delivery.</div>
                    </div>
                  </div>

                  {/* Assurance Grid */}
                  <div className="cod-assurance-grid">
                    <div className="cod-assurance-item">
                      <span className="cod-assurance-icon">⚡</span>
                      <span><strong>Instant Dispatch:</strong> Straight to kitchen — no payment verification delays!</span>
                    </div>
                    <div className="cod-assurance-item">
                      <span className="cod-assurance-icon">🛡️</span>
                      <span><strong>Zero Risk:</strong> Inspect your tamper-proof sealed pack before paying.</span>
                    </div>
                    <div className="cod-assurance-item">
                      <span className="cod-assurance-icon">🍲</span>
                      <span><strong>Authentic Dum Biryani:</strong> Handi-cooked and served piping hot with raita.</span>
                    </div>
                  </div>

                  {/* Submit Order Action Button */}
                  <button
                    type="button"
                    onClick={handleFinalOrderSubmit}
                    disabled={coLoading || settings?.isStoreOpen === false}
                    className="cod-submit-btn"
                  >
                    <span>{coLoading ? '⏳ PLACING YOUR COD ORDER...' : 'PLACE CASH ON DELIVERY ORDER ➔'}</span>
                    <span className="cod-submit-price-badge">₹{finalTotal.toFixed(0)}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
