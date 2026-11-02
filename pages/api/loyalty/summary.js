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
    let customerEmail = req.query.email ? String(req.query.email).toLowerCase().trim() : null

    // 1. Phone number is primary identity for Indian diner VIP accounts
    const queryPhone = req.query.phone
    if (queryPhone) {
      const norm = normalizePhone(queryPhone)
      if (norm) {
        customerId = norm
        customerPhone = norm
      }
    }

    // 2. Try decoding Bearer token if present
    const authHeader = req.headers.authorization
    let tokenUid = null
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const decoded = verifyAccessToken(authHeader.split(' ')[1])
      if (decoded) {
        if (decoded.email && !customerEmail) {
          customerEmail = String(decoded.email).toLowerCase().trim()
        }
        if (decoded.phone && !customerPhone) {
          const norm = normalizePhone(decoded.phone)
          if (norm) {
            customerPhone = norm
            if (!customerId) customerId = norm
          }
        }
        tokenUid = decoded.uid
        if (!customerId) {
          customerId = customerPhone || decoded.uid || decoded.email
        }
      }
    }

    // 3. Query param customerId / uid fallback
    if (!customerId && req.query.customerId) {
      customerId = String(req.query.customerId).trim()
    }

    // 4. Fallback to email if still no customerId
    if (!customerId && customerEmail) {
      customerId = customerEmail
    }

    if (!customerId) {
      return res.status(400).json({ error: 'Please sign in or provide a valid mobile number to view VIP Club points' })
    }

    const userMeta = {
      phone: customerPhone,
      email: customerEmail,
      userId: tokenUid || (req.query.customerId && !/^\d{10}$/.test(req.query.customerId) ? req.query.customerId : null),
    }

    const [snapshotData, config] = await Promise.all([
      getCustomerLoyaltySnapshot(customerId, userMeta),
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
