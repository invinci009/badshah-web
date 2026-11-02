// pages/api/admin/loyalty/adjust.js
import { withAuth } from '../../../../lib/authMiddleware'
import { ROLES } from '../../../../lib/roles'
import { adjustPoints } from '../../../../lib/loyalty'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { customerId, delta, reason } = req.body || {}
    const pointsDelta = Number(delta)

    if (!customerId) {
      return res.status(400).json({ error: 'Customer identifier is required' })
    }
    if (!pointsDelta || isNaN(pointsDelta) || pointsDelta === 0) {
      return res.status(400).json({ error: 'Point adjustment cannot be zero' })
    }
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ error: 'A detailed reason (min 3 characters) is mandatory for point adjustment audit logs' })
    }

    const adminActor = req.user?.email || req.user?.displayName || 'Admin'
    const result = await adjustPoints(customerId, pointsDelta, reason.trim(), adminActor)

    return res.status(200).json({
      success: true,
      message: `Successfully adjusted points: ${pointsDelta > 0 ? '+' : ''}${pointsDelta} pts for customer ${customerId}`,
      ...result,
    })
  } catch (error) {
    console.error('Admin Loyalty Adjust Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to adjust customer points' })
  }
}

export default withAuth(handler, ROLES.ADMIN)
