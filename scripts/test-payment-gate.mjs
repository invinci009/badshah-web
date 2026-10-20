// E2E test of the PAYMENT-FIRST gate
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'

const env = {}
readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') })
const app = initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID })
const db = getFirestore(app)
const auth = getAuth(app)
const secret = env.JWT_ACCESS_SECRET
const say = (c, m) => console.log(`\x1b[${c}m${m}\x1b[0m`)

const staffTok = jwt.sign({ uid: 'test_staff', email: 'staff@demo.badshah.com', displayName: 'T', role: 'staff' }, secret, { expiresIn: '10m' })
const call = (body) => fetch('http://localhost:3000/api/orders/update-status', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffTok}` },
  body: JSON.stringify(body),
}).then(r => r.json().then(d => ({ s: r.status, d })))

const ID = 'BB-PATNA-GATE-TEST'
await signInWithEmailAndPassword(auth, 'md.amanullahkhan1980@gmail.com', 'AMANULLAHPATNA2607')

// 1. create a fresh UNPAID order
await setDoc(doc(db, 'orders', ID), {
  orderId: ID, customerName: 'Gate Test', userEmail: 'gate@test.com',
  paymentStatus: 'verification_pending', orderStatus: 'payment_verification_pending',
  grandTotal: 260, createdAt: serverTimestamp(),
})
say('90', 'created unpaid test order')

// 2. staff tries to ACCEPT → must be 403
const r1 = await call({ orderId: ID, orderStatus: 'Accepted' })
say(r1.s === 403 ? '32' : '31', `staff accept on UNPAID → HTTP ${r1.s} ${r1.s === 403 ? 'BLOCKED ✓' : '✗ ' + JSON.stringify(r1.d)}`)

// 3. staff tries to advance while unpaid (Preparing) → must be 403
const r2 = await call({ orderId: ID, orderStatus: 'Preparing' })
say(r2.s === 403 ? '32' : '31', `staff advance on UNPAID → HTTP ${r2.s} ${r2.s === 403 ? 'BLOCKED ✓' : '✗'}`)

// 4. admin approves the payment (Firestore, real ACL path)
await updateDoc(doc(db, 'orders', ID), {
  paymentStatus: 'paid', orderStatus: 'PAYMENT_VERIFIED',
  paymentVerifiedBy: 'admin@biryanibadshah.com', paymentVerifiedAt: serverTimestamp(),
})
say('90', 'admin approved payment')

// 5. now staff accept → must succeed
const r3 = await call({ orderId: ID, orderStatus: 'Accepted' })
say(r3.s === 200 ? '32' : '31', `staff accept on PAID → HTTP ${r3.s} ✓ ${JSON.stringify(r3.d)}`)

// 6. cleanup
await deleteDoc(doc(db, 'orders', ID))
say('90', 'test order removed')
await signOut(auth)
process.exit(0)
