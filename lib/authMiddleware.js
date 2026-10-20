import { verifyAccessToken } from './jwt'
import { ROLES, resolveRole, hasTier } from './roles'

/**
 * Wraps an API route handler with JWT authentication and RBAC.
 *
 *   withAuth(handler)              → any signed-in user (customer tier)
 *   withAuth(handler, 'staff')     → staff or admin
 *   withAuth(handler, 'admin') / withAuth(handler, true) → admin only
 *
 * Sets `req.userRole` to the resolved role for handlers that branch on it.
 */
export function withAuth(handler, requiredRole = ROLES.CUSTOMER) {
  // Legacy boolean call style: withAuth(handler, true) === admin-only
  if (requiredRole === true) requiredRole = ROLES.ADMIN
  if (requiredRole === false || requiredRole == null) requiredRole = ROLES.CUSTOMER

  return async (req, res) => {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' })
      }

      const token = authHeader.split(' ')[1]
      const decoded = verifyAccessToken(token)

      if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized: Expired or invalid token' })
      }

      req.user = decoded
      const role = resolveRole({ email: decoded.email, role: decoded.role })
      req.userRole = role

      if (!hasTier(role, requiredRole)) {
        return res.status(403).json({
          error: `Forbidden: ${requiredRole === ROLES.ADMIN ? 'Admin' : 'Staff'} access required`,
        })
      }

      return handler(req, res)
    } catch (e) {
      console.error('Auth Middleware Error:', e)
      return res.status(500).json({ error: 'Internal Server Error during authentication' })
    }
  }
}
