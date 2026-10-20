// ── Biryani Badshah RBAC ─────────────────────────────────────────
// Roles: customer < staff < admin
// Staff: Live Orders / All Orders dashboards only (order status updates).
// Admin: full backend — menu, coupons, users, payments-history, settings.

export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  CUSTOMER: 'customer',
}

const TIER = { customer: 0, staff: 1, admin: 2 }

// Hard-coded admin identity list (keep in sync with AuthContext + Firestore rules)
export const ADMIN_EMAILS = [
  'admin@biryanibadshah.com',
  'admin@biryanibadshah.in',
  'amaanullah2607@gmail.com',
  'md.amanullahkhan1980@gmail.com',
  'admin@gmail.com',
  'admin@admin.com',
]

export function resolveRole({ email, role } = {}) {
  const e = String(email || '').toLowerCase().trim()
  const r = String(role || '').toLowerCase().trim()
  if (r === ROLES.ADMIN || ADMIN_EMAILS.includes(e) || e.startsWith('admin@')) return ROLES.ADMIN
  if (r === ROLES.STAFF) return ROLES.STAFF
  return ROLES.CUSTOMER
}

export function hasTier(actualRole, requiredTier) {
  return (TIER[String(actualRole).toLowerCase()] || 0) >= (TIER[String(requiredTier).toLowerCase()] || 0)
}

// Pages a staff member may open in the admin desk
export const STAFF_ALLOWED_PAGES = ['dashboard', 'orders', 'all-orders']
