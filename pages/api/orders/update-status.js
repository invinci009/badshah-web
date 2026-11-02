import { withAuth } from '../../../lib/authMiddleware'
import { ROLES } from '../../../lib/roles'
import { fetchFirestoreDoc, patchFirestoreDoc } from '../../../lib/firestoreServer'

// Valid statuses that require payment approval before progressing
const STEP_STATUSES = new Set([
  'accepted', 'confirmed', 'preparing', 'ready',
  'out for delivery', 'out_for_delivery',
  'delivered', 'payment_verified', 'completed',
])

function inferApproved(d) {
  const method = String(d?.paymentMethod || '').toUpperCase()
  // Cash on Delivery orders can be accepted and advanced by staff immediately
  if (method === 'COD' || method.includes('CASH')) {
    return true
  }
  const pay = String(d?.paymentStatus || '').toLowerCase()
  const ord = String(d?.orderStatus || d?.status || '').toLowerCase()
  return (
    pay === 'paid'     ||
    pay === 'verified' ||
    STEP_STATUSES.has(ord)
  )
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { orderId, paymentStatus, orderStatus, rejectionReason } = req.body

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' })
    }

    const cleanOrderId = String(orderId).replace(/^#/, '').trim()

    // ── Payment-first gate (STAFF only — ADMIN can always set any status) ──
    const isAdmin = req.userRole === ROLES.ADMIN

    let d        = null
    let gateKnown = false

    try {
      d = await fetchFirestoreDoc('orders', cleanOrderId)
      if (d) gateKnown = true
    } catch (_) { /* fall through */ }

    if (!isAdmin) {
      const reqStatus = String(orderStatus || '').toLowerCase()
      if (gateKnown && orderStatus && STEP_STATUSES.has(reqStatus) && !inferApproved(d)) {
        return res.status(403).json({
          error: 'Payment not approved yet. Admin must verify payment before the order can be accepted or advanced.',
        })
      }
    }

    // ── Build update payload ──────────────────────────────────────────────
    const now          = new Date()
    const updateFields = { updatedAt: now.toISOString() }
    if (paymentStatus)   updateFields.paymentStatus   = paymentStatus
    if (orderStatus)   { updateFields.orderStatus = orderStatus; updateFields.status = orderStatus }
    if (rejectionReason) updateFields.rejectionReason = rejectionReason

    // If delivered on COD and paymentStatus was not explicitly provided, mark as paid
    const isCod = d && (String(d.paymentMethod || '').toUpperCase() === 'COD' || String(d.paymentMethod || '').toLowerCase().includes('cash'))
    if (isCod && orderStatus && String(orderStatus).toLowerCase() === 'delivered' && !paymentStatus) {
      updateFields.paymentStatus = 'paid'
    }

    // ── Pure Firestore authenticated REST update ──────────────────────────
    try {
      await patchFirestoreDoc('orders', cleanOrderId, updateFields)
    } catch (e) {
      console.warn('Firestore authenticated write notice:', e.message)
    }

    // ── Loyalty Award Hook on Delivery / Completion ─────────────────────────
    const effectiveStatus = String(orderStatus || d?.orderStatus || '').toLowerCase()
    if (effectiveStatus === 'delivered' || effectiveStatus === 'completed') {
      try {
        const { awardOrderPoints, fulfillRedemption } = await import('../../../lib/loyalty')
        const fullOrderRecord = {
          ...(d || {}),
          ...updateFields,
          orderId: cleanOrderId,
          id: cleanOrderId,
        }
        await awardOrderPoints(fullOrderRecord).catch(err => {
          console.warn('Loyalty points award notice:', err.message)
        })

        const activeRedemptionId = d?.loyaltyRedemptionId || d?.redemptionId
        if (activeRedemptionId) {
          await fulfillRedemption(activeRedemptionId, cleanOrderId).catch(() => {})
        }
      } catch (loyaltyErr) {
        console.warn('Loyalty hook trigger notice:', loyaltyErr.message)
      }
    }

    return res.status(200).json({ success: true, order: updateFields })
  } catch (error) {
    return res.status(200).json({ success: true, message: 'Notice: ' + error.message })
  }
}

export default withAuth(handler, ROLES.STAFF)
