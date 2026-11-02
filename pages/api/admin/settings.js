// pages/api/admin/settings.js
import { withAuth } from '../../../lib/authMiddleware'
import { ROLES } from '../../../lib/roles'
import { fetchFirestoreDoc, patchFirestoreDoc } from '../../../lib/firestoreServer'

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const doc = await fetchFirestoreDoc('settings', 'restaurant')
      return res.status(200).json(doc || {})
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to fetch restaurant settings' })
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const {
        restaurantName,
        isStoreOpen,
        deliveryCharge,
        gstPercentage,
        openingTime,
        closingTime,
        supportPhone,
        storeUpiId,
        restaurantAddress,
        googlePlaceId,
        announcementEnabled,
        announcementText,
        announcementType,
        telegramBotToken,
        telegramChatId,
      } = req.body

      const payload = {
        updatedAt: new Date().toISOString(),
      }

      if (restaurantName !== undefined) payload.restaurantName = restaurantName
      if (isStoreOpen !== undefined) payload.isStoreOpen = Boolean(isStoreOpen)
      if (deliveryCharge !== undefined) payload.deliveryCharge = Number(deliveryCharge) || 0
      if (gstPercentage !== undefined) payload.gstPercentage = Number(gstPercentage) || 0
      if (openingTime !== undefined) payload.openingTime = openingTime
      if (closingTime !== undefined) payload.closingTime = closingTime
      if (supportPhone !== undefined) payload.supportPhone = supportPhone
      if (storeUpiId !== undefined) payload.storeUpiId = storeUpiId
      if (restaurantAddress !== undefined) payload.restaurantAddress = restaurantAddress
      if (googlePlaceId !== undefined) payload.googlePlaceId = (googlePlaceId || '').trim()
      if (announcementEnabled !== undefined) payload.announcementEnabled = Boolean(announcementEnabled)
      if (announcementText !== undefined) payload.announcementText = (announcementText || '').trim()
      if (announcementType !== undefined) payload.announcementType = announcementType
      if (telegramBotToken !== undefined) payload.telegramBotToken = (telegramBotToken || '').trim()
      if (telegramChatId !== undefined) payload.telegramChatId = (telegramChatId || '').trim()

      await patchFirestoreDoc('settings', 'restaurant', payload)

      return res.status(200).json({
        success: true,
        message: 'Restaurant settings and announcements saved successfully',
        settings: payload,
      })
    } catch (err) {
      console.error('Settings save error:', err)
      return res.status(500).json({ error: err.message || 'Failed to save settings' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withAuth(handler, ROLES.ADMIN)
