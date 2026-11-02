// pages/api/loyalty/summary.js
import { verifyAccessToken } from '../../../lib/jwt'
import {
  getCustomerLoyaltySnapshot,
  getLoyaltyConfig,
  normalizePhone,
} from '../../../lib/loyalty'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    let customerId = null
    let customerPhone = null

    // 1. Try decoding Bearer token if present
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const decoded = verifyAccessToken(authHeader.split(' ')[1])
      if (decoded) {
        customerId = decoded.phone ? normalizePhone(decoded.phone) : (decoded.uid || decoded.email)
        if (decoded.phone) customerPhone = normalizePhone(decoded.phone)
      }
    }

    // 2. Query param phone fallback
    const queryPhone = req.query.phone
    if (!customerId && queryPhone) {
      const norm = normalizePhone(queryPhone)
      if (norm) {
        customerId = norm
        customerPhone = norm
      }
    }

    // 3. Query param customerId / uid fallback
    if (!customerId && req.query.customerId) {
      customerId = String(req.query.customerId).trim()
    }

    if (!customerId) {
      return res.status(400).json({ error: 'Please sign in or provide a valid mobile number to view VIP Club points' })
    }

    const [snapshotData, config] = await Promise.all([
      getCustomerLoyaltySnapshot(customerId),
      getLoyaltyConfig(),
    ])

    return res.status(200).json({
      success: true,
      ...snapshotData,
      config: {
        enabled: config.enabled,
        pointsPerOrder: config.pointsPerOrder,
        minOrder: config.minOrder,
        expiryEnabled: config.expiryEnabled,
        expiryDays: config.expiryDays,
      },
    })
  } catch (error) {
    console.error('Loyalty Summary API Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to retrieve loyalty summary' })
  }
}
