// pages/api/admin/loyalty/config.js
import { withAuth } from '../../../../lib/authMiddleware'
import { ROLES } from '../../../../lib/roles'
import { getLoyaltyConfig, saveLoyaltyConfig } from '../../../../lib/loyalty'

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const config = await getLoyaltyConfig()
      return res.status(200).json(config)
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const updated = await saveLoyaltyConfig(req.body || {})
      return res.status(200).json({ success: true, config: updated })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Admin Loyalty Config Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to manage loyalty config' })
  }
}

export default withAuth(handler, ROLES.ADMIN)
