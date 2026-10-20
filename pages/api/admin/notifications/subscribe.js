import { withAuth } from '../../../../lib/authMiddleware'
import { patchFirestoreDoc } from '../../../../lib/firestoreServer'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { subscription, userAgent } = req.body
    const user = req.user

    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ error: 'Missing required PushSubscription details (endpoint, p256dh, auth)' })
    }

    const endpoint = subscription.endpoint
    const p256dh = subscription.keys.p256dh
    const auth = subscription.keys.auth
    const adminEmail = (user.email || '').toLowerCase()
    const adminUserId = user.uid || user.userId || adminEmail
    const now = new Date().toISOString()

    // Save to Firestore admin_notification_subscriptions via authenticated REST
    try {
      const docId = Buffer.from(endpoint).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substring(0, 60)
      await patchFirestoreDoc('admin_notification_subscriptions', docId, {
        adminUserId,
        adminEmail,
        endpoint,
        p256dh,
        auth,
        userAgent: userAgent || req.headers['user-agent'] || '',
        updatedAt: now,
        createdAt: now,
      })
    } catch (fsErr) {
      console.warn('Firestore subscription sync warning:', fsErr.message)
    }

    return res.status(200).json({
      success: true,
      message: 'Admin push notification subscription registered successfully',
    })
  } catch (error) {
    console.error('Subscribe Admin Notification Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to save notification subscription' })
  }
}

export default withAuth(handler, true)
