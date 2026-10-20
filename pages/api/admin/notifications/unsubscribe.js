import { withAuth } from '../../../../lib/authMiddleware'
import { deleteFirestoreDoc } from '../../../../lib/firestoreServer'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { endpoint } = req.body

    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint to unsubscribe' })
    }

    // Remove from Firestore admin_notification_subscriptions via authenticated REST
    try {
      const docId = Buffer.from(endpoint).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substring(0, 60)
      await deleteFirestoreDoc('admin_notification_subscriptions', docId)
    } catch (fsErr) {
      console.warn('Firestore unsubscribe warning:', fsErr.message)
    }

    return res.status(200).json({
      success: true,
      message: 'Admin push notification subscription removed successfully',
    })
  } catch (error) {
    console.error('Unsubscribe Admin Notification Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to remove notification subscription' })
  }
}

export default withAuth(handler, true)
