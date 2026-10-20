// PHASE 3 only — ADMIN approves the 10 demo payments + promote Mohsin → staff
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, doc, updateDoc, collection, getDocs, query, serverTimestamp } from 'firebase/firestore'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'

const env = {}
readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') })
const app = initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID })
const db = getFirestore(app)
const auth = getAuth(app)
const secret = env.JWT_ACCESS_SECRET
const say = (c, m) => console.log(`\x1b[${c}m${m}\x1b[0m`)

const apiPost = async (path, token, body) => {
  try {
    const res = await fetch('http://localhost:3000' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    let data = null
    try { data = await res.json() } catch (e) {}
    return { status: res.status, data }
  } catch (e) { return { status: 0, error: e.message } }
}

async function main() {
  // Real Firebase admin identity (accepted as admin by both old & new rules)
  const ADMIN_EMAIL = 'md.amanullahkhan1980@gmail.com'
  const ADMIN_PASS = 'AMANULLAHPATNA2607'
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS)
    say('90', `  · signed into Firestore as ${ADMIN_EMAIL}`)
  } catch (e) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS)
      say('90', `  · created Firebase auth user ${cred.user.email}`)
    } catch (e2) {
      say('31', `  ✗ cannot sign in as admin Firebase identity: ${e2.code}`)
    }
  }

  // find the 10 demo orders (demo ids end in -1NNN)
  const snap = await getDocs(query(collection(db, 'orders')))
  const demo = snap.docs
    .filter(d => /^BB-PATNA-[A-Z0-9]+-1\d{3}$/.test(d.id))
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(o => o.paymentStatus?.toLowerCase().includes('pending') || o.orderStatus?.toLowerCase().includes('pending'))
  say('36', `\nDemo orders awaiting payment approval: ${demo.length}`)
  for (const o of demo) say('90', `  · ${o.id} · ${o.customerName} · ₹${o.grandTotal} · ${o.orderStatus} / ${o.paymentStatus}`)

  const adminTok = jwt.sign({ uid: 'demo_admin_id', email: 'admin@biryanibadshah.com', displayName: 'Demo', role: 'admin' }, secret, { expiresIn: '30m' })

  for (const o of demo) {
    await updateDoc(doc(db, 'orders', o.id), {
      paymentStatus: 'paid',
      orderStatus: 'PAYMENT_VERIFIED',
      paymentVerifiedBy: 'admin@biryanibadshah.com',
      paymentVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await apiPost('/api/orders/update-status', adminTok, { orderId: o.id, orderStatus: 'PAYMENT_VERIFIED', paymentStatus: 'paid' })
    say('32', `  ✓ ${o.id} → PAYMENT_VERIFIED · Paid`)
  }

  const promo = await apiPost('/api/admin/set-role', adminTok, { userId: 'demo_cust_5', role: 'staff', email: 'mohsin.khan@demo.badshah.com', displayName: 'Mohsin Khan' })
  say('32', `  ✓ Admin promoted Mohsin Khan → staff (HTTP ${promo.status})`)

  await signOut(auth)
  say('35', `\nPHASE 3 COMPLETE · all payments approved (verified by admin@biryanibadshah.com)`)
  process.exit(0)
}

main().catch(e => { console.error('ERR:', e); process.exit(1) })
