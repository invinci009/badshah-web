// ═══════════════════════════════════════════════════════════════════════════
//  BIRYANI BADSHAH — FULL E2E ORDER FLOW TEST
//  • 5 customers × 2 orders = 10 orders placed via /api/orders/create
//  • RBAC gate tests (staff blocked before payment, admin unblocked)
//  • Payment verification → status advancement → cancellation test
//  • Admin dashboard query + user order history tests
// ═══════════════════════════════════════════════════════════════════════════
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, signOut } from 'firebase/auth'
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'

// ── Load env ──────────────────────────────────────────────────────────────
const envTxt = readFileSync('.env.local', 'utf8')
const env    = {}
envTxt.split(/\r?\n/).forEach(l => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
})

const JWT_ACCESS_SECRET = env.JWT_ACCESS_SECRET
const BASE              = 'http://localhost:3000'

// ── Firebase init ─────────────────────────────────────────────────────────
const app = initializeApp({
  apiKey:            env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const fbAuth = getAuth(app)
const db     = getFirestore(app)

// ── Colour helpers ────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m',  green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', grey: '\x1b[90m',  magenta: '\x1b[35m',
  white: '\x1b[97m',
}
const say  = (color, msg) => console.log(`${color}${msg}${C.reset}`)
const head = (msg)        => console.log(`\n${C.bold}${C.cyan}═══ ${msg} ═══${C.reset}`)
const ok   = (msg)        => say(C.green,   `  ✓ ${msg}`)
const warn = (msg)        => say(C.yellow,  `  ⚠ ${msg}`)
const fail = (msg)        => say(C.red,     `  ✗ ${msg}`)
const info = (msg)        => say(C.grey,    `  · ${msg}`)

// ── Test counters ─────────────────────────────────────────────────────────
let passed = 0, failed = 0

function assert(condition, label) {
  if (condition) { ok(label); passed++ }
  else           { fail(label); failed++ }
  return condition
}

// ── Helpers ───────────────────────────────────────────────────────────────
const signJwt = (email, role, uid) =>
  jwt.sign({ uid, email, displayName: 'Demo', role }, JWT_ACCESS_SECRET, { expiresIn: '30m' })

async function apiCall(method, path, token, body = null) {
  try {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
      },
    }
    if (body) opts.body = JSON.stringify(body)
    const res  = await fetch(BASE + path, opts)
    let data = null
    try { data = await res.json() } catch (_) {}
    return { status: res.status, data }
  } catch (e) {
    return { status: 0, data: null, error: e.message }
  }
}
const POST = (path, token, body) => apiCall('POST', path, token, body)
const GET  = (path, token)       => apiCall('GET',  path, token)

// ── Menu items ────────────────────────────────────────────────────────────
const MENU = [
  { title: 'Chicken Biryani [2 pc chicken]',      qty: 2, price: 220, category: 'biryani' },
  { title: 'Mutton Biryani',                       qty: 1, price: 350, category: 'biryani' },
  { title: 'Chicken Leg Biryani [1 big leg]',      qty: 1, price: 260, category: 'biryani' },
  { title: 'Chicken Reshmi Biryani',               qty: 2, price: 300, category: 'biryani' },
  { title: 'Raita',                                qty: 2, price:  40, category: 'sides'   },
]

const DELIVERY_FEE = 40
const CUSTOMERS = [
  ['anil.kumar@demo.badshah.test',   'Anil Kumar',    '9693900001', 'House 14, Birla Colony, Phulwari Sharif'],
  ['priya.singh@demo.badshah.test',  'Priya Singh',   '9693900002', 'Near Bhagat Singh Chowk, Phulwari Sharif'],
  ['ravi.verma@demo.badshah.test',   'Ravi Verma',    '9693900003', 'Flat 3B, Danapur Road, Phulwari Sharif'],
  ['sunita.devi@demo.badshah.test',  'Sunita Devi',   '9693900004', 'Khagaul Road, Near Iron Bridge, Patna'],
  ['mohsin.khan@demo.badshah.test',  'Mohsin Khan',   '9693900005', 'Birla Colony, Phulwari Sharif, Patna'],
]

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.white}╔══════════════════════════════════════════════════════╗`)
  console.log(`║  BIRYANI BADSHAH — E2E ORDER FLOW TEST SUITE         ║`)
  console.log(`╚══════════════════════════════════════════════════════╝${C.reset}\n`)

  const adminTok = signJwt('admin@biryanibadshah.com', 'admin', 'demo_admin_id')
  const staffTok = signJwt('staff@demo.badshah.com',  'staff', 'demo_staff_id')

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 0 · Pre-flight: Server Reachability')
  // ══════════════════════════════════════════════════════════════════════════
  const ping = await fetch(BASE + '/api/auth/login', { method: 'GET' }).catch(() => null)
  assert(ping !== null, `Dev server reachable at ${BASE}`)

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 1 · 5 Customers × 2 UPI Orders = 10 Total Orders')
  // ══════════════════════════════════════════════════════════════════════════
  const placed   = []
  let orderCount = 0

  for (const [email, name, phone, address] of CUSTOMERS) {
    say(C.magenta, `\n  Customer: ${name} (${email})`)

    // 1a. Sign in anonymously to get a real Firebase UID
    let uid
    try {
      const cred = await signInAnonymously(fbAuth)
      uid = cred.user.uid
      info(`Firebase UID: ${uid}`)
    } catch (e) {
      warn(`Anonymous sign-in failed: ${e.message} — using synthetic UID`)
      uid = `demo_${name.replace(/\s/g, '_').toLowerCase()}_${Date.now()}`
    }

    // 1b. Create Firestore user doc
    try {
      await setDoc(doc(db, 'users', uid), {
        name, email, phone, role: 'customer',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }, { merge: true })
      info('Firestore user doc created/merged')
    } catch (e) {
      warn(`Firestore user write skipped: ${e.message}`)
    }

    // 1c. Real login API → get access token with server-resolved role
    const loginRes = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, email, displayName: name }),
    }).then(r => r.json()).catch(() => null)

    if (!loginRes?.accessToken) {
      fail(`Login failed for ${email}: ${JSON.stringify(loginRes)}`)
      failed++
      await signOut(fbAuth).catch(() => {})
      continue
    }
    ok(`Login OK — role: ${loginRes.user?.email || email} (token issued)`)
    const token = loginRes.accessToken

    // 1d. Place 2 orders per customer
    for (let k = 0; k < 2; k++) {
      orderCount++
      const items    = k === 0 ? [MENU[0], MENU[3]] : [MENU[1], MENU[2]]
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
      const grandTotal = subtotal + DELIVERY_FEE
      const orderId  = `BB-TEST-${Date.now().toString(36).toUpperCase()}-${String(orderCount).padStart(3, '0')}`
      const txRef    = `UPI/${Math.floor(1e9 + Math.random() * 9e9)}`

      const payload = {
        orderId,
        userId:            uid,
        userEmail:         email,
        customerName:      name,
        customerEmail:     email,
        customerPhone:     phone,
        deliveryAddress:   address,
        items,
        subtotal,
        deliveryCharge:    DELIVERY_FEE,
        tax:               0,
        discount:          0,
        appliedCoupon:     null,
        grandTotal,
        paymentMethod:     'UPI',
        paymentStatus:     'verification_pending',
        orderStatus:       'payment_verification_pending',
        customerMarkedPaid: true,
        transactionReference: txRef,
      }

      // Call the API — server now writes to Firestore via authenticated REST
      const r = await POST('/api/orders/create', token, payload)
      const ok_ = assert(
        r.status === 200 && r.data?.success === true,
        `Order #${orderCount} (${orderId}) for ${name} — ₹${grandTotal} → HTTP ${r.status}`
      )
      if (ok_) {
        placed.push({ orderId, name, email, uid, grandTotal, token })
        info(`txRef: ${txRef}`)
      } else {
        info(`Response: ${JSON.stringify(r.data)}`)
      }
    }

    await signOut(fbAuth).catch(() => {})
  }

  say(C.yellow, `\n  → ${placed.length}/10 orders placed successfully`)

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 2 · RBAC — Staff blocked before payment approval')
  // ══════════════════════════════════════════════════════════════════════════

  // 2a. Staff tries to escalate role → must be 403
  const roleAttempt = await POST('/api/admin/set-role', staffTok, { userId: 'x', role: 'admin' })
  assert(roleAttempt.status === 403, `Staff → set-role blocked (HTTP ${roleAttempt.status})`)

  // 2b. Staff tries to accept an unpaid order → must be 403
  if (placed.length > 0) {
    const testOrder = placed[0]
    const acceptBlocked = await POST('/api/orders/update-status', staffTok, {
      orderId: testOrder.orderId, orderStatus: 'Accepted',
    })
    assert(
      acceptBlocked.status === 403,
      `Staff accept UNPAID order → blocked (HTTP ${acceptBlocked.status})`
    )
    if (acceptBlocked.status !== 403) info(`Response: ${JSON.stringify(acceptBlocked.data)}`)
  }

  // 2c. Customer token cannot call admin endpoint → must be 403
  if (placed.length > 0) {
    const custToken = placed[0].token
    const custAdmin = await GET('/api/orders/admin-all', custToken)
    assert(
      custAdmin.status === 403,
      `Customer token → admin-all blocked (HTTP ${custAdmin.status})`
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 3 · Admin approves payments → staff advances orders')
  // ══════════════════════════════════════════════════════════════════════════

  for (const o of placed) {
    // Admin approves payment
    const pay = await POST('/api/orders/update-status', adminTok, {
      orderId:     o.orderId,
      orderStatus: 'payment_verified',
      paymentStatus: 'paid',
    })
    assert(
      pay.status === 200 && pay.data?.success,
      `Admin approved payment for ${o.orderId} → HTTP ${pay.status}`
    )
  }

  // Staff now accepts all (payment approved so gate should open)
  for (const o of placed) {
    const r = await POST('/api/orders/update-status', staffTok, {
      orderId:     o.orderId,
      orderStatus: 'Accepted',
    })
    assert(
      r.status === 200 && r.data?.success,
      `Staff accepted ${o.orderId} after payment → HTTP ${r.status}`
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 4 · Status Progression: Accepted → Preparing → Out For Delivery → Delivered')
  // ══════════════════════════════════════════════════════════════════════════

  const statusFlow = ['Preparing', 'Out For Delivery', 'Delivered']
  const sampleOrders = placed.slice(0, 3) // advance first 3 orders through full pipeline

  for (const o of sampleOrders) {
    for (const status of statusFlow) {
      const r = await POST('/api/orders/update-status', staffTok, {
        orderId:     o.orderId,
        orderStatus: status,
      })
      assert(
        r.status === 200 && r.data?.success,
        `${o.orderId} → ${status} (HTTP ${r.status})`
      )
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 5 · Order Rejection with Reason')
  // ══════════════════════════════════════════════════════════════════════════

  if (placed.length >= 4) {
    const rejectOrder = placed[3]
    const r = await POST('/api/orders/update-status', adminTok, {
      orderId:         rejectOrder.orderId,
      orderStatus:     'Rejected',
      paymentStatus:   'refund_pending',
      rejectionReason: 'Item out of stock at this time',
    })
    assert(
      r.status === 200 && r.data?.success,
      `Admin rejected ${rejectOrder.orderId} with reason → HTTP ${r.status}`
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 6 · Order Cancellation (by customer)')
  // ══════════════════════════════════════════════════════════════════════════

  if (placed.length >= 5) {
    const cancelOrder = placed[4]
    // Customer uses their own JWT to cancel
    const custToken = cancelOrder.token
    const r = await POST('/api/orders/cancel', custToken, {
      orderId:            cancelOrder.orderId,
      cancellationReason: 'Changed my mind',
    })
    assert(
      r.status === 200 && r.data?.success,
      `Customer cancelled ${cancelOrder.orderId} → HTTP ${r.status}`
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 7 · User Order History (My Orders page)')
  // ══════════════════════════════════════════════════════════════════════════

  // Each customer should see exactly 2 orders in their history
  const customerGroups = {}
  for (const o of placed) {
    customerGroups[o.uid] = customerGroups[o.uid] || { token: o.token, orders: [] }
    customerGroups[o.uid].orders.push(o.orderId)
  }

  for (const [uid, { token, orders }] of Object.entries(customerGroups)) {
    const r = await GET(`/api/orders/user?userId=${uid}`, token)
    assert(
      r.status === 200 && r.data?.success && Array.isArray(r.data?.orders),
      `User ${uid.substring(0, 8)}... order history fetched → ${r.data?.orders?.length ?? '?'} orders (HTTP ${r.status})`
    )
    if (r.data?.orders) {
      assert(
        r.data.orders.length >= orders.length,
        `User ${uid.substring(0, 8)}... has ≥${orders.length} orders in history`
      )
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 8 · Admin Dashboard: All Orders + Search + Status Filter')
  // ══════════════════════════════════════════════════════════════════════════

  // 8a. Fetch all orders (paginated) — must contain the test orders
  const allR = await GET(`/api/orders/admin-all?page=1&limit=20`, adminTok)
  assert(
    allR.status === 200 && allR.data?.pagination && (allR.data?.orders?.length ?? 0) >= placed.length,
    `Admin all-orders (page 1) → ${allR.data?.orders?.length ?? '?'} orders, total=${allR.data?.pagination?.total ?? '?'} (HTTP ${allR.status})`
  )

  // 8b. Search by phone number
  const searchR = await GET(`/api/orders/admin-all?search=9693900001`, adminTok)
  assert(
    searchR.status === 200 && (searchR.data?.orders?.length ?? 0) > 0,
    `Admin search by phone "9693900001" → ${searchR.data?.orders?.length ?? 0} result(s) (HTTP ${searchR.status})`
  )

  // 8c. Search by customer name — must return results
  const nameR = await GET(`/api/orders/admin-all?search=Anil+Kumar`, adminTok)
  assert(
    nameR.status === 200 && (nameR.data?.orders?.length ?? 0) > 0,
    `Admin search by name "Anil Kumar" → ${nameR.data?.orders?.length ?? 0} result(s) (HTTP ${nameR.status})`
  )

  // 8d. Filter by status — must return 3 delivered orders
  const statusR = await GET(`/api/orders/admin-all?status=Delivered`, adminTok)
  assert(
    statusR.status === 200 && (statusR.data?.orders?.length ?? 0) >= 3,
    `Admin filter by status=Delivered → ${statusR.data?.orders?.length ?? 0} result(s) (HTTP ${statusR.status})`
  )

  // 8e. Staff can also access all-orders dashboard
  const staffAllR = await GET(`/api/orders/admin-all?page=1&limit=5`, staffTok)
  assert(
    staffAllR.status === 200,
    `Staff can access admin-all dashboard (HTTP ${staffAllR.status})`
  )

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 9 · Error Boundary Tests')
  // ══════════════════════════════════════════════════════════════════════════

  // 9a. Missing auth → 401
  const noAuth = await fetch(BASE + '/api/orders/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'x', userEmail: 'x@x.com' }),
  }).then(r => r.json().then(d => ({ status: r.status, data: d }))).catch(() => ({ status: 0 }))
  assert(noAuth.status === 401, `No auth header → 401 (HTTP ${noAuth.status})`)

  // 9b. Missing items → 400
  const missingItems = await POST('/api/orders/create', adminTok, {
    userId: 'uid', userEmail: 'x@x.com', customerPhone: '9999999999',
    deliveryAddress: 'Test St', items: [], subtotal: 0, grandTotal: 0,
  })
  assert(missingItems.status === 400, `Empty items → 400 (HTTP ${missingItems.status})`)

  // 9c. Missing phone → 400
  const missingPhone = await POST('/api/orders/create', adminTok, {
    userId: 'uid', userEmail: 'x@x.com',
    deliveryAddress: 'Test St', items: [{ title: 'X', qty: 1, price: 100 }],
    subtotal: 100, grandTotal: 140,
  })
  assert(missingPhone.status === 400, `Missing phone → 400 (HTTP ${missingPhone.status})`)

  // 9d. Invalid coupon → 400
  const badCoupon = await POST('/api/orders/create', adminTok, {
    userId: 'uid', userEmail: 'test@test.com', customerPhone: '9999999999',
    deliveryAddress: 'Test St', items: [{ title: 'X', qty: 1, price: 200 }],
    subtotal: 200, grandTotal: 240, deliveryCharge: 40, appliedCoupon: 'FAKECODE999',
  })
  assert(badCoupon.status === 400, `Invalid coupon → 400 (HTTP ${badCoupon.status})`)

  // 9e. Cancel without orderId → 400
  const cancelNoId = await POST('/api/orders/cancel', adminTok, {})
  assert(cancelNoId.status === 400, `Cancel without orderId → 400 (HTTP ${cancelNoId.status})`)

  // 9f. Update-status without orderId → 400
  const updateNoId = await POST('/api/orders/update-status', staffTok, {})
  assert(updateNoId.status === 400, `Update-status without orderId → 400 (HTTP ${updateNoId.status})`)

  // ══════════════════════════════════════════════════════════════════════════
  head('PHASE 10 · Performance Timing Benchmarks')
  // ══════════════════════════════════════════════════════════════════════════

  // Measure order create latency with a quick dummy order
  const benchUid   = `bench_${Date.now()}`
  const benchToken = signJwt(`bench@demo.badshah.test`, 'customer', benchUid)
  const benchOrderId = `BB-BENCH-${Date.now().toString(36).toUpperCase()}`

  try {
    await setDoc(doc(db, 'orders', benchOrderId), {
      orderId: benchOrderId, userId: benchUid, userEmail: 'bench@demo.badshah.test',
      grandTotal: 300, paymentStatus: 'verification_pending',
      orderStatus: 'payment_verification_pending', createdAt: serverTimestamp(),
    })
  } catch (_) {}

  const t0 = Date.now()
  await POST('/api/orders/create', benchToken, {
    orderId:          benchOrderId,
    userId:           benchUid,
    userEmail:        'bench@demo.badshah.test',
    customerPhone:    '9000000000',
    deliveryAddress:  'Bench Test Colony',
    items:            [{ title: 'Benchmark Biryani', qty: 1, price: 260, category: 'biryani' }],
    subtotal:         260,
    deliveryCharge:   40,
    tax:              0,
    grandTotal:       300,
    paymentMethod:    'UPI',
    paymentStatus:    'verification_pending',
    orderStatus:      'payment_verification_pending',
    transactionReference: 'UPI/BENCH123',
    customerMarkedPaid: true,
  })
  const createMs = Date.now() - t0

  const t1 = Date.now()
  await GET(`/api/orders/admin-all?page=1&limit=10`, adminTok)
  const listMs = Date.now() - t1

  const t2 = Date.now()
  await POST('/api/orders/update-status', adminTok, {
    orderId: benchOrderId, paymentStatus: 'paid', orderStatus: 'payment_verified',
  })
  const updateMs = Date.now() - t2

  ok(`Order Create:   ${createMs}ms ${createMs < 3000 ? '🟢 FAST' : createMs < 6000 ? '🟡 OK' : '🔴 SLOW'}`)
  ok(`Admin List:     ${listMs}ms   ${listMs   < 1000 ? '🟢 FAST' : listMs   < 3000 ? '🟡 OK' : '🔴 SLOW'}`)
  ok(`Status Update:  ${updateMs}ms ${updateMs < 2000 ? '🟢 FAST' : updateMs < 4000 ? '🟡 OK' : '🔴 SLOW'}`)

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const total = passed + failed
  console.log(`\n${C.bold}${C.white}╔══════════════════════════════════════════════════════╗`)
  console.log(`║  RESULTS                                             ║`)
  console.log(`╠══════════════════════════════════════════════════════╣`)
  console.log(`║  ${C.green}Passed: ${String(passed).padEnd(4)}${C.white}  ${C.red}Failed: ${String(failed).padEnd(4)}${C.white}  Total: ${String(total).padEnd(4)}            ║`)
  console.log(`║  Orders placed: ${String(placed.length).padEnd(37)}║`)
  console.log(`║  Gross revenue: ₹${String(placed.reduce((s,o)=>s+o.grandTotal,0)).padEnd(35)}║`)
  console.log(`╚══════════════════════════════════════════════════════╝${C.reset}`)

  if (failed === 0) {
    say(C.green, `\n  🎉 ALL ${total} TESTS PASSED — ORDERING SYSTEM FULLY OPERATIONAL`)
  } else {
    say(C.red, `\n  ⚠  ${failed}/${total} tests failed — review output above`)
  }

  console.log(`\n${C.grey}  Admin dashboard: http://localhost:3000/admin/orders`)
  console.log(`  Live orders:     http://localhost:3000/admin${C.reset}\n`)

  await signOut(fbAuth).catch(() => {})
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('\x1b[31mFATAL TEST ERROR:\x1b[0m', e)
  process.exit(1)
})
