// pages/api/admin/loyalty/redemptions.js
import { withAuth } from '../../../../lib/authMiddleware'
import { ROLES } from '../../../../lib/roles'
import { queryFirestoreCollection } from '../../../../lib/firestoreServer'
import { cancelRedemption, FS_WEB_REDEMPTIONS } from '../../../../lib/loyalty'

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const redemptions = await queryFirestoreCollection({
        collectionId: FS_WEB_REDEMPTIONS,
        limit: 200,
      })

      const statusFilter = req.query.status
      const validRedemptions = (redemptions || []).filter(r => {
        if (!r) return false
        const docId = String(r._docId || r.id || '')
        if (docId.startsWith('wlr_') || docId.startsWith('wla_') || docId.startsWith('tx-') || docId === 'web_loyalty') return false
        if (r.docType === 'web_reward' || r.pointsCost !== undefined) return false
        return r.pointsUsed !== undefined || docId.startsWith('red-') || r.rewardId
      })

      let list = validRedemptions.map(r => ({
        id: r._docId || r.id,
        customerId: r.customerId,
        customerName: r.customerName || 'VIP Diner',
        customerPhone: r.customerPhone || '',
        rewardId: r.rewardId,
        rewardName: r.rewardName,
        pointsUsed: Number(r.pointsUsed || 0),
        discountAmount: Number(r.discountAmount || 0),
        orderId: r.orderId || null,
        status: r.status || 'APPLIED',
        createdAt: r.createdAt || '',
        refundNote: r.refundNote || null,
      }))

      if (statusFilter && statusFilter !== 'all') {
        list = list.filter(r => r.status.toLowerCase() === statusFilter.toLowerCase())
      }

      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      return res.status(200).json(list)
    }

    if (req.method === 'POST') {
      const { redemptionId, action, reason } = req.body || {}
      if (!redemptionId) return res.status(400).json({ error: 'Redemption ID is required' })

      if (action === 'CANCEL_RESTORE') {
        const result = await cancelRedemption(redemptionId, reason || 'Cancelled by Store Admin')
        return res.status(200).json({ success: true, message: 'Redemption cancelled and points restored', ...result })
      }

      return res.status(400).json({ error: 'Unknown action' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Admin Loyalty Redemptions Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to manage redemptions' })
  }
}

export default withAuth(handler, ROLES.ADMIN)
