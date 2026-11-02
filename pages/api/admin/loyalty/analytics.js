// pages/api/admin/loyalty/analytics.js
import { withAuth } from '../../../../lib/authMiddleware'
import { ROLES } from '../../../../lib/roles'
import { getLoyaltyAnalytics } from '../../../../lib/loyalty'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const analytics = await getLoyaltyAnalytics()
    return res.status(200).json(analytics)
  } catch (error) {
    console.error('Admin Loyalty Analytics Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch loyalty analytics' })
  }
}

export default withAuth(handler, ROLES.ADMIN)
