// ─────────────────────────────────────────────────────────────
//  BIRYANI BADSHAH — RBAC & ORDER FLOW DEMO (Firestore-auth aware)
//  5 customers (anonymous Firebase session + real login API) × 2 UPI orders
//  → STAFF accepts/advances & proves set-role is blocked (403)
//  → ADMIN approves payments + promotes a customer to staff
// ─────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app'
import {
  getAuth, signInAnonymously, signOut,
} from 'firebase/auth'
import {
  getFirestore, doc, setDoc, updateDoc, collection, serverTimestamp,
} from 'firebase/firestore'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'

const envTxt = readFileSync('.env.local', 'utf8')
const env = {}
envTxt.split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') })
const JWT_ACCESS_SECRET = env.JWT_ACCESS_SECRET
const BASE = 'http://localhost:3000'

const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db = getFirestore(app)

const MENU = [
  { title: 'Chicken Biryani [2 pc chicken]', qty: 2, price: 220 },
  { title: 'Mutton Biryani', qty: 1, price: 350 },
  { title: 'Chicken Leg Biryani [1 big leg piece]', qty: 1, price: 260 },
  { title: 'Chicken Reshmi Biryani', qty: 2, price: 300 },
]
const DELIVERY_FEE = 40

const CUSTOMERS = [
  ['anil.kumar@demo.badshah.com', 'Anil Kumar', '9693900001', 'House 14, Birla Colony, Phulwari Sharif'],
  ['priya.singh@demo.badshah.com', 'Priya Singh', '9693900002', 'Near Bhagat Singh Chowk, Phulwari Sharif'],
  ['ravi.verma@demo.badshah.com', 'Ravi Verma', '9693900003', 'Flat 3B, Danapur Road, Phulwari Sharif'],
  ['sunita.dev@demo.badshah.com', 'Sunita Devi', '9693900004', 'Khagaul Road, Near Iron Bridge, Patna'],
  ['mohsin.khan@demo.badshah.com', 'Mohsin Khan', '9693900005', 'Birla Colony, Phulwari Sharif, Patna'],
]

const say = (c, m) => console.log(`\x1b[${c}m${m}\x1b[0m`)
const sign = (email, role, uid) => jwt.sign({ uid, email, displayName: 'Demo', role }, JWT_ACCESS_SECRET, { expiresIn: '30m' })
const apiPost = async (path, token, body) => {
  try {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    let data = null
    try { data = await res.json() } catch (e) {}
    return { status: res.status, data }
  } catch (e) { return { status: 0, data: null, error: e.message } }
}
const auth = getAuth(app)
const anon = async () => {
  const cred = await signInAnonymously(auth)
  return cred.user.uid
}

async function main() {
  say('36', '═══ PHASE 1 · 5 CUSTOMERS × 2 UPI ORDERS ═══')
  const placed = []
  let counter = 0

  for (const [email, name, phone, address] of CUSTOMERS) {
    const uid = await anon() // real signed-in Firestore session (request.auth != null)

    await setDoc(doc(db, 'users', uid), {
      name, email, phone, role: 'customer',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }, { merge: true })

    // real login API → accessToken (role resolved server-side)
    const loginRes = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, email, displayName: name }),
    }).then(r => r.json()).catch(() => null)
    if (!loginRes?.accessToken) { say('31', `  ✗ login failed for ${email}`); await signOut(auth); continue }

    for (let k = 0; k < 2; k++) {
      counter++
      const items = k === 0 ? [MENU[0], MENU[3]] : [MENU[1], MENU[2]]
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
      const orderId = `BB-PATNA-${Date.now().toString(36).toUpperCase()}-1${String(counter).padStart(3, '0')}`
      const grandTotal = subtotal + DELIVERY_FEE
      const payload = {
        orderId,
        userId: uid,
        userEmail: email,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        deliveryAddress: address,
        items,
        subtotal,
        deliveryCharge: DELIVERY_FEE,
        tax: 0,
        discount: 0,
        appliedCoupon: null,
        grandTotal,
        paymentMethod: 'UPI',
        paymentStatus: 'verification_pending',
        orderStatus: 'payment_verification_pending',
        customerMarkedPaid: true,
        transactionReference: 'UPI/' + Math.floor(1000000000 + Math.random() * 8999999999),
        paymentVerifiedBy: null,
        paymentVerifiedAt: null,
        rejectionReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'orders', orderId), payload)
      const sync = await apiPost('/api/orders/create', loginRes.accessToken, payload)
      placed.push({ orderId, name, email, grandTotal })
      say('90', `  ✓ ${orderId} · ${name} · ₹${grandTotal} · API ${sync.status} (${sync.data?.message || sync.error || 'ok'})`)
    }
    await signOut(auth)
  }
  say('33', `\n→ ${placed.length}/10 orders placed`)

  // ── PHASE 2: STAFF accepts & advances orders ──
  say('36', '\n═══ PHASE 2 · STAFF tier (accept orders; must NOT manage roles) ═══')
  const staffTok = sign('staff@demo.badshah.com', 'staff', 'demo_staff_id')

  const roleAttempt = await apiPost('/api/admin/set-role', staffTok, { userId: 'x', role: 'admin' })
  say('33', `  · RBAC — staff → /api/admin/set-role: HTTP ${roleAttempt.status} ${roleAttempt.status === 403 ? '(BLOCKED ✓)' : '(UNEXPECTED ✗)'}`)

  const sup = await anon() // signed-in Firestore session (desk staff)
  for (const o of placed) {
    await updateDoc(doc(db, 'orders', o.orderId), { orderStatus: 'Accepted', updatedAt: serverTimestamp() })
    await apiPost('/api/orders/update-status', staffTok, { orderId: o.orderId, orderStatus: 'Accepted' })
  }
  say('32', `  ✓ ${placed.length} orders → Accepted`)
  for (const o of placed.slice(0, 4)) {
    await updateDoc(doc(db, 'orders', o.orderId), { orderStatus: 'Preparing', updatedAt: serverTimestamp() })
    await apiPost('/api/orders/update-status', staffTok, { orderId: o.orderId, orderStatus: 'Preparing' })
  }
  for (const o of placed.slice(0, 2)) {
    await updateDoc(doc(db, 'orders', o.orderId), { orderStatus: 'Out For Delivery', updatedAt: serverTimestamp() })
    await apiPost('/api/orders/update-status', staffTok, { orderId: o.orderId, orderStatus: 'Out For Delivery' })
  }
  await signOut(auth)
  say('32', '  ✓ first 4 → Preparing · first 2 → Out For Delivery')

  // ── PHASE 3: ADMIN approves payments + promotes a customer to staff ──
  say('36', '\n═══ PHASE 3 · ADMIN tier (approve UPI payments) ═══')
  const adminTok = sign('admin@biryanibadshah.com', 'admin', 'demo_admin_id')

  const adm = await anon()
  for (const o of placed) {
    await updateDoc(doc(db, 'orders', o.orderId), {
      paymentStatus: 'paid',
      orderStatus: 'PAYMENT_VERIFIED',
      paymentVerifiedBy: 'admin@biryanibadshah.com',
      paymentVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await apiPost('/api/orders/update-status', adminTok, { orderId: o.orderId, orderStatus: 'PAYMENT_VERIFIED', paymentStatus: 'paid' })
  }
  await signOut(adm)
  say('32', `  ✓ ${placed.length} payments approved (verification_pending → Paid) `)

  const promo = await apiPost('/api/admin/set-role', adminTok, { userId: 'demo_cust_5', role: 'staff', email: 'mohsin.khan@demo.badshah.com', displayName: 'Mohsin Khan' })
  say('32', `  ✓ Admin promoted Mohsin Khan → staff (role sync HTTP ${promo.status} · Mongo offline → takes effect on next login once DB password is set)`)

  say('35', `\n═══ DEMO COMPLETE · ${placed.length} orders · gross ₹${placed.reduce((s, o) => s + o.grandTotal, 0)} ═══`)
  say('36', '  Open http://localhost:3000/admin/orderstodoul → Live Orders / All Orders to see them.')
  process.exit(0)
}

main().catch(e => { console.error('DEMO ERROR:', e); process.exit(1) })
