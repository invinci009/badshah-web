import { withAuth } from '../../../lib/authMiddleware'
import { ROLES } from '../../../lib/roles'
import { patchFirestoreDoc } from '../../../lib/firestoreServer'

// Admin-only: assign the RBAC role for a user (customer | staff | admin).
// Updates the user document directly in Firestore;
// subsequent JWTs (login/refresh) will embed the updated role.
const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, role } = req.body
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' })
  }
  if (!Object.values(ROLES).includes(role)) {
    return res.status(400).json({ error: 'role must be customer, staff or admin' })
  }

  try {
    await patchFirestoreDoc('users', userId, {
      role,
      updatedAt: new Date().toISOString(),
    })

    return res.status(200).json({ success: true, userId, role })
  } catch (error) {
    console.error('Set Role API Error:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}

export default withAuth(handler, ROLES.ADMIN)
