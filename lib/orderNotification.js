import webpush from 'web-push'
import { queryFirestoreCollection, patchFirestoreDoc, deleteFirestoreDoc } from './firestoreServer'

/**
 * Configure VAPID credentials if available
 */
function getVapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@biryanibadshah.in'

  if (!publicKey || !privateKey) {
    console.warn('[WebPush] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY environment variables.')
    return null
  }

  return { publicKey, privateKey, subject }
}

/**
 * Main Order Notification Engine
 * Sends Web Push notifications to all registered admin devices when a new order is verified/confirmed.
 * Safe & Idempotent: Never throws or fails the parent order creation request.
 */
export async function sendOrderNotification(orderData) {
  if (!orderData || !orderData.orderId) {
    console.warn('[OrderNotification] Invalid order data passed to notification engine.')
    return { success: false, reason: 'Invalid order data' }
  }

  const { orderId, grandTotal, items, customerName, userName } = orderData

  try {
    const now = new Date().toISOString()
    const enrichedOrderData = {
      ...orderData,
      customerPhone: orderData.customerPhone || orderData.userPhone || '',
      deliveryAddress: orderData.deliveryAddress || '',
      paymentMethod: orderData.paymentMethod || 'Online',
      paymentStatus: orderData.paymentStatus || 'confirmed',
      customerName: orderData.customerName || orderData.userName || 'Customer',
      grandTotal: orderData.grandTotal || 0,
      items: Array.isArray(orderData.items) ? orderData.items : []
    }

    // 1. Mark notificationSent = true in Firestore (authenticated REST)
    try {
      await patchFirestoreDoc('orders', orderId, {
        notificationSent: true,
        notificationEmittedAt: now,
        updatedAt: now
      })
    } catch (fsErr) {
      console.warn('[OrderNotification] Firestore notificationSent update notice:', fsErr.message)
    }

    // 2. Dispatch Telegram Order Notification concurrently (ALWAYS INSTANT & UNBLOCKED)
    try {
      const { sendTelegramOrderNotification } = await import('./telegramNotification')
      await sendTelegramOrderNotification(enrichedOrderData).catch(err => console.warn('[OrderNotification] Telegram notice:', err.message))
    } catch (tgErr) {
      console.warn('[OrderNotification] Telegram import notice:', tgErr.message)
    }

    // 3. Fetch Subscriptions from Firestore admin_notification_subscriptions
    let fsSubs = []
    try {
      fsSubs = await queryFirestoreCollection({
        collectionId: 'admin_notification_subscriptions',
        limit: 100,
      })
    } catch (e) {
      console.warn('[OrderNotification] Firestore subscription query notice:', e.message)
    }

    // Merge and deduplicate subscriptions by endpoint
    const subMap = new Map()
    for (const sub of fsSubs) {
      if (sub && sub.endpoint && sub.p256dh && sub.auth) {
        subMap.set(sub.endpoint, {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          },
          adminUserId: sub.adminUserId,
          adminEmail: sub.adminEmail
        })
      }
    }

    const subscriptions = Array.from(subMap.values())

    if (subscriptions.length === 0) {
      console.log(`[OrderNotification] Order #${orderId} confirmed, but no admin push subscriptions are registered. Telegram alert sent.`)
      return { success: true, deliveredCount: 0, totalSubscriptions: 0, telegramSent: true }
    }

    // 4. Prepare Web Push Payload
    const itemCount = Array.isArray(enrichedOrderData.items) ? enrichedOrderData.items.reduce((acc, curr) => acc + (Number(curr.qty) || 1), 0) : 0
    const formattedAmount = `₹${Math.round(enrichedOrderData.grandTotal || grandTotal || 0)}`
    const shortOrderId = orderId.replace('BB-PATNA-', '#')
    const customer = enrichedOrderData.customerName || customerName || userName || 'Customer'

    const payload = JSON.stringify({
      title: `New Order ${shortOrderId}`,
      body: `${formattedAmount} • ${itemCount} item${itemCount !== 1 ? 's' : ''} • ${customer}`,
      icon: '/images/cart.png',
      badge: '/images/cart.png',
      tag: `new-order-${orderId}`,
      renotify: true,
      requireInteraction: true,
      data: {
        orderId,
        url: `/admin/orders?orderId=${encodeURIComponent(orderId)}`,
        grandTotal: enrichedOrderData.grandTotal || grandTotal,
        itemCount,
        customerName: customer,
        createdAt: now
      }
    })

    // 5. Configure WebPush VAPID
    const vapid = getVapidDetails()
    if (!vapid) {
      console.warn('[OrderNotification] Cannot send Web Push: VAPID keys not configured.')
      return { success: false, reason: 'VAPID keys not configured', telegramSent: true }
    }

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

    // 6. Dispatch Web Push to all registered admin devices concurrently
    let deliveredCount = 0
    const sendPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, payload)

        deliveredCount++
      } catch (pushErr) {
        const statusCode = pushErr.statusCode
        console.warn(`[OrderNotification] WebPush error for endpoint (${statusCode}):`, pushErr.message)

        // Clean up expired or invalid subscriptions (404 Not Found or 410 Gone)
        if (statusCode === 404 || statusCode === 410) {
          try {
            const fsSubId = Buffer.from(sub.endpoint).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substring(0, 60)
            await deleteFirestoreDoc('admin_notification_subscriptions', fsSubId)
          } catch (delErr) {
            console.warn('Subscription cleanup notice:', delErr.message)
          }
        }
      }
    })

    await Promise.all(sendPromises)

    console.log(`[OrderNotification] Successfully dispatched push notification for Order #${orderId} to ${deliveredCount}/${subscriptions.length} devices.`)
    return { success: true, deliveredCount, totalSubscriptions: subscriptions.length, telegramSent: true }

  } catch (error) {
    console.error('[OrderNotification] Non-fatal notification failure:', error)
    return { success: false, error: error.message }
  }
}
