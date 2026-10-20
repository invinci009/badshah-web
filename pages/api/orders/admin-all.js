import { withAuth } from '../../../lib/authMiddleware'
import { ROLES } from '../../../lib/roles'
import { queryFirestoreCollection, fsOrderBy } from '../../../lib/firestoreServer'

// ─── Authenticated Firestore REST query for Admin Orders ──────────────────────
// Fetches up to 500 most-recent orders and performs search & status filtering
async function fetchFromFirestore(limitN, skip, searchLower, filterStatusLower) {
  try {
    const docs = await queryFirestoreCollection({
      collectionId: 'orders',
      orderBy:      fsOrderBy('createdAt', 'DESCENDING'),
      limit:        500,
    })

    // Text filter across key search fields
    let filtered = searchLower
      ? docs.filter(o =>
          [o.orderId, o.customerPhone, o.userPhone, o.customerEmail, o.userEmail, o.customerName, o.userName]
            .some(v => String(v || '').toLowerCase().includes(searchLower))
        )
      : docs

    // Status filter
    if (filterStatusLower) {
      filtered = filtered.filter(o =>
        String(o.orderStatus || o.status || '').toLowerCase().includes(filterStatusLower)
      )
    }

    const total    = filtered.length
    const pageDocs = filtered.slice(skip, skip + limitN).map(d => ({
      ...d,
      _id: d._docId || d.orderId,
    }))
    return { orders: pageDocs, total }
  } catch (e) {
    console.warn('Firestore admin-all error:', e.message)
    return { orders: [], total: 0 }
  }
}

async function handler(req, res) {
  try {
    const { page = 1, limit = 50, search = '', status: filterStatus } = req.query
    const skip              = (parseInt(page) - 1) * parseInt(limit)
    const searchLower       = search     ? String(search).toLowerCase().trim()      : ''
    const filterStatusLower = filterStatus ? String(filterStatus).toLowerCase().trim() : ''

    const { orders, total } = await fetchFromFirestore(parseInt(limit), skip, searchLower, filterStatusLower)

    return res.status(200).json({
      orders,
      pagination: {
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      source: 'firestore',
    })
  } catch (error) {
    console.error('Admin All Orders API Error:', error)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
}

export default withAuth(handler, ROLES.STAFF)
