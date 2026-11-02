// pages/api/loyalty/claim.js
import { verifyAccessToken } from '../../../lib/jwt'
import {
  claimPointsForOrder,
  normalizePhone,
  getLoyaltyConfig,
} from '../../../lib/loyalty'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { orderId, phone } = req.body
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required to claim points' })
    }

    let customerPhone = phone ? normalizePhone(phone) : null

    // Fallback to JWT token if phone not in body
    if (!customerPhone) {
      const authHeader = req.headers.authorization
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const decoded = verifyAccessToken(authHeader.split(' ')[1])
        if (decoded?.phone) {
          customerPhone = normalizePhone(decoded.phone)
        }
      }
    }

    if (!customerPhone) {
      return res.status(400).json({ error: 'Please provide the 10-digit mobile number linked to this order' })
    }

    const cfg = await getLoyaltyConfig()
    if (!cfg.enabled) {
      return res.status(409).json({ error: 'The Badshah VIP Club loyalty program is currently paused' })
    }

    const result = await claimPointsForOrder(orderId, customerPhone)

    return res.status(200).json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Loyalty Claim API Error:', error)
    return res.status(400).json({ error: error.message || 'Failed to claim dining points' })
  }
}
