import { withAuth } from '../../../lib/authMiddleware'
import { patchFirestoreDoc } from '../../../lib/firestoreServer'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { orderId, cancellationReason } = req.body

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' })
    }

    const cleanId = String(orderId).replace(/^#/, '').trim()
    const now     = new Date().toISOString()

    // ── Pure Firestore authenticated REST update ──────────────────────────
    let existingOrder = null
    try {
      const { fetchFirestoreDoc } = await import('../../../lib/firestoreServer')
      existingOrder = await fetchFirestoreDoc('orders', cleanId).catch(() => null)
    } catch (_) {}

    try {
      await patchFirestoreDoc('orders', cleanId, {
        orderStatus:        'Cancelled',
        status:             'Cancelled',
        cancellationReason: cancellationReason || 'Cancelled by User',
        updatedAt:          now,
      })
    } catch (fsErr) {
      console.warn('Firestore cancellation error:', fsErr.message)
      return res.status(500).json({ error: 'Failed to update order in Firestore: ' + fsErr.message })
    }

    // ── Loyalty Reversal & Redemption Restore Hook ──────────────────────────
    if (existingOrder) {
      try {
        const { reverseOrderPoints, cancelRedemption } = await import('../../../lib/loyalty')
        if (existingOrder.loyaltyAwarded) {
          await reverseOrderPoints(
            { ...existingOrder, orderId: cleanId },
            cancellationReason || 'Order cancelled'
          ).catch(e => console.warn('Loyalty points reversal notice:', e.message))
        }

        const activeRedemptionId = existingOrder.loyaltyRedemptionId || existingOrder.redemptionId
        if (activeRedemptionId) {
          await cancelRedemption(activeRedemptionId, `Order #${cleanId} cancelled`).catch(() => {})
        }
      } catch (lErr) {
        console.warn('Loyalty cancellation hook notice:', lErr.message)
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      orderId: cleanId,
    })
  } catch (error) {
    console.error('Cancellation Error:', error)
    return res.status(500).json({ error: 'Failed to process cancellation request: ' + error.message })
  }
}

export default withAuth(handler)
