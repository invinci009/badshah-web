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
