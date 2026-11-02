// lib/loyalty.js
// ─────────────────────────────────────────────────────────────────────────────
// Badshah Online VIP Club (Dedicated Website Loyalty Engine)
// ─────────────────────────────────────────────────────────────────────────────
// Isolated loyalty points and rewards engine exclusively for the website
// (badshah-web). Does NOT share or conflict with the dine-in QR ordering system.
//
// Dedicated Collections:
// - web_loyalty_accounts
// - web_loyalty_transactions
// - web_rewards
// - web_redemptions
// - settings/web_loyalty
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchFirestoreDoc,
  setFirestoreDoc,
  patchFirestoreDoc,
  queryFirestoreCollection,
  deleteFirestoreDoc,
  fsWhere,
  fsOrderBy,
} from './firestoreServer'

// Dedicated website container and document ID helpers (uses permitted 'config' & 'settings')
export const FS_WEB_LOYALTY_CONTAINER = 'config'
export const FS_WEB_LOYALTY_SETTINGS = 'settings'
export const FS_WEB_LOYALTY_CONFIG_DOC = 'web_loyalty'

export const accountDocId = (id) => `wla_${String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')}`
export const txDocId = (id) => `wlt_${String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')}`
export const rewardDocId = (id) => `wlr_${String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')}`
export const redemptionDocId = (id) => `wld_${String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')}`

export const FS_WEB_LOYALTY_ACCOUNTS = FS_WEB_LOYALTY_CONTAINER
export const FS_WEB_LOYALTY_TRANSACTIONS = FS_WEB_LOYALTY_CONTAINER
export const FS_WEB_REWARDS = FS_WEB_LOYALTY_CONTAINER
export const FS_WEB_REDEMPTIONS = FS_WEB_LOYALTY_CONTAINER

// ── Phone Normalization ──────────────────────────────────────────────────────
export function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  let d = digits
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 13 && d.startsWith('091')) d = d.slice(3)
  if (!/^[6-9]\d{9}$/.test(d)) return null
  return d
}

// ── Default Config ───────────────────────────────────────────────────────────
export const DEFAULT_LOYALTY_CONFIG = {
  enabled: true,
  pointsPerOrder: 20,
  minOrder: 0, // In Rupees (e.g. 0 means all orders qualify)
  expiryEnabled: false,
  expiryDays: 365,
  maxRedemptionsPerOrder: 1,
  refundPolicy: 'REVERSE', // 'REVERSE' or 'KEEP'
  programName: 'Badshah Online VIP Club',
  updatedAt: new Date().toISOString(),
}

// ── Cache layer for config, rewards & accounts to minimize read latency ───────
let _configCache = null
let _configCacheExp = 0
let _rewardsCache = null
let _rewardsCacheExp = 0
const _accountCache = new Map() // id -> { data, exp }

export function invalidateLoyaltyCache() {
  _configCache = null
  _configCacheExp = 0
  _rewardsCache = null
  _rewardsCacheExp = 0
  _accountCache.clear()
}

export function invalidateAccountCache(id) {
  if (id) {
    const clean = String(id).trim()
    _accountCache.delete(clean)
    _accountCache.delete(accountDocId(clean))
  } else {
    _accountCache.clear()
  }
}

// ── Configuration ────────────────────────────────────────────────────────────
export async function getLoyaltyConfig() {
  if (_configCache && _configCacheExp > Date.now()) {
    return _configCache
  }
  try {
    const doc = await fetchFirestoreDoc(FS_WEB_LOYALTY_SETTINGS, FS_WEB_LOYALTY_CONFIG_DOC)
    const config = {
      ...DEFAULT_LOYALTY_CONFIG,
      ...(doc || {}),
    }
    _configCache = config
    _configCacheExp = Date.now() + 60_000 // 1 minute
    return config
  } catch (err) {
    console.warn('getLoyaltyConfig fallback notice:', err.message)
    return DEFAULT_LOYALTY_CONFIG
  }
}

export async function saveLoyaltyConfig(updates) {
  const current = await getLoyaltyConfig()
  const merged = {
    ...current,
    ...updates,
    pointsPerOrder: Math.max(0, Number(updates.pointsPerOrder ?? current.pointsPerOrder)),
    minOrder: Math.max(0, Number(updates.minOrder ?? current.minOrder)),
    expiryDays: Math.max(1, Number(updates.expiryDays ?? current.expiryDays)),
    maxRedemptionsPerOrder: Math.max(1, Number(updates.maxRedemptionsPerOrder ?? current.maxRedemptionsPerOrder)),
    refundPolicy: updates.refundPolicy === 'KEEP' ? 'KEEP' : 'REVERSE',
    updatedAt: new Date().toISOString(),
  }
  await setFirestoreDoc(FS_WEB_LOYALTY_SETTINGS, FS_WEB_LOYALTY_CONFIG_DOC, merged)
  invalidateLoyaltyCache()
  return merged
}

// ── Tier Calculation ─────────────────────────────────────────────────────────
export function computeTier(earnedTotal = 0) {
  if (earnedTotal >= 600) {
    return { name: 'Badshah Imperial Crown', badge: '👑', color: '#D4AF37', minPoints: 600, nextTier: null, pointsNeeded: 0 }
  }
  if (earnedTotal >= 300) {
    return { name: 'Royal Gold Member', badge: '🥇', color: '#E5A93B', minPoints: 300, nextTier: 'Badshah Imperial Crown', pointsNeeded: 600 - earnedTotal }
  }
  if (earnedTotal >= 100) {
    return { name: 'Royal Silver Diner', badge: '🥈', color: '#B0BEC5', minPoints: 100, nextTier: 'Royal Gold Member', pointsNeeded: 300 - earnedTotal }
  }
  return { name: 'Royal Bronze Guest', badge: '🥉', color: '#CD7F32', minPoints: 0, nextTier: 'Royal Silver Diner', pointsNeeded: 100 - earnedTotal }
}

// ── FIFO Bucket Sweeper ───────────────────────────────────────────────────────
function sweepExpiredBuckets(account, now = new Date()) {
  const buckets = Array.isArray(account.buckets) ? [...account.buckets] : []
  let expiredPoints = 0
  const activeBuckets = []

  for (const b of buckets) {
    const isExpired = b.remaining > 0 && b.expiresAt && new Date(b.expiresAt).getTime() <= now.getTime()
    if (isExpired) {
      expiredPoints += b.remaining
    } else {
      activeBuckets.push(b)
    }
  }

  const newAvailable = Math.max(0, (account.availablePoints || 0) - expiredPoints)
  const newExpiredTotal = (account.expiredTotal || 0) + expiredPoints

  return {
    accountData: {
      ...account,
      availablePoints: newAvailable,
      expiredTotal: newExpiredTotal,
      buckets: activeBuckets,
    },
    expiredPoints,
  }
}

function consumeFifo(buckets = [], amount = 0) {
  let remaining = amount
  const copy = buckets.map(b => ({ ...b }))

  // Sort by expiry (soonest first, never-expiring last) then earnedAt
  copy.sort((a, b) => {
    const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER
    const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER
    if (aExp !== bExp) return aExp - bExp
    return String(a.earnedAt || '').localeCompare(String(b.earnedAt || ''))
  })

  for (const b of copy) {
    if (remaining <= 0) break
    if (!b.remaining || b.remaining <= 0) continue
    const take = Math.min(b.remaining, remaining)
    b.remaining -= take
    remaining -= take
  }

  return copy
}

// ── Loyalty Account Resolution ───────────────────────────────────────────────
// ── Loyalty Account Resolution ───────────────────────────────────────────────
export async function getLoyaltyAccount(identifier, userMeta = {}) {
  if (!identifier) return null
  const cleanId = String(identifier).trim()
  const cached = _accountCache.get(cleanId)
  if (cached && cached.exp > Date.now()) {
    return cached.data
  }
  try {
    let doc = await fetchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, cleanId)
    if (!doc && !cleanId.startsWith('wla_')) {
      doc = await fetchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, accountDocId(cleanId))
    }
    if (doc && (doc.availablePoints > 0 || doc.earnedTotal > 0)) {
      _accountCache.set(cleanId, { data: doc, exp: Date.now() + 15_000 })
      return doc
    }

    // ── Unified Identity Resolution Across Phone, Email, & UID ───────────
    const normPhone = normalizePhone(cleanId) || normalizePhone(userMeta.phone)
    let discoveredPhone = normPhone
    let discoveredEmail = (userMeta.email || (cleanId.includes('@') ? cleanId : '')).toLowerCase().trim()
    let discoveredName = userMeta.name || ''

    // If identifier is a Firebase UID, inspect users/{uid}
    if (!discoveredPhone && !cleanId.includes('@') && !/^\d{10}$/.test(cleanId)) {
      try {
        const userDoc = await fetchFirestoreDoc('users', cleanId)
        if (userDoc) {
          if (userDoc.phone) discoveredPhone = normalizePhone(userDoc.phone)
          if (userDoc.email && !discoveredEmail) discoveredEmail = userDoc.email.toLowerCase().trim()
          if (userDoc.name && !discoveredName) discoveredName = userDoc.name || userDoc.displayName
        }
      } catch (_) {}
    }

    // If discoveredPhone is known and differs from cleanId, check phone account
    if (discoveredPhone && discoveredPhone !== cleanId) {
      const phoneDoc = await fetchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, discoveredPhone) ||
                       await fetchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, accountDocId(discoveredPhone))
      if (phoneDoc && (phoneDoc.availablePoints > 0 || phoneDoc.earnedTotal > 0)) {
        const synced = {
          ...phoneDoc,
          customerId: cleanId,
          linkedPhone: discoveredPhone,
          updatedAt: new Date().toISOString(),
        }
        await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, cleanId, {
          availablePoints: phoneDoc.availablePoints,
          earnedTotal: phoneDoc.earnedTotal,
          redeemedTotal: phoneDoc.redeemedTotal || 0,
          expiredTotal: phoneDoc.expiredTotal || 0,
          buckets: phoneDoc.buckets || [],
          phone: discoveredPhone,
          email: phoneDoc.email || discoveredEmail,
          linkedPhone: discoveredPhone,
          updatedAt: new Date().toISOString(),
        }).catch(() => {})
        _accountCache.set(cleanId, { data: synced, exp: Date.now() + 15_000 })
        return synced
      }
    }

    // If email is known, look up matching accounts in config collection
    if (discoveredEmail) {
      try {
        const emailMatches = await queryFirestoreCollection({
          collectionId: FS_WEB_LOYALTY_ACCOUNTS,
          where: fsWhere('email', '==', discoveredEmail),
          limit: 10,
        })
        const matched = (emailMatches || []).find(a => 
          a && 
          (a.availablePoints > 0 || a.earnedTotal > 0) &&
          (a._docId !== cleanId && a.customerId !== cleanId)
        )
        if (matched) {
          const matchedPhone = normalizePhone(matched.phone || matched.customerId)
          if (matchedPhone && !cleanId.includes('@')) {
            patchFirestoreDoc('users', cleanId, { phone: matchedPhone }).catch(() => {})
          }
          const synced = {
            ...matched,
            customerId: cleanId,
            linkedPhone: matchedPhone || null,
            updatedAt: new Date().toISOString(),
          }
          await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, cleanId, {
            availablePoints: matched.availablePoints,
            earnedTotal: matched.earnedTotal,
            redeemedTotal: matched.redeemedTotal || 0,
            expiredTotal: matched.expiredTotal || 0,
            buckets: matched.buckets || [],
            phone: matchedPhone || matched.phone || '',
            email: discoveredEmail,
            linkedPhone: matchedPhone || null,
            updatedAt: new Date().toISOString(),
          }).catch(() => {})
          _accountCache.set(cleanId, { data: synced, exp: Date.now() + 15_000 })
          return synced
        }
      } catch (_) {}
    }

    if (!doc) return null
    _accountCache.set(cleanId, { data: doc, exp: Date.now() + 15_000 })
    return doc
  } catch (err) {
    console.warn('getLoyaltyAccount error:', err.message)
    return null
  }
}

export async function ensureLoyaltyAccount(identifier, userMeta = {}) {
  if (!identifier) return null
  const cleanId = String(identifier).trim()
  const existing = await getLoyaltyAccount(cleanId, userMeta)
  const now = new Date().toISOString()

  if (existing) {
    // Lazily sweep expired buckets if applicable
    const sweep = sweepExpiredBuckets(existing)
    if (sweep.expiredPoints > 0) {
      sweep.accountData.updatedAt = now
      await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, cleanId, {
        availablePoints: sweep.accountData.availablePoints,
        expiredTotal: sweep.accountData.expiredTotal,
        buckets: sweep.accountData.buckets,
        updatedAt: now,
      })
      invalidateAccountCache(cleanId)
      // Write ledger record for expiration
      const txId = `tx-exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      await setFirestoreDoc(FS_WEB_LOYALTY_TRANSACTIONS, txId, {
        id: txId,
        customerId: cleanId,
        type: 'EXPIRE',
        points: sweep.expiredPoints,
        delta: -sweep.expiredPoints,
        reason: `${sweep.expiredPoints} points reached their expiration date`,
        createdAt: now,
      })
      return sweep.accountData
    }
    return existing
  }

  // Create brand new account
  const newAccount = {
    docType: 'web_loyalty_account',
    customerId: cleanId,
    phone: userMeta.phone || (normalizePhone(cleanId) || ''),
    email: userMeta.email || '',
    name: userMeta.name || userMeta.displayName || 'VIP Diner',
    availablePoints: 0,
    earnedTotal: 0,
    redeemedTotal: 0,
    expiredTotal: 0,
    reversedTotal: 0,
    adjustedTotal: 0,
    buckets: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  await setFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, cleanId, newAccount)
  invalidateAccountCache(cleanId)
  return newAccount
}

// ── Award Points on Order Delivery / Fulfillment ─────────────────────────────
export async function awardOrderPoints(order) {
  if (!order) return { awarded: 0, reason: 'Invalid order' }
  const phone = normalizePhone(order.customerPhone || order.userPhone)
  const customerId = phone || order.userId || order.userEmail
  if (!customerId) return { awarded: 0, reason: 'No customer identifier' }

  const cfg = await getLoyaltyConfig()
  if (!cfg.enabled || cfg.pointsPerOrder <= 0) {
    return { awarded: 0, reason: 'Loyalty program disabled' }
  }

  if (order.loyaltyAwarded) {
    return { awarded: 0, reason: 'Points already awarded' }
  }

  const subtotal = Number(order.subtotal || order.grandTotal || 0)
  if (subtotal < cfg.minOrder) {
    return { awarded: 0, reason: `Order below min required ₹${cfg.minOrder}` }
  }

  const account = await ensureLoyaltyAccount(customerId, {
    phone: phone || '',
    email: order.userEmail || order.customerEmail || '',
    name: order.userName || order.customerName || 'VIP Diner',
  })

  if (account.status === 'suspended') {
    return { awarded: 0, reason: 'Account suspended' }
  }

  const points = cfg.pointsPerOrder
  const now = new Date()
  const nowIso = now.toISOString()

  let expiresAt = null
  if (cfg.expiryEnabled && cfg.expiryDays > 0) {
    expiresAt = new Date(now.getTime() + cfg.expiryDays * 86400_000).toISOString()
  }

  const newBucket = {
    id: `b_${now.getTime()}_${Math.floor(Math.random() * 1000)}`,
    points,
    remaining: points,
    earnedAt: nowIso,
    expiresAt,
    origin: order.orderId || 'Website Order',
  }

  const updatedAccount = {
    availablePoints: (account.availablePoints || 0) + points,
    earnedTotal: (account.earnedTotal || 0) + points,
    buckets: [...(account.buckets || []), newBucket],
    updatedAt: nowIso,
  }

  await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, customerId, updatedAccount)
  invalidateAccountCache(customerId)

  // Also sync points and linked mobile to order.userId if different
  if (order.userId && order.userId !== customerId) {
    await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, order.userId, {
      availablePoints: updatedAccount.availablePoints,
      earnedTotal: updatedAccount.earnedTotal,
      redeemedTotal: updatedAccount.redeemedTotal || 0,
      expiredTotal: updatedAccount.expiredTotal || 0,
      buckets: updatedAccount.buckets,
      phone: phone || '',
      email: order.userEmail || order.customerEmail || '',
      linkedPhone: phone || null,
      customerId: order.userId,
      updatedAt: nowIso,
    }).catch(() => {})
    invalidateAccountCache(order.userId)
  }

  // Write ledger entry
  const txId = `tx-earn-${order.orderId || Date.now()}`
  await setFirestoreDoc(FS_WEB_LOYALTY_TRANSACTIONS, txId, {
    id: txId,
    customerId,
    userId: order.userId || null,
    type: 'EARN',
    points,
    delta: points,
    orderId: order.orderId || order.id || null,
    reason: `Order #${order.orderId} • +${points} Badshah VIP Points`,
    expiresAt,
    createdAt: nowIso,
  })

  // Mark order as awarded
  if (order.orderId) {
    await patchFirestoreDoc('orders', order.orderId, {
      loyaltyAwarded: true,
      loyaltyPointsEarned: points,
      updatedAt: nowIso,
    }).catch(() => {})
  }

  return { awarded: points, customerId, newBalance: updatedAccount.availablePoints }
}

// ── Reverse Points on Order Cancellation ─────────────────────────────────────
export async function reverseOrderPoints(order, reason = 'Order cancelled') {
  if (!order || !order.loyaltyAwarded) return { reversed: 0 }
  const phone = normalizePhone(order.customerPhone || order.userPhone)
  const customerId = phone || order.userId || order.userEmail
  if (!customerId) return { reversed: 0 }

  const cfg = await getLoyaltyConfig()
  if (cfg.refundPolicy !== 'REVERSE') {
    return { reversed: 0, reason: 'Policy is KEEP' }
  }

  const pointsToReverse = Number(order.loyaltyPointsEarned || cfg.pointsPerOrder || 0)
  if (pointsToReverse <= 0) return { reversed: 0 }

  const account = await getLoyaltyAccount(customerId)
  if (!account) return { reversed: 0 }

  const nowIso = new Date().toISOString()
  const newAvailable = Math.max(0, (account.availablePoints || 0) - pointsToReverse)
  const newReversed = (account.reversedTotal || 0) + pointsToReverse

  // Adjust buckets in reverse
  const sortedBuckets = (account.buckets || []).map(b => ({ ...b })).reverse()
  let toDeduct = pointsToReverse
  for (const b of sortedBuckets) {
    if (toDeduct <= 0) break
    const take = Math.min(b.remaining || 0, toDeduct)
    b.remaining = (b.remaining || 0) - take
    toDeduct -= take
  }

  await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, customerId, {
    availablePoints: newAvailable,
    reversedTotal: newReversed,
    buckets: sortedBuckets.reverse(),
    updatedAt: nowIso,
  })
  invalidateAccountCache(customerId)

  const txId = `tx-rev-${order.orderId || Date.now()}`
  await setFirestoreDoc(FS_WEB_LOYALTY_TRANSACTIONS, txId, {
    id: txId,
    customerId,
    type: 'REVERSE',
    points: pointsToReverse,
    delta: -pointsToReverse,
    orderId: order.orderId || null,
    reason: `${reason} • Reversed ${pointsToReverse} points`,
    createdAt: nowIso,
  })

  await patchFirestoreDoc('orders', order.orderId, {
    loyaltyAwarded: false,
    loyaltyPointsEarned: 0,
    updatedAt: nowIso,
  }).catch(() => {})

  return { reversed: pointsToReverse, newBalance: newAvailable }
}

// ── Manual Admin Points Adjustment ───────────────────────────────────────────
export async function adjustPoints(customerId, delta, reason, adminActor = 'Admin') {
  if (!customerId || !delta || delta === 0) {
    throw new Error('Customer ID and non-zero point delta are required')
  }
  if (!reason || reason.trim().length < 3) {
    throw new Error('A detailed reason (min 3 chars) is mandatory for point adjustment')
  }

  const account = await ensureLoyaltyAccount(customerId)
  const now = new Date()
  const nowIso = now.toISOString()
  const points = Math.abs(delta)

  let newAvailable = account.availablePoints || 0
  let updatedBuckets = [...(account.buckets || [])]

  if (delta > 0) {
    newAvailable += points
    updatedBuckets.push({
      id: `b_adj_${now.getTime()}_${Math.floor(Math.random() * 1000)}`,
      points,
      remaining: points,
      earnedAt: nowIso,
      expiresAt: null,
      origin: `Admin Adjustment (${adminActor})`,
    })
  } else {
    newAvailable = Math.max(0, newAvailable - points)
    updatedBuckets = consumeFifo(updatedBuckets, points)
  }

  const updatedAccount = {
    availablePoints: newAvailable,
    adjustedTotal: (account.adjustedTotal || 0) + delta,
    buckets: updatedBuckets,
    updatedAt: nowIso,
  }

  await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, customerId, updatedAccount)
  invalidateAccountCache(customerId)

  const txId = `tx-adj-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  await setFirestoreDoc(FS_WEB_LOYALTY_TRANSACTIONS, txId, {
    id: txId,
    customerId,
    type: 'ADJUST',
    points,
    delta,
    reason,
    adminActor,
    createdAt: nowIso,
  })

  return { customerId, delta, newBalance: newAvailable }
}

// ── Default Rewards Catalog Seed ─────────────────────────────────────────────
export const DEFAULT_REWARDS = [
  {
    id: 'reward-50-off',
    name: '₹50 Royal Privilege Off',
    description: 'Instant ₹50 deduction on your Dum Pukht meal',
    type: 'FIXED_DISCOUNT',
    pointsCost: 100,
    discountValue: 50,
    minOrder: 249,
    active: true,
    stock: null,
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&q=80',
  },
  {
    id: 'reward-gulab-jamun',
    name: 'Complimentary Shahi Gulab Jamun (2 pcs)',
    description: 'Fresh warm khoya gulab jamun dipped in saffron sugar syrup',
    type: 'FREE_ITEM',
    pointsCost: 120,
    discountValue: 80,
    minOrder: 299,
    active: true,
    stock: null,
    imageUrl: 'https://images.unsplash.com/photo-1605197586548-a006f157fdc9?w=300&q=80',
  },
  {
    id: 'reward-15-pct',
    name: '15% Badshah Banquet Discount',
    description: 'Save 15% on orders above ₹499 (Max discount ₹150)',
    type: 'PERCENT_DISCOUNT',
    pointsCost: 180,
    discountValue: 15, // 15%
    discountMax: 150, // max ₹150
    minOrder: 499,
    active: true,
    stock: null,
    imageUrl: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=300&q=80',
  },
  {
    id: 'reward-free-biryani',
    name: 'Free Handi Dum Biryani (Chicken)',
    description: 'Full handcrafted clay handi royal chicken dum pukht biryani',
    type: 'FREE_ITEM',
    pointsCost: 350,
    discountValue: 240,
    minOrder: 599,
    active: true,
    stock: null,
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&q=80',
  },
]

// ── Rewards Catalog ──────────────────────────────────────────────────────────
export async function listRewards(onlyActive = false) {
  if (_rewardsCache && _rewardsCacheExp > Date.now()) {
    return onlyActive
      ? _rewardsCache.filter(r => r.active && (r.stock === null || r.stock > 0))
      : _rewardsCache
  }
  try {
    let docs = await queryFirestoreCollection({
      collectionId: FS_WEB_REWARDS,
      limit: 100,
    })

    const rawDocs = docs || []
    const rewardDocs = rawDocs.filter(d => 
      d && !d.customerId && d.availablePoints === undefined && (d.pointsCost !== undefined || d.type || d.docType === 'web_reward')
    )

    let finalDocs = [...rewardDocs]
    // Ensure all default rewards exist in catalog and heal incomplete/corrupt seeds
    for (const r of DEFAULT_REWARDS) {
      const docId = rewardDocId(r.id)
      const existing = finalDocs.find(d => 
        (d._docId || d.id) === docId || 
        (d.id || d._docId) === r.id ||
        (d.name && d.name.toLowerCase().includes(r.name.toLowerCase().slice(0, 10)))
      )
      if (!existing) {
        await setFirestoreDoc(FS_WEB_REWARDS, docId, {
          ...r,
          id: docId,
          docType: 'web_reward',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {})
        finalDocs.push({ ...r, id: docId, _docId: docId })
      } else if (existing.discountValue <= 0 || existing.type !== r.type || !existing.minOrder || !existing.description) {
        // Heal corrupt or incomplete seed record in Firestore
        const healed = {
          ...r,
          ...existing,
          discountValue: r.discountValue,
          type: r.type,
          minOrder: r.minOrder || existing.minOrder || 0,
          description: existing.description || r.description,
          updatedAt: new Date().toISOString(),
        }
        await setFirestoreDoc(FS_WEB_REWARDS, existing._docId || docId, {
          ...healed,
          id: existing._docId || docId,
          docType: 'web_reward',
        }).catch(() => {})
        Object.assign(existing, healed)
      }
    }

    const formatted = finalDocs.map(d => ({
      ...d,
      id: d._docId || d.id,
      name: d.name || 'VIP Delicacy',
      type: d.type || 'FREE_ITEM',
      pointsCost: Number(d.pointsCost || 100),
      discountValue: Number(d.discountValue || 0),
      discountMax: Number(d.discountMax || 0),
      minOrder: Number(d.minOrder || 0),
      active: d.active !== false,
      stock: d.stock !== undefined && d.stock !== null ? Number(d.stock) : null,
    }))

    _rewardsCache = formatted
    _rewardsCacheExp = Date.now() + 60_000

    if (onlyActive) {
      return formatted.filter(r => r.active && (r.stock === null || r.stock > 0))
    }
    return formatted
  } catch (err) {
    console.warn('listRewards fallback notice:', err.message)
    return DEFAULT_REWARDS
  }
}

export function computeRewardDiscount(reward, subtotal = 0) {
  if (!reward) return 0
  const sub = Number(subtotal) || 0
  if (reward.type === 'FIXED_DISCOUNT' || reward.type === 'FREE_ITEM') {
    return Math.min(reward.discountValue || 0, sub)
  }
  if (reward.type === 'PERCENT_DISCOUNT') {
    const raw = Math.round((sub * (reward.discountValue || 0)) / 100)
    const capped = reward.discountMax > 0 ? Math.min(raw, reward.discountMax) : raw
    return Math.min(capped, sub)
  }
  return 0
}

export function getRewardEligibility(reward, customerPoints = 0, subtotal = 0) {
  if (!reward || !reward.active) return { eligible: false, code: 'INACTIVE', message: 'Reward is inactive' }
  if (reward.stock !== null && reward.stock <= 0) return { eligible: false, code: 'OUT_OF_STOCK', message: 'Reward out of stock' }
  if (subtotal < (reward.minOrder || 0)) return { eligible: false, code: 'MIN_ORDER', message: `Requires min order of ₹${reward.minOrder}` }
  if (customerPoints < reward.pointsCost) {
    return { eligible: false, code: 'NOT_ENOUGH_POINTS', message: `Need ${reward.pointsCost - customerPoints} more points` }
  }
  return { eligible: true, code: 'OK', message: 'Available to redeem' }
}

export async function upsertReward(rewardData) {
  const id = rewardData.id || `reward-${Date.now()}`
  const now = new Date().toISOString()
  const payload = {
    ...rewardData,
    id,
    pointsCost: Math.max(1, Number(rewardData.pointsCost || 100)),
    discountValue: Math.max(0, Number(rewardData.discountValue || 0)),
    discountMax: Math.max(0, Number(rewardData.discountMax || 0)),
    minOrder: Math.max(0, Number(rewardData.minOrder || 0)),
    active: rewardData.active !== false,
    stock: rewardData.stock != null ? Math.max(0, Number(rewardData.stock)) : null,
    updatedAt: now,
  }
  if (!rewardData.createdAt) payload.createdAt = now

  await setFirestoreDoc(FS_WEB_REWARDS, id, payload)
  invalidateLoyaltyCache()
  return payload
}

export async function deleteReward(rewardId) {
  await deleteFirestoreDoc(FS_WEB_REWARDS, rewardId)
  invalidateLoyaltyCache()
  return true
}

// ── Redemptions ──────────────────────────────────────────────────────────────
export async function applyRewardRedemption({ customerId, rewardId, subtotal, orderId = null }) {
  const account = await getLoyaltyAccount(customerId)
  if (!account) throw new Error('Loyalty account not found')

  const rewards = await listRewards()
  const reward = rewards.find(r => r.id === rewardId)
  if (!reward) throw new Error('Reward not found')

  const eligibility = getRewardEligibility(reward, account.availablePoints || 0, subtotal)
  if (!eligibility.eligible) throw new Error(eligibility.message)

  const discount = computeRewardDiscount(reward, subtotal)
  const now = new Date()
  const nowIso = now.toISOString()
  const pointsCost = reward.pointsCost

  // Consume points FIFO
  const updatedBuckets = consumeFifo(account.buckets || [], pointsCost)
  const newAvailable = Math.max(0, (account.availablePoints || 0) - pointsCost)
  const newRedeemed = (account.redeemedTotal || 0) + pointsCost

  await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, customerId, {
    availablePoints: newAvailable,
    redeemedTotal: newRedeemed,
    buckets: updatedBuckets,
    updatedAt: nowIso,
  })
  invalidateAccountCache(customerId)

  // Decrement stock if applicable
  if (reward.stock !== null && reward.stock > 0) {
    await patchFirestoreDoc(FS_WEB_REWARDS, reward.id, {
      stock: reward.stock - 1,
      updatedAt: nowIso,
    })
    invalidateLoyaltyCache()
  }

  // Create redemption record
  const redemptionId = `red-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const redemptionDoc = {
    id: redemptionId,
    customerId,
    customerPhone: account.phone || customerId,
    customerName: account.name || 'VIP Diner',
    rewardId: reward.id,
    rewardName: reward.name,
    pointsUsed: pointsCost,
    discountAmount: discount,
    orderId: orderId || null,
    status: 'APPLIED',
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  await setFirestoreDoc(FS_WEB_REDEMPTIONS, redemptionId, redemptionDoc)

  // Write REDEEM transaction
  const txId = `tx-red-${redemptionId}`
  await setFirestoreDoc(FS_WEB_LOYALTY_TRANSACTIONS, txId, {
    id: txId,
    customerId,
    type: 'REDEEM',
    points: pointsCost,
    delta: -pointsCost,
    orderId,
    rewardId: reward.id,
    redemptionId,
    reason: `Redeemed "${reward.name}" (-₹${discount})`,
    createdAt: nowIso,
  })

  return {
    redemptionId,
    reward,
    pointsUsed: pointsCost,
    discountAmount: discount,
    newBalance: newAvailable,
  }
}

export async function cancelRedemption(redemptionId, reason = 'Order cancelled') {
  const redemption = await fetchFirestoreDoc(FS_WEB_REDEMPTIONS, redemptionId)
  if (!redemption || redemption.status === 'CANCELLED') return { cancelled: false }

  const customerId = redemption.customerId
  const pointsToRestore = redemption.pointsUsed || 0
  const nowIso = new Date().toISOString()

  // Restore points to customer
  const account = await getLoyaltyAccount(customerId)
  if (account) {
    const updatedBuckets = [...(account.buckets || []), {
      id: `b_res_${Date.now()}`,
      points: pointsToRestore,
      remaining: pointsToRestore,
      earnedAt: nowIso,
      expiresAt: null,
      origin: `Restored redemption: ${redemption.rewardName}`,
    }]
    await patchFirestoreDoc(FS_WEB_LOYALTY_ACCOUNTS, customerId, {
      availablePoints: (account.availablePoints || 0) + pointsToRestore,
      redeemedTotal: Math.max(0, (account.redeemedTotal || 0) - pointsToRestore),
      buckets: updatedBuckets,
      updatedAt: nowIso,
    })
    invalidateAccountCache(customerId)

    // Write RESTORE transaction
    const txId = `tx-restore-${redemptionId}`
    await setFirestoreDoc(FS_WEB_LOYALTY_TRANSACTIONS, txId, {
      id: txId,
      customerId,
      type: 'RESTORE',
      points: pointsToRestore,
      delta: pointsToRestore,
      redemptionId,
      reason: `${reason} • Restored ${pointsToRestore} points from ${redemption.rewardName}`,
      createdAt: nowIso,
    })
  }

  // Restore stock if needed
  if (redemption.rewardId) {
    const rDoc = await fetchFirestoreDoc(FS_WEB_REWARDS, redemption.rewardId)
    if (rDoc && rDoc.stock !== null && rDoc.stock !== undefined) {
      await patchFirestoreDoc(FS_WEB_REWARDS, redemption.rewardId, {
        stock: rDoc.stock + 1,
        updatedAt: nowIso,
      })
      invalidateLoyaltyCache()
    }
  }

  await patchFirestoreDoc(FS_WEB_REDEMPTIONS, redemptionId, {
    status: 'CANCELLED',
    refundNote: reason,
    updatedAt: nowIso,
  })

  return { cancelled: true, restoredPoints: pointsToRestore }
}

export async function fulfillRedemption(redemptionId, orderId) {
  if (!redemptionId) return
  const nowIso = new Date().toISOString()
  await patchFirestoreDoc(FS_WEB_REDEMPTIONS, redemptionId, {
    status: 'FULFILLED',
    orderId: orderId || null,
    updatedAt: nowIso,
  }).catch(() => {})
}

// ── Retroactive Direct Claim by Diner ─────────────────────────────────────────
export async function claimPointsForOrder(orderId, customerPhone) {
  if (!orderId) throw new Error('Order ID is required')
  const cleanId = String(orderId).replace(/^#/, '').trim()
  const order = await fetchFirestoreDoc('orders', cleanId)
  if (!order) throw new Error('Order not found')

  const normOrderPhone = normalizePhone(order.customerPhone || order.userPhone)
  const normClaimPhone = normalizePhone(customerPhone)
  if (!normOrderPhone || !normClaimPhone || normOrderPhone !== normClaimPhone) {
    throw new Error('This order was placed under a different mobile number')
  }

  if (order.loyaltyAwarded) {
    return {
      alreadyAwarded: true,
      awarded: order.loyaltyPointsEarned || 20,
      message: 'Points have already been credited for this order',
    }
  }

  const status = String(order.orderStatus || order.status || '').toLowerCase()
  if (status === 'cancelled' || status === 'rejected') {
    throw new Error('Cancelled or rejected orders cannot earn loyalty points')
  }

  const result = await awardOrderPoints(order)
  return {
    alreadyAwarded: false,
    awarded: result.awarded,
    message: `Successfully credited +${result.awarded} Badshah VIP Points!`,
  }
}

// ── Customer Dashboard Snapshot ──────────────────────────────────────────────
export async function getCustomerLoyaltySnapshot(identifier, userMeta = {}) {
  if (!identifier) return null
  const account = await ensureLoyaltyAccount(identifier, userMeta)
  const tier = computeTier(account.earnedTotal || 0)

  // Fetch recent ledger transactions for active customer and linked accounts
  let transactions = []
  try {
    const activeIds = Array.from(new Set([
      account.customerId,
      account.phone,
      account.linkedPhone,
      identifier
    ].filter(Boolean)))

    const txPromises = activeIds.map(id =>
      queryFirestoreCollection({
        collectionId: FS_WEB_LOYALTY_TRANSACTIONS,
        where: fsWhere('customerId', '==', id),
        limit: 50,
      }).catch(() => [])
    )
    const allTxLists = await Promise.all(txPromises)
    const seen = new Set()
    transactions = allTxLists
      .flat()
      .filter(t => {
        if (!t || !t.type) return false
        const tid = t.id || t._docId
        if (seen.has(tid)) return false
        seen.add(tid)
        return true
      })
      .sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      )
  } catch (e) {}

  // Next expiring bucket
  const activeBuckets = (account.buckets || []).filter(
    b => b.remaining > 0 && b.expiresAt && new Date(b.expiresAt).getTime() > Date.now()
  )
  activeBuckets.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())
  const nextExpiry = activeBuckets[0]
    ? { points: activeBuckets[0].remaining, expiresAt: activeBuckets[0].expiresAt }
    : null

  return {
    customer: {
      customerId: account.customerId,
      name: account.name,
      phone: account.phone,
      email: account.email,
      tier: tier.name,
      tierBadge: tier.badge,
      tierColor: tier.color,
      nextTier: tier.nextTier,
      pointsNeededForNextTier: tier.pointsNeeded,
      status: account.status || 'active',
      memberSince: account.createdAt,
    },
    snapshot: {
      availablePoints: account.availablePoints || 0,
      earnedTotal: account.earnedTotal || 0,
      redeemedTotal: account.redeemedTotal || 0,
      expiredTotal: account.expiredTotal || 0,
      adjustedTotal: account.adjustedTotal || 0,
      nextExpiry,
    },
    transactions,
  }
}

// ── Admin Analytics ──────────────────────────────────────────────────────────
export async function getLoyaltyAnalytics() {
  try {
    const [accounts, redemptions, earnTxs] = await Promise.all([
      queryFirestoreCollection({ collectionId: FS_WEB_LOYALTY_ACCOUNTS, limit: 300 }),
      queryFirestoreCollection({ collectionId: FS_WEB_REDEMPTIONS, limit: 300 }),
      queryFirestoreCollection({
        collectionId: FS_WEB_LOYALTY_TRANSACTIONS,
        where: fsWhere('type', '==', 'EARN'),
        limit: 300,
      }),
    ])

    // Filter strictly for customer accounts
    const accList = (accounts || []).filter(a => {
      if (!a) return false
      const docId = String(a._docId || a.id || '')
      if (docId.startsWith('wlr_') || docId.startsWith('tx-') || docId.startsWith('red-') || docId === 'web_loyalty') return false
      if (a.docType === 'web_reward' || a.pointsCost !== undefined) return false
      return a.docType === 'web_loyalty_account' || a.availablePoints !== undefined || a.earnedTotal !== undefined || a.customerId
    })

    // Filter strictly for redemptions
    const redList = (redemptions || []).filter(r => {
      if (!r) return false
      const docId = String(r._docId || r.id || '')
      if (docId.startsWith('wlr_') || docId.startsWith('wla_') || docId.startsWith('tx-') || docId === 'web_loyalty') return false
      if (r.docType === 'web_reward' || r.pointsCost !== undefined) return false
      return r.pointsUsed !== undefined || docId.startsWith('red-') || r.rewardId
    })

    // Filter strictly for earn transactions
    const earnList = (earnTxs || []).filter(t => {
      if (!t) return false
      const docId = String(t._docId || t.id || '')
      return t.type === 'EARN' || docId.startsWith('tx-earn-')
    })

    const totalIssued = accList.reduce((s, a) => s + (Number(a.earnedTotal) || 0), 0)
    const totalRedeemed = accList.reduce((s, a) => s + (Number(a.redeemedTotal) || 0), 0)
    const totalExpired = accList.reduce((s, a) => s + (Number(a.expiredTotal) || 0), 0)
    const totalOutstanding = accList.reduce((s, a) => s + Math.max(0, Number(a.availablePoints) || 0), 0)

    const byStatus = {}
    for (const r of redList) {
      const st = r.status || 'APPLIED'
      byStatus[st] = (byStatus[st] || 0) + 1
    }

    // Top rewards
    const rewardAgg = new Map()
    for (const r of redList) {
      const key = r.rewardName || r.rewardId
      const cur = rewardAgg.get(key) || { name: key, count: 0, pointsSpent: 0 }
      cur.count += 1
      cur.pointsSpent += Number(r.pointsUsed || 0)
      rewardAgg.set(key, cur)
    }
    const popularRewards = [...rewardAgg.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Repeat diners
    const earnCounts = new Map()
    for (const t of earnList) {
      const cid = t.customerId
      if (cid) earnCounts.set(cid, (earnCounts.get(cid) || 0) + 1)
    }
    let repeatDiners = 0
    for (const count of earnCounts.values()) {
      if (count >= 2) repeatDiners += 1
    }

    return {
      enrolledMembers: accList.length,
      pointsIssued: totalIssued,
      pointsRedeemed: totalRedeemed,
      pointsExpired: totalExpired,
      pointsOutstanding: totalOutstanding,
      redemptionsTotal: redList.length,
      redemptionsOpen: byStatus['APPLIED'] || 0,
      redemptionsFulfilled: byStatus['FULFILLED'] || 0,
      repeatDiners,
      popularRewards,
      updatedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('getLoyaltyAnalytics error:', err.message)
    return {
      enrolledMembers: 0,
      pointsIssued: 0,
      pointsRedeemed: 0,
      pointsExpired: 0,
      pointsOutstanding: 0,
      redemptionsTotal: 0,
      redemptionsOpen: 0,
      redemptionsFulfilled: 0,
      repeatDiners: 0,
      popularRewards: [],
      updatedAt: new Date().toISOString(),
    }
  }
}
