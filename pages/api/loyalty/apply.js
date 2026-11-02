// pages/api/loyalty/apply.js
import { verifyAccessToken } from '../../../lib/jwt'
import {
  listRewards,
  getLoyaltyAccount,
  getRewardEligibility,
  computeRewardDiscount,
  normalizePhone,
} from '../../../lib/loyalty'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { rewardId, subtotal, phone, customerId: reqCustomerId } = req.body
    if (!rewardId) {
      return res.status(400).json({ error: 'Reward ID is required' })
    }

    let customerId = reqCustomerId || null
    if (!customerId && phone) {
      customerId = normalizePhone(phone)
    }

    const authHeader = req.headers.authorization
    if (!customerId && authHeader && authHeader.startsWith('Bearer ')) {
      const decoded = verifyAccessToken(authHeader.split(' ')[1])
      if (decoded) {
        customerId = decoded.phone ? normalizePhone(decoded.phone) : (decoded.uid || decoded.email)
      }
    }

    if (!customerId) {
      return res.status(401).json({ error: 'Please sign in or enter your mobile number to redeem points' })
    }

    const account = await getLoyaltyAccount(customerId)
    if (!account) {
      return res.status(404).json({ error: 'No VIP loyalty account found for this user' })
    }

    const rewards = await listRewards(true)
    const reward = rewards.find(r => r.id === rewardId)
    if (!reward) {
      return res.status(404).json({ error: 'Reward perk not found or currently inactive' })
    }

    const sub = Number(subtotal) || 0
    const eligibility = getRewardEligibility(reward, account.availablePoints || 0, sub)
    if (!eligibility.eligible) {
      return res.status(400).json({ error: eligibility.message, code: eligibility.code })
    }

    const discountAmount = computeRewardDiscount(reward, sub)

    return res.status(200).json({
      success: true,
      rewardId: reward.id,
      rewardName: reward.name,
      rewardType: reward.type,
      pointsCost: reward.pointsCost,
      discountAmount,
      customerPoints: account.availablePoints,
      message: `Reward "${reward.name}" verified: save ₹${discountAmount} using ${reward.pointsCost} points!`,
    })
  } catch (error) {
    console.error('Loyalty Apply API Error:', error)
    return res.status(400).json({ error: error.message || 'Failed to apply reward perk' })
  }
}
