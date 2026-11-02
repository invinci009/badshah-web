// pages/api/loyalty/rewards.js
import { verifyAccessToken } from '../../../lib/jwt'
import {
  listRewards,
  getLoyaltyAccount,
  getRewardEligibility,
  computeRewardDiscount,
  normalizePhone,
} from '../../../lib/loyalty'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    let customerPoints = 0
    let customerId = null

    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const decoded = verifyAccessToken(authHeader.split(' ')[1])
      if (decoded) {
        customerId = decoded.phone ? normalizePhone(decoded.phone) : (decoded.uid || decoded.email)
      }
    }

    if (!customerId && req.query.phone) {
      customerId = normalizePhone(req.query.phone)
    }

    if (!customerId && req.query.customerId) {
      customerId = String(req.query.customerId).trim()
    }

    if (customerId) {
      const account = await getLoyaltyAccount(customerId)
      if (account) {
        customerPoints = account.availablePoints || 0
      }
    }

    const subtotal = Number(req.query.subtotal) || 0
    const rewards = await listRewards(true) // active only

    const annotatedRewards = rewards.map(r => {
      const eligibility = getRewardEligibility(r, customerPoints, subtotal)
      const potentialDiscount = computeRewardDiscount(r, subtotal || r.minOrder || 100)
      return {
        ...r,
        eligible: eligibility.eligible,
        eligibilityCode: eligibility.code,
        eligibilityMessage: eligibility.message,
        pointsNeeded: Math.max(0, r.pointsCost - customerPoints),
        potentialDiscount,
      }
    })

    return res.status(200).json({
      success: true,
      customerPoints,
      rewards: annotatedRewards,
    })
  } catch (error) {
    console.error('Loyalty Rewards API Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to list rewards' })
  }
}
