import { verifyAccessToken, verifyRefreshToken } from './jwt'
import { ROLES, resolveRole, hasTier } from './roles'
import * as cookie from 'cookie'

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
      let token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null
      let decoded = token ? verifyAccessToken(token) : null

      // Seamless fallback: If in-memory access token expired or is missing, check HttpOnly refresh cookie
      if (!decoded && req.headers.cookie) {
        try {
          const cookieHeader = req.headers.cookie || ''
          const parseFn = typeof cookie.parse === 'function' ? cookie.parse : cookie.default?.parse
          const parsed = parseFn ? parseFn(cookieHeader) : {}
          const refreshToken = parsed.badshah_refresh_token
          if (refreshToken) {
            const refreshDecoded = verifyRefreshToken(refreshToken)
            if (refreshDecoded) {
              decoded = refreshDecoded
            }
          }
        } catch (_) {}
      }

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
