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
  const pay = String(d.paymentStatus || '').toLowerCase()
  const ord = String(d.orderStatus || d.status || '').toLowerCase()
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

    if (!isAdmin) {
      try {
        d = await fetchFirestoreDoc('orders', cleanOrderId)
        if (d) gateKnown = true
      } catch (_) { /* fall through */ }

      const reqStatus = String(orderStatus || '').toLowerCase()
      if (gateKnown && orderStatus && STEP_STATUSES.has(reqStatus) && !inferApproved(d)) {
        return res.status(403).json({
          error: 'Payment not approved yet. Admin must verify & approve the UPI payment before the order can be accepted or advanced.',
        })
      }
    }

    // ── Build update payload ──────────────────────────────────────────────
    const now          = new Date()
    const updateFields = { updatedAt: now.toISOString() }
    if (paymentStatus)   updateFields.paymentStatus   = paymentStatus
    if (orderStatus)   { updateFields.orderStatus = orderStatus; updateFields.status = orderStatus }
    if (rejectionReason) updateFields.rejectionReason = rejectionReason

    // ── Pure Firestore authenticated REST update ──────────────────────────
    try {
      await patchFirestoreDoc('orders', cleanOrderId, updateFields)
    } catch (e) {
      console.warn('Firestore authenticated write notice:', e.message)
    }

    return res.status(200).json({ success: true, order: updateFields })
  } catch (error) {
    return res.status(200).json({ success: true, message: 'Notice: ' + error.message })
  }
}

export default withAuth(handler, ROLES.STAFF)
