import webpush from 'web-push'
import { withAuth } from '../../../../lib/authMiddleware'
import { queryFirestoreCollection, deleteFirestoreDoc } from '../../../../lib/firestoreServer'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@biryanibadshah.in'

    if (!publicKey || !privateKey) {
      return res.status(400).json({
        error: 'VAPID Keys not configured on server. Please set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.local.'
      })
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)

    // Fetch subscriptions from Firestore via authenticated REST
    let fsSubs = []
    try {
      fsSubs = await queryFirestoreCollection({
        collectionId: 'admin_notification_subscriptions',
        limit: 100,
      })
    } catch (e) {
      console.warn('[TestPush] Firestore subscription query notice:', e.message)
    }

    // Deduplicate subscriptions by endpoint
    const subMap = new Map()
    for (const sub of fsSubs) {
      if (sub && sub.endpoint && sub.p256dh && sub.auth) {
        subMap.set(sub.endpoint, {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth
        })
      }
    }

    const subscriptions = Array.from(subMap.values())

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(404).json({
        error: 'No active push subscriptions found for your account. Please click "Enable Notifications" first.'
      })
    }

    const testPayload = JSON.stringify({
      title: '🔔 Test Notification System',
      body: '₹438 • 3 items • Test Order #TEST-999',
      icon: '/images/cart.png',
      badge: '/images/cart.png',
      tag: `test-notification-${Date.now()}`,
      data: {
        orderId: 'TEST-999',
        url: '/admin/orders',
        isTest: true
      }
    })

    let successCount = 0
    let failureCount = 0

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            testPayload
          )
          successCount++
        } catch (err) {
          console.warn('[TestPush] Error sending push to device:', err.message)
          failureCount++
          if (err.statusCode === 404 || err.statusCode === 410) {
            try {
              const fsSubId = Buffer.from(sub.endpoint).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substring(0, 60)
              await deleteFirestoreDoc('admin_notification_subscriptions', fsSubId)
            } catch (e) {}
          }
        }
      })
    )

    return res.status(200).json({
      success: true,
      message: `Test push sent! Delivered to ${successCount} device(s) (${failureCount} failed).`,
      successCount,
      failureCount,
      totalDevices: subscriptions.length
    })
  } catch (error) {
    console.error('Test Push API Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to send test push notification' })
  }
}

export default withAuth(handler, true)
