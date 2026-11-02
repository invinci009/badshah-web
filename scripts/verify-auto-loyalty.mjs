// scripts/verify-auto-loyalty.mjs
import { readFileSync } from 'fs'

const env = {}
readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
})

const BASE = 'http://localhost:3000'

console.log('── Step 1: Login as admin@bb.com ──')
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: 'mDVNa8EbeHU4vYSj8PBzWtuDZG43',
    email: 'admin@bb.com',
    displayName: 'Admin User',
  }),
})
const loginData = await loginRes.json()
if (!loginData.accessToken) {
  console.error('Login failed:', loginData)
  process.exit(1)
}
const token = loginData.accessToken
console.log('✓ Logged in. Token received.')

console.log('\n── Step 2: Check initial points on /api/loyalty/summary ──')
const initialSummaryRes = await fetch(`${BASE}/api/loyalty/summary?customerId=mDVNa8EbeHU4vYSj8PBzWtuDZG43`, {
  headers: { Authorization: `Bearer ${token}` }
})
const initialSummary = await initialSummaryRes.json()
console.log('Initial Customer Data:', initialSummary.customer?.name, '| Phone:', initialSummary.customer?.phone, '| Email:', initialSummary.customer?.email)
console.log('Initial Points Balance:', initialSummary.snapshot?.availablePoints)
const initialPoints = initialSummary.snapshot?.availablePoints || 0

console.log('\n── Step 3: Place a new order via /api/orders/create ──')
const orderId = `BB-AUTO-TEST-${Date.now().toString(36).toUpperCase()}`
const orderPayload = {
  orderId,
  userId: 'mDVNa8EbeHU4vYSj8PBzWtuDZG43',
  userEmail: 'admin@bb.com',
  customerEmail: 'admin@bb.com',
  userName: 'Admin User',
  customerName: 'Admin User',
  userPhone: '8271301179',
  customerPhone: '8271301179',
  deliveryAddress: 'Flat 402, Royal Residency, Bailey Road, Patna',
  items: [
    { title: 'Dum Handi Biryani', price: 299, qty: 1 }
  ],
  subtotal: 299,
  deliveryCharge: 40,
  tax: 15,
  grandTotal: 354,
  paymentMethod: 'COD',
  orderStatus: 'pending',
}

const orderRes = await fetch(`${BASE}/api/orders/create`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(orderPayload),
})
const orderData = await orderRes.json()
console.log('Order creation response:', orderData)
if (!orderData.success) {
  console.error('Order creation failed:', orderData)
  process.exit(1)
}

console.log('\n── Step 4: Verify points awarded automatically ──')
const updatedSummaryRes = await fetch(`${BASE}/api/loyalty/summary?customerId=mDVNa8EbeHU4vYSj8PBzWtuDZG43`, {
  headers: { Authorization: `Bearer ${token}` }
})
const updatedSummary = await updatedSummaryRes.json()
const newPoints = updatedSummary.snapshot?.availablePoints || 0
console.log('Updated Points Balance:', newPoints)
console.log('Points Earned Total:', updatedSummary.snapshot?.earnedTotal)
console.log('Recent Transactions:', updatedSummary.transactions?.slice(0, 3).map(t => ({ id: t.id, type: t.type, points: t.points, reason: t.reason })))

if (newPoints >= initialPoints + 20) {
  console.log(`\n✅ TEST PASSED: Points were automatically awarded! (${initialPoints} -> ${newPoints})`)
} else {
  console.error(`\n❌ TEST FAILED: Expected at least ${initialPoints + 20} points, got ${newPoints}`)
  process.exit(1)
}

process.exit(0)
