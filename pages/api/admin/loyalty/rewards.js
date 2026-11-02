// pages/api/admin/loyalty/rewards.js
import { withAuth } from '../../../../lib/authMiddleware'
import { ROLES } from '../../../../lib/roles'
import { listRewards, upsertReward, deleteReward } from '../../../../lib/loyalty'

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rewards = await listRewards(false) // all rewards including inactive
      return res.status(200).json(rewards)
    }

    if (req.method === 'POST') {
      const { name, type, pointsCost } = req.body || {}
      if (!name || !type || !pointsCost) {
        return res.status(400).json({ error: 'Reward name, type, and points cost are required' })
      }
      const saved = await upsertReward(req.body)
      return res.status(200).json({ success: true, reward: saved })
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Reward ID is required' })
      await deleteReward(id)
      return res.status(200).json({ success: true, message: 'Reward deleted successfully' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Admin Loyalty Rewards Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to manage rewards' })
  }
}

export default withAuth(handler, ROLES.ADMIN)
