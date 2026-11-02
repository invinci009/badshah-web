import { withAuth } from '../../../../lib/authMiddleware'
import { ROLES } from '../../../../lib/roles'
import { queryFirestoreCollection, patchFirestoreDoc } from '../../../../lib/firestoreServer'
import { computeTier, FS_WEB_LOYALTY_ACCOUNTS, normalizePhone } from '../../../../lib/loyalty'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const [rawAccounts, users, orders] = await Promise.all([
      queryFirestoreCollection({ collectionId: FS_WEB_LOYALTY_ACCOUNTS, limit: 300 }).catch(e => { console.warn('Loyalty accounts query notice:', e.message); return [] }),
      queryFirestoreCollection({ collectionId: 'users', limit: 300 }).catch(e => { console.warn('Users query notice:', e.message); return [] }),
      queryFirestoreCollection({ collectionId: 'orders', limit: 300 }).catch(e => { console.warn('Orders query notice:', e.message); return [] }),
    ])

    const search = String(req.query.search || '').trim().toLowerCase()

    // ── Build Fast Resolution Maps from Users and Orders ────────────────────
    const phoneMap = new Map() // normPhone -> { name, email, uid }
    const emailMap = new Map() // email -> { name, phone, uid }
    const uidMap = new Map()   // uid -> { name, phone, email }

    function recordProfile(p, e, u, name) {
      const cleanName = (name && name !== 'VIP Diner' && name !== 'VIP Guest' && name !== 'Guest') ? String(name).trim() : null
      const pNorm = normalizePhone(p)
      const eNorm = e ? String(e).toLowerCase().trim() : null

      if (pNorm) {
        const cur = phoneMap.get(pNorm) || {}
        phoneMap.set(pNorm, { name: cleanName || cur.name, email: eNorm || cur.email, uid: u || cur.uid })
      }
      if (eNorm) {
        const cur = emailMap.get(eNorm) || {}
        emailMap.set(eNorm, { name: cleanName || cur.name, phone: pNorm || cur.phone, uid: u || cur.uid })
      }
      if (u) {
        const cur = uidMap.get(u) || {}
        uidMap.set(u, { name: cleanName || cur.name, phone: pNorm || cur.phone, email: eNorm || cur.email })
      }
    }

    (users || []).forEach(u => recordProfile(u.phone, u.email, u._docId || u.id, u.displayName || u.name));
    (orders || []).forEach(o => recordProfile(o.customerPhone || o.userPhone, o.customerEmail || o.userEmail, o.userId, o.customerName || o.userName));

    // ── Filter to true loyalty accounts ─────────────────────────────────────
    const validAccounts = (rawAccounts || []).filter(a => {
      if (!a) return false
      const docId = String(a._docId || a.id || '')
      if (docId.startsWith('wlr_') || docId.startsWith('tx-') || docId.startsWith('red-') || docId === 'web_loyalty') return false
      if (a.docType === 'web_reward' || a.pointsCost !== undefined) return false
      return a.docType === 'web_loyalty_account' || a.availablePoints !== undefined || a.earnedTotal !== undefined || a.customerId
    })

    // ── Group and Deduplicate by Customer Identity ──────────────────────────
    const merged = new Map()
    const healPromises = []

    for (const a of validAccounts) {
      const docId = String(a._docId || a.id || a.customerId || '')
      const rawPhone = a.phone || a.customerId || ''
      const p = normalizePhone(rawPhone) || emailMap.get(a.email?.toLowerCase().trim())?.phone || uidMap.get(docId)?.phone || null
      const e = a.email?.toLowerCase().trim() || phoneMap.get(p)?.email || uidMap.get(docId)?.email || ''

      // Customer name resolution priority:
      // 1. Explicit clean name on account doc
      // 2. Name from orders (freshest customer checkout name)
      // 3. Name from user profile
      // 4. Formatted email prefix
      // 5. Fallback 'VIP Diner'
      let resolvedName = (a.name && a.name !== 'VIP Diner' && a.name !== 'VIP Guest') ? a.name.trim() : null
      if (!resolvedName && p) resolvedName = phoneMap.get(p)?.name
      if (!resolvedName && e) resolvedName = emailMap.get(e)?.name
      if (!resolvedName && docId) resolvedName = uidMap.get(docId)?.name
      if (!resolvedName && e) {
        const prefix = e.split('@')[0]
        resolvedName = prefix.charAt(0).toUpperCase() + prefix.slice(1)
      }
      if (!resolvedName) resolvedName = 'VIP Diner'

      // Self-heal Firestore doc if it was missing the resolved name or phone
      if (docId && (a.name === 'VIP Diner' || !a.name || !a.phone) && (resolvedName !== 'VIP Diner' || p)) {
        healPromises.push(
          patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, docId, {
            name: resolvedName,
            phone: p || a.phone || '',
            email: e || a.email || '',
            updatedAt: new Date().toISOString(),
          }).catch(() => {})
        )
      }

      // Group key to unify duplicate accounts (phone > email > uid)
      const groupKey = p ? `p_${p}` : (e ? `e_${e}` : `u_${docId}`)
      const existing = merged.get(groupKey)

      const available = Number(a.availablePoints || 0)
      const earned = Number(a.earnedTotal || 0)
      const redeemed = Number(a.redeemedTotal || 0)
      const expired = Number(a.expiredTotal || 0)
      const adjusted = Number(a.adjustedTotal || 0)

      if (!existing) {
        const tier = computeTier(earned || available)
        merged.set(groupKey, {
          id: groupKey,
          customerId: p || e || docId,
          primaryDocId: docId,
          name: resolvedName,
          phone: p || '',
          email: e,
          availablePoints: available,
          earnedTotal: earned,
          redeemedTotal: redeemed,
          expiredTotal: expired,
          adjustedTotal: adjusted,
          status: a.status || 'active',
          tier: tier.name,
          tierBadge: tier.badge,
          tierColor: tier.color,
          createdAt: a.createdAt || '',
          updatedAt: a.updatedAt || '',
        })
      } else {
        // Upgrade with best available diner name
        if ((existing.name === 'VIP Diner' || existing.name === 'Guest') && resolvedName !== 'VIP Diner') {
          existing.name = resolvedName
        } else if (resolvedName && resolvedName.length > existing.name.length && resolvedName !== 'VIP Diner') {
          existing.name = resolvedName
        }
        if (!existing.phone && p) existing.phone = p
        if (!existing.email && e) existing.email = e
        existing.availablePoints = Math.max(existing.availablePoints, available)
        existing.earnedTotal = Math.max(existing.earnedTotal, earned)
        existing.redeemedTotal = Math.max(existing.redeemedTotal, redeemed)
        existing.expiredTotal = Math.max(existing.expiredTotal, expired)
        existing.adjustedTotal = Math.max(existing.adjustedTotal, adjusted)
        const tier = computeTier(existing.earnedTotal || existing.availablePoints)
        existing.tier = tier.name
        existing.tierBadge = tier.badge
        existing.tierColor = tier.color
      }
    }

    // Execute background doc healing non-blocking
    if (healPromises.length > 0) {
      Promise.all(healPromises).catch(() => {})
    }

    let rows = Array.from(merged.values())

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
