// lib/firestoreServer.js
// ─────────────────────────────────────────────────────────────────────────────
// All Firestore operations from API routes go through here.
// The client SDK running server-side has no Firebase auth context, so
// Firestore rules that require request.auth != null silently block every read
// and write. This module authenticates via the Identity Toolkit REST API and
// calls Firestore's REST endpoints directly with a valid ID token.
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY      = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const PROJECT_ID   = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const ADMIN_EMAIL  = process.env.FIREBASE_ADMIN_EMAIL
const ADMIN_PASS   = process.env.FIREBASE_ADMIN_PASSWORD

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

let _cached = null // { token, exp }

// ── Admin ID token (cached 55-minute window) ──────────────────────────────
async function getIdToken() {
  if (_cached && _cached.exp > Date.now() + 120_000) return _cached.token
  if (!API_KEY || !ADMIN_EMAIL || !ADMIN_PASS) return null
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS, returnSecureToken: true }),
      },
    )
    if (!res.ok) return null
    const json = await res.json()
    _cached = {
      token: json.idToken,
      exp:   Date.now() + (json.expiresIn ? Number(json.expiresIn) * 1000 : 3_600_000),
    }
    return _cached.token
  } catch (_) {
    return null
  }
}

// ── Value converters ──────────────────────────────────────────────────────
function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'boolean')          return { booleanValue: val }
  if (typeof val === 'number')           return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
  if (val instanceof Date)               return { timestampValue: val.toISOString() }
  if (typeof val === 'string') {
    // Detect ISO-8601 timestamps stored as strings and keep as string
    return { stringValue: val }
  }
  if (Array.isArray(val))   return { arrayValue: { values: val.map(toFsValue) } }
  if (typeof val === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(val).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toFsValue(v)])
        ),
      },
    }
  }
  return { stringValue: String(val) }
}

function fromFsValue(v) {
  if (!v || typeof v !== 'object') return undefined
  if ('stringValue'    in v) return v.stringValue
  if ('integerValue'   in v) return Number(v.integerValue)
  if ('doubleValue'    in v) return Number(v.doubleValue)
  if ('booleanValue'   in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('nullValue'      in v) return null
  if ('arrayValue'     in v) return (v.arrayValue.values || []).map(fromFsValue)
  if ('mapValue'       in v) return fromFsDoc({ fields: v.mapValue.fields || {} })
  return undefined
}

function fromFsDoc(restDoc) {
  const out = {}
  for (const [k, v] of Object.entries(restDoc.fields || {})) {
    out[k] = fromFsValue(v)
  }
  if (restDoc.name) out._docId = restDoc.name.split('/').pop()
  return out
}

// ── READ: single document ──────────────────────────────────────────────────
export async function fetchFirestoreDoc(collectionName, docId) {
  const token = await getIdToken()
  if (!token) return null
  const url = `${FS_BASE}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Firestore REST read failed (${res.status})`)
  return fromFsDoc(await res.json())
}

// ── WRITE: create/patch a document (merge-style field update) ─────────────
export async function patchFirestoreDoc(collectionName, docId, updateObj) {
  const token = await getIdToken()
  if (!token) return false

  const fields = {}
  for (const [k, v] of Object.entries(updateObj)) {
    if (v !== undefined) fields[k] = toFsValue(v)
  }
  const fieldPaths = Object.keys(fields)
  if (!fieldPaths.length) return true

  const maskParam = fieldPaths.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
  const url = `${FS_BASE}/${collectionName}/${encodeURIComponent(docId)}?${maskParam}`

  const res = await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Firestore REST patch failed (${res.status}): ${txt}`)
  }
  return true
}

// ── WRITE: set an entire document (full overwrite) ────────────────────────
export async function setFirestoreDoc(collectionName, docId, dataObj) {
  const token = await getIdToken()
  if (!token) return false

  const fields = {}
  for (const [k, v] of Object.entries(dataObj)) {
    if (v !== undefined) fields[k] = toFsValue(v)
  }

  const url = `${FS_BASE}/${collectionName}/${encodeURIComponent(docId)}`
  const res  = await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Firestore REST set failed (${res.status}): ${txt}`)
  }
  return true
}

// ── QUERY: run a structured collection query ──────────────────────────────
// Returns an array of plain JS objects (docId available as _docId).
//
// Supported options:
//   collectionId  – e.g. 'orders'
//   where         – Firestore REST StructuredQuery.where object
//   orderBy       – array of { field: { fieldPath }, direction: 'ASCENDING'|'DESCENDING' }
//   limit         – max number of docs
//   offset        – number of docs to skip
//
// Simple equality shorthand: { field, op, value } as JS plain types.
export async function queryFirestoreCollection({ collectionId, where, orderBy, limit, offset }) {
  const token = await getIdToken()
  if (!token) return []

  const structuredQuery = {
    from: [{ collectionId }],
  }
  if (where)   structuredQuery.where   = where
  if (orderBy) structuredQuery.orderBy = orderBy
  if (limit)   structuredQuery.limit   = limit
  if (offset)  structuredQuery.offset  = offset

  const url = `${FS_BASE}:runQuery`
  const res  = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ structuredQuery }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Firestore REST runQuery failed (${res.status}): ${txt}`)
  }

  const json = await res.json()
  // runQuery returns an array of { document?, readTime?, skippedResults? }
  return json.filter(r => r.document).map(r => fromFsDoc(r.document))
}

// ── Helper: build a simple equality WHERE clause ──────────────────────────
export function fsWhere(fieldPath, op, value) {
  const OP_MAP = {
    '==': 'EQUAL', '!=': 'NOT_EQUAL',
    '<':  'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL',
    '>':  'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL',
    'in': 'IN', 'array-contains': 'ARRAY_CONTAINS',
  }
  return {
    fieldFilter: {
      field: { fieldPath },
      op:    OP_MAP[op] || op,
      value: toFsValue(value),
    },
  }
}

export function fsOrderBy(fieldPath, direction = 'DESCENDING') {
  return [{ field: { fieldPath }, direction }]
}

// ── DELETE: remove a document via authenticated REST ──────────────────────
export async function deleteFirestoreDoc(collectionName, docId) {
  const token = await getIdToken()
  if (!token) return false
  const url = `${FS_BASE}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.ok
}
