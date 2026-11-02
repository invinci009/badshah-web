// pages/api/admin/loyalty/customers.js
import { withAuth } from '../../../../lib/authMiddleware'
import { ROLES } from '../../../../lib/roles'
import { queryFirestoreCollection } from '../../../../lib/firestoreServer'
import { computeTier, FS_WEB_LOYALTY_ACCOUNTS } from '../../../../lib/loyalty'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rawAccounts = await queryFirestoreCollection({
      collectionId: FS_WEB_LOYALTY_ACCOUNTS,
      limit: 250,
    })

    const search = String(req.query.search || '').trim().toLowerCase()

    const validAccounts = (rawAccounts || []).filter(a => {
      if (!a) return false
      const docId = String(a._docId || a.id || '')
      if (docId.startsWith('wlr_') || docId.startsWith('tx-') || docId.startsWith('red-') || docId === 'web_loyalty') return false
      if (a.docType === 'web_reward' || a.pointsCost !== undefined) return false
      return a.docType === 'web_loyalty_account' || a.availablePoints !== undefined || a.earnedTotal !== undefined || a.customerId
    })

    let rows = validAccounts.map(a => {
      const earned = Number(a.earnedTotal || 0)
      const tier = computeTier(earned)
      return {
        id: a._docId || a.id || a.customerId,
        customerId: a.customerId || a._docId || a.id,
        phone: a.phone || a.customerId || '',
        name: a.name || 'VIP Diner',
        email: a.email || '',
        availablePoints: Number(a.availablePoints || 0),
        earnedTotal: earned,
        redeemedTotal: Number(a.redeemedTotal || 0),
        expiredTotal: Number(a.expiredTotal || 0),
        adjustedTotal: Number(a.adjustedTotal || 0),
        status: a.status || 'active',
        tier: tier.name,
        tierBadge: tier.badge,
        tierColor: tier.color,
        createdAt: a.createdAt || '',
        updatedAt: a.updatedAt || '',
      }
    })

    if (search) {
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(search) ||
        r.phone.toLowerCase().includes(search) ||
        r.email.toLowerCase().includes(search) ||
        r.customerId.toLowerCase().includes(search)
      )
    }

    // Sort by available points descending
    rows.sort((a, b) => b.availablePoints - a.availablePoints)

    return res.status(200).json(rows)
  } catch (error) {
    console.error('Admin Loyalty Customers Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to list loyalty customers' })
  }
}

export default withAuth(handler, ROLES.ADMIN)
