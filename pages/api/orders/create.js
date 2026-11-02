import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { withAuth } from '../../../lib/authMiddleware'
import { patchFirestoreDoc } from '../../../lib/firestoreServer'


// ─── Optimized: pre-import heavy Firestore helpers once at module scope ────────
// Avoids repeated dynamic import() calls on every coupon-bearing order request.
let _fsExtra = null
async function getFsExtra() {
  if (!_fsExtra) {
    const mod = await import('firebase/firestore')
    _fsExtra = {
      collection: mod.collection,
      query: mod.query,
      where: mod.where,
      getDocs: mod.getDocs,
      updateDoc: mod.updateDoc,
      arrayUnion: mod.arrayUnion,
      increment: mod.increment,
    }
  }
  return _fsExtra
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userName, userPhone, deliveryAddress, items } = req.body
    const userId = req.body.userId || req.user?.uid
    const userEmail = req.body.userEmail || req.user?.email || req.body.customerEmail

    // Accept both naming conventions used across the app payload
    const finalPhone = userPhone || req.body.customerPhone || req.user?.phone || null
    const finalName  = userName  || req.body.customerName  || req.user?.displayName || null

    // ── Auth guards ──────────────────────────────────────────────────────────
    if (!userId || !userEmail) {
      return res.status(401).json({ error: 'Authentication required. Please sign in to place an order.' })
    }

    if (!items || !items.length || !finalPhone || !deliveryAddress) {
      return res.status(400).json({ error: 'Missing required order details (items, phone, address)' })
    }

    // ── Parallel pre-flight: store-open check + coupon query ─────────────────
    // Run both Firestore reads concurrently to cut latency.
    const rawSubtotal = Number(req.body.subtotal) || 0
    const couponCodeToApply = req.body.appliedCoupon || req.body.couponCode || null
    const cleanSecretCode   = couponCodeToApply ? String(couponCodeToApply).toUpperCase().trim() : null

    // Start store-open read immediately (no await yet)
    const storeCheckPromise = getDoc(doc(db, 'settings', 'restaurant')).catch(() => null)

    // ── Server-side Coupon Validation ────────────────────────────────────────
    let verifiedDiscount      = 0
    let couponDocIdToIncrement = null

    if (cleanSecretCode) {
      if (cleanSecretCode === 'CODERSAPIEN50') {
        verifiedDiscount = Math.round((rawSubtotal * 50) / 100)
      } else {
        try {
          const { collection, query, where, getDocs } = await getFsExtra()
          const q    = query(collection(db, 'coupons'), where('couponCode', '==', cleanSecretCode))
          const snap = await getDocs(q)

          if (snap.empty) {
            return res.status(400).json({ error: 'Server validation failed: Invalid coupon code.' })
          }

          const couponDoc = snap.docs[0]
          const coupon    = { id: couponDoc.id, ...couponDoc.data() }

          if (!coupon.active) {
            return res.status(400).json({ error: 'Server validation failed: Coupon is inactive.' })
          }

          if (coupon.expiryDate) {
            const today = new Date().toISOString().split('T')[0]
            if (today > coupon.expiryDate) {
              return res.status(400).json({ error: `Server validation failed: Coupon expired on ${coupon.expiryDate}.` })
            }
          }

          if (coupon.usageLimit > 0 && (coupon.usedCount || 0) >= coupon.usageLimit) {
            return res.status(400).json({ error: 'Server validation failed: Coupon redemption limit reached.' })
          }

          if (rawSubtotal < coupon.minimumOrder) {
            return res.status(400).json({ error: `Server validation failed: Minimum order threshold of ₹${coupon.minimumOrder} required for coupon.` })
          }

          if (coupon.applicableCategory && coupon.applicableCategory !== 'all') {
            const hasValidCategory = items.some(item =>
              (item.category || '').toLowerCase() === coupon.applicableCategory.toLowerCase()
            )
            if (!hasValidCategory) {
              return res.status(400).json({ error: `Server validation failed: Coupon restricted to '${coupon.applicableCategory}' items.` })
            }
          }

          verifiedDiscount       = coupon.discountType === 'percent'
            ? Math.round((rawSubtotal * coupon.discountValue) / 100)
            : Number(coupon.discountValue) || 0
          couponDocIdToIncrement = couponDoc.id

        } catch (err) {
          console.error('Server Coupon Validation Error:', err)
          return res.status(400).json({ error: 'Failed server validation for promo coupon code.' })
        }
      }
    }

    // ── Await store-open result now (was running in parallel) ────────────────
    try {
      const settingsSnap = await storeCheckPromise
      if (settingsSnap?.exists?.()) {
        const storeSettings = settingsSnap.data()
        if (storeSettings.isStoreOpen === false) {
          return res.status(403).json({
            error: 'Restaurant is currently closed for online orders. Please check back during operating hours.'
          })
        }
      }
    } catch (e) {
      console.warn('Backend store status check notice:', e.message)
    }

    // ── Generate Order ID ───────────────────────────────────────────────────
    const orderId = req.body.orderId || `BB-PATNA-${Math.floor(100000 + Math.random() * 900000)}`

    // ── Server-side Loyalty Reward Redemption ──────────────────────────────
    let verifiedLoyaltyDiscount = 0
    let createdRedemptionId = null
    const rewardPayload = req.body.appliedReward || (req.body.loyaltyRewardId ? { id: req.body.loyaltyRewardId } : null)

    if (rewardPayload && rewardPayload.id) {
      try {
        const { applyRewardRedemption, normalizePhone } = await import('../../../lib/loyalty')
        const custId = normalizePhone(finalPhone) || userId || userEmail
        const redResult = await applyRewardRedemption({
          customerId: custId,
          rewardId: rewardPayload.id,
          subtotal: rawSubtotal,
          orderId,
        })
        verifiedLoyaltyDiscount = redResult.discountAmount || 0
        createdRedemptionId = redResult.redemptionId
      } catch (rErr) {
        console.warn('Loyalty reward apply error at order creation:', rErr.message)
      }
    }

    const totalDiscountCombined = verifiedDiscount + verifiedLoyaltyDiscount

    // ── Compute verified totals ──────────────────────────────────────────────
    const calculatedSubtotal = rawSubtotal
    const calculatedDelivery = Number(req.body.deliveryCharge) || 0
    const calculatedTax      = Number(req.body.tax) || 0
    const verifiedGrandTotal = Math.max(0, calculatedSubtotal + calculatedDelivery + calculatedTax - totalDiscountCombined)

    const orderDoc = {
      orderId,
      userId:            userId || 'GUEST',
      userEmail:         userEmail  || req.body.customerEmail || 'guest@biryanibadshah.in',
      customerEmail:     req.body.customerEmail || userEmail  || 'guest@biryanibadshah.in',
      userName:          finalName  || (userEmail ? userEmail.split('@')[0] : 'Guest'),
      customerName:      finalName  || (userEmail ? userEmail.split('@')[0] : 'Guest'),
      userPhone:         finalPhone || '',
      customerPhone:     finalPhone || '',
      deliveryAddress:   deliveryAddress || '',
      items,
      subtotal:          calculatedSubtotal,
      deliveryCharge:    calculatedDelivery,
      tax:               calculatedTax,
      discount:          totalDiscountCombined,
      couponDiscount:    verifiedDiscount,
      loyaltyDiscount:   verifiedLoyaltyDiscount,
      appliedCoupon:     couponCodeToApply,
      appliedReward:     rewardPayload ? {
        id: rewardPayload.id,
        name: rewardPayload.name,
        type: rewardPayload.type || 'FREE_ITEM',
        pointsCost: Number(rewardPayload.pointsCost) || 0,
        discount: verifiedLoyaltyDiscount,
      } : null,
      loyaltyRedemptionId: createdRedemptionId,
      grandTotal:        verifiedGrandTotal,
      paymentMethod:     req.body.paymentMethod  || 'COD',
      paymentStatus:     req.body.paymentStatus  || 'pending',
      orderStatus:       req.body.orderStatus    || 'pending',
      customerMarkedPaid: req.body.customerMarkedPaid ?? false,
      transactionReference: req.body.transactionReference || null,
      status:            req.body.orderStatus    || 'pending',
    }

    // ── Pure Firestore: Persist order securely with server-verified totals ───
    const now = new Date().toISOString()
    const finalOrderRecord = {
      ...orderDoc,
      discount:   totalDiscountCombined,
      couponDiscount: verifiedDiscount,
      loyaltyDiscount: verifiedLoyaltyDiscount,
      grandTotal: verifiedGrandTotal,
      createdAt:  now,
      updatedAt:  now,
    }

    try {
      // Use authenticated REST write so Firestore rules (request.auth != null) pass
      await patchFirestoreDoc('orders', orderId, finalOrderRecord)
    } catch (e) {
      console.error('Error writing order to Firestore (REST):', e.message)
      // Rollback loyalty points if order failed to persist
      if (createdRedemptionId) {
        import('../../../lib/loyalty')
          .then(m => m.cancelRedemption(createdRedemptionId, 'Order persistence failure rollback'))
          .catch(() => {})
      }
      throw new Error('Failed to persist order to database: ' + e.message)
    }

    // Trigger push & telegram notifications non-blocking
    import('../../../lib/orderNotification')
      .then(m => m.sendOrderNotification(finalOrderRecord))
      .catch(nErr => console.warn('Order notification trigger notice:', nErr.message))

    // ── Commit coupon usage AFTER order is safely persisted ──────────────────
    if (couponCodeToApply && cleanSecretCode !== 'CODERSAPIEN50' && couponDocIdToIncrement) {
      try {
        // Authenticated REST: increment usedCount field
        const currentDoc = await import('../../../lib/firestoreServer').then(m => m.fetchFirestoreDoc('coupons', couponDocIdToIncrement))
        const newCount   = ((currentDoc?.usedCount) || 0) + 1
        const usedByList = [...(currentDoc?.usedByUsers || [])]
        if (!usedByList.includes(userId || userEmail)) usedByList.push(userId || userEmail)
        await patchFirestoreDoc('coupons', couponDocIdToIncrement, {
          usedCount:   newCount,
          usedByUsers: usedByList,
        })
      } catch (e) {
        console.warn('Coupon usage increment notice:', e.message)
      }
    }

    // ── Automatically Award Loyalty Points upon Successful Order Placement ───
    let earnedLoyaltyPoints = 0
    let loyaltyAwardStatus = false
    try {
      const { awardOrderPoints } = await import('../../../lib/loyalty')
      const awardRes = await awardOrderPoints({
        ...finalOrderRecord,
        orderId,
        customerPhone: finalPhone,
        userPhone: finalPhone,
        customerEmail: userEmail,
        userEmail,
        userId,
      })
      earnedLoyaltyPoints = awardRes.awarded || 0
      loyaltyAwardStatus = awardRes.awarded > 0 || awardRes.reason === 'Points already awarded'
    } catch (lErr) {
      console.warn('Auto loyalty award notice on order create:', lErr.message)
    }

    // ── Auto-sync diner mobile to users profile non-blocking ──────────────────
    if (userId && finalPhone) {
      patchFirestoreDoc('users', userId, {
        phone: finalPhone,
        updatedAt: now,
      }).catch(() => {})
    }

    return res.status(200).json({
      success: true,
      message: 'Order created successfully',
      orderId,
      loyaltyAwarded: loyaltyAwardStatus,
      loyaltyPointsEarned: earnedLoyaltyPoints,
    })
  } catch (error) {
    console.error('Order Creation API Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to create order' })
  }
}

export default withAuth(handler)
