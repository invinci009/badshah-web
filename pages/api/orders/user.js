import { withAuth } from '../../../lib/authMiddleware'
import { queryFirestoreCollection, fsWhere } from '../../../lib/firestoreServer'

// ─── Lean projection: only return fields the My Orders page needs ─────────────
const USER_ORDER_PROJECTION = [
  'orderId', 'orderStatus', 'status', 'paymentStatus', 'paymentMethod',
  'grandTotal', 'subtotal', 'deliveryCharge', 'discount', 'tax',
  'items', 'deliveryAddress', 'customerName', 'userName',
  'transactionReference', 'appliedCoupon',
  'createdAt', 'updatedAt', 'rejectionReason',
  'customerMarkedPaid', 'refund'
]

// ─── Pure Firestore query using authenticated REST ────────────────────────────
// Uses equality filter on userId with in-memory descending sort by createdAt
async function fetchUserOrdersFromFirestore(userId, limitN) {
  try {
    const docs = await queryFirestoreCollection({
      collectionId: 'orders',
      where:  fsWhere('userId', '==', userId),
      limit:  limitN + 50,
    })

    // Sort newest-first in-memory
    docs.sort((a, b) => {
      const ta = a.createdAt ? new Date(String(a.createdAt)).getTime() : 0
      const tb = b.createdAt ? new Date(String(b.createdAt)).getTime() : 0
      return tb - ta
    })

    return docs.slice(0, limitN).map(d => ({
      ...d,
      _id:       d._docId || d.orderId,
      id:        d._docId || d.orderId,
      orderId:   d.orderId || d._docId,
      createdAt: d.createdAt || new Date().toISOString(),
      source:   'firestore',
    }))
  } catch (e) {
    console.warn('Firestore user orders query failed:', e.message)
    return []
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, limit: limitParam, page: pageParam } = req.query

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' })
  }

  const limitN = Math.min(Number(limitParam) || 50, 100)
  const page   = Math.max(Number(pageParam)  || 1, 1)

  try {
    const orders = await fetchUserOrdersFromFirestore(userId, limitN)
    return res.status(200).json({
      success: true,
      orders,
      page,
      limit: limitN,
      source: 'firestore'
    })
  } catch (error) {
    console.error('User Orders API Error:', error)
    return res.status(500).json({ success: false, error: 'Failed to fetch user orders', orders: [] })
  }
}

export default withAuth(handler)
