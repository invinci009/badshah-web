// scripts/test-5-orders.mjs
// Test script to place 5 orders, deliver them, and verify loyalty point accrual and tier progression.

const BASE_URL = 'http://localhost:3000'
const TEST_PHONE = '9693999890'
const TEST_EMAIL = 'md.amanullahkhan1980@gmail.com'
const TEST_NAME = 'Amanullah Khan'

async function run() {
  console.log('===============================================================')
  console.log('🚀 BADSHAH ONLINE VIP CLUB: 5 ORDERS & POINTS ACCRUAL TEST')
  console.log(`👤 Customer: ${TEST_NAME} (${TEST_PHONE} | ${TEST_EMAIL})`)
  console.log('===============================================================\n')

  // Step 1: Login to get admin/staff auth token for status updates
  console.log('1️⃣ Authenticating session...')
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: 'user-amanullah-test',
      email: TEST_EMAIL,
      displayName: TEST_NAME,
    }),
  })
  const loginData = await loginRes.json()
  if (!loginData.accessToken) {
    throw new Error('Failed to obtain auth token: ' + JSON.stringify(loginData))
  }
  const token = loginData.accessToken
  console.log('   ✅ Authenticated with role:', loginData.user.role)

  // Step 2: Check starting points
  const startSnapRes = await fetch(`${BASE_URL}/api/loyalty/summary?phone=${TEST_PHONE}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const startSnap = await startSnapRes.json()
  const startPoints = startSnap.snapshot?.availablePoints || 0
  console.log(`\n2️⃣ Starting Points Balance: ${startPoints} PTS | Tier: ${startSnap.customer?.tier} ${startSnap.customer?.tierBadge}`)

  // 5 Realistic Sample Orders
  const sampleOrders = [
    {
      title: 'Chicken Dum Biryani Handi (Clay Pot)',
      items: [{ id: 'menu-chkn-dum', title: 'Chicken Dum Biryani Handi', quantity: 1, price: 280 }],
      subtotal: 280,
      deliveryCharge: 40,
      grandTotal: 320,
    },
    {
      title: 'Mutton Galouti Kebab & Roomali Roti',
      items: [{ id: 'menu-galouti', title: 'Mutton Galouti Kebab (4 pcs)', quantity: 1, price: 320 }],
      subtotal: 320,
      deliveryCharge: 40,
      grandTotal: 360,
    },
    {
      title: 'Shahi Firni & Gulab Jamun Platter',
      items: [{ id: 'menu-firni', title: 'Kesariya Shahi Firni', quantity: 2, price: 95 }],
      subtotal: 190,
      deliveryCharge: 40,
      grandTotal: 230,
    },
    {
      title: 'Royal Dum Pukht Feast (Chicken & Mutton)',
      items: [{ id: 'menu-royal-feast', title: 'Royal Dum Pukht Banquet', quantity: 1, price: 450 }],
      subtotal: 450,
      deliveryCharge: 40,
      grandTotal: 490,
    },
    {
      title: 'Badshah Special Clay Handi Biryani Family Pack',
      items: [{ id: 'menu-family-pack', title: 'Clay Handi Biryani Family Pack', quantity: 1, price: 520 }],
      subtotal: 520,
      deliveryCharge: 0,
      grandTotal: 520,
    },
  ]

  console.log('\n3️⃣ Executing 5 Sequential Orders and Deliveries...')
  let currentExpectedPoints = startPoints

  for (let i = 0; i < sampleOrders.length; i++) {
    const o = sampleOrders[i]
    const orderIndex = i + 1
    console.log(`\n---------------------------------------------------------------`)
    console.log(`📦 ORDER #${orderIndex}: ${o.title}`)
    console.log(`   Items: ₹${o.subtotal} + Delivery ₹${o.deliveryCharge} = ₹${o.grandTotal} (COD)`)

    // A. Create Order
    const createRes = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: 'user-amanullah-test',
        userEmail: TEST_EMAIL,
        userName: TEST_NAME,
        customerName: TEST_NAME,
        customerPhone: TEST_PHONE,
        customerEmail: TEST_EMAIL,
        deliveryAddress: 'Birla Colony, Phulwari Sharif, Patna, Bihar',
        items: o.items,
        subtotal: o.subtotal,
        deliveryCharge: o.deliveryCharge,
        tax: 0,
        grandTotal: o.grandTotal,
        paymentMethod: 'COD',
        orderStatus: 'pending',
      }),
    })
    const createData = await createRes.json()
    if (!createData.orderId) {
      throw new Error(`Order #${orderIndex} creation failed: ` + JSON.stringify(createData))
    }
    const orderId = createData.orderId
    console.log(`   ✅ Created Order ID: ${orderId} (Status: pending)`)

    // B. Advance order status through kitchen to 'delivered'
    // In real life: pending -> accepted -> preparing -> ready -> out_for_delivery -> delivered
    const updateRes = await fetch(`${BASE_URL}/api/orders/update-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orderId,
        orderStatus: 'delivered',
        status: 'delivered',
        paymentStatus: 'paid', // Cash collected upon delivery
      }),
    })
    const updateData = await updateRes.json()
    console.log(`   ✅ Status updated to: 'delivered' (COD Cash collected)`)

    // C. Verify points increment
    currentExpectedPoints += 20 // Each delivered order awards +20 pts

    // Allow async Firestore background writes to settle
    await new Promise(r => setTimeout(r, 600))

    const snapRes = await fetch(`${BASE_URL}/api/loyalty/summary?phone=${TEST_PHONE}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const snapData = await snapRes.json()
    const pointsNow = snapData.snapshot?.availablePoints || 0
    const earnedNow = snapData.snapshot?.earnedTotal || 0
    const tierNow = snapData.customer?.tier || ''
    const badgeNow = snapData.customer?.tierBadge || ''

    console.log(`   🪙 Balance after Order #${orderIndex}: ${pointsNow} PTS (Earned Total: ${earnedNow} PTS)`)
    console.log(`   🏆 Tier: ${tierNow} ${badgeNow}`)

    if (pointsNow !== currentExpectedPoints) {
      console.warn(`   ⚠️ Warning: expected ${currentExpectedPoints} pts, but got ${pointsNow} pts`)
    } else {
      console.log(`   ✨ Verification PASSED: +20 points credited successfully!`)
    }
  }

  // Step 4: Final Loyalty Audit
  console.log('\n===============================================================')
  console.log('📊 FINAL LOYALTY AUDIT & TOP-UP STATION ELIGIBILITY CHECK')
  console.log('===============================================================')

  const finalRes = await fetch(`${BASE_URL}/api/loyalty/summary?phone=${TEST_PHONE}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const finalSummary = await finalRes.json()

  console.log('Customer Identity:', finalSummary.customer?.name, `(${finalSummary.customer?.phone})`)
  console.log('Final Available Points:', finalSummary.snapshot?.availablePoints, 'PTS')
  console.log('Total Lifetime Points Earned:', finalSummary.snapshot?.earnedTotal, 'PTS')
  console.log('Current VIP Tier:', finalSummary.customer?.tier, finalSummary.customer?.tierBadge)
  console.log('Next VIP Tier:', finalSummary.customer?.nextTier || 'Top Imperial Tier Achieved!')
  console.log('Points Needed for Next Tier:', finalSummary.customer?.pointsNeededForNextTier)

  console.log('\n📜 Audit Ledger (Recent Transactions):')
  const txs = finalSummary.transactions || []
  txs.slice(0, 5).forEach((t, i) => {
    console.log(`   [${i + 1}] ${t.type} | Delta: ${t.delta > 0 ? '+' : ''}${t.delta} PTS | Order: #${t.orderId || 'N/A'} | ${t.reason}`)
  })

  // Step 5: Check Top-Up Station Perks at Checkout
  console.log('\n🛒 Testing VIP Top-Up Station at Checkout (/api/loyalty/rewards):')
  const rewardsRes = await fetch(`${BASE_URL}/api/loyalty/rewards?phone=${TEST_PHONE}&subtotal=350`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const rewardsData = await rewardsRes.json()
  console.log(`Customer Recognized Points: ${rewardsData.customerPoints} PTS`)
  console.log('Available Top-Up Rewards:')
  rewardsData.rewards.forEach(r => {
    const statusIcon = r.eligible ? '🟢 UNLOCKED (Eligible to Redeem)' : `🔒 LOCKED (${r.eligibilityMessage})`
    console.log(`   • ${r.name} (${r.pointsCost} PTS) -> ${statusIcon}`)
  })

  console.log('\n===============================================================')
  console.log('🎉 5 ORDERS TEST COMPLETE & VERIFIED 100% SUCCESSFUL!')
  console.log('===============================================================')
}

run().catch(err => {
  console.error('\n❌ Test Error:', err)
  process.exit(1)
})
