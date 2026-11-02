/**
 * Telegram Notification Engine for Biryani Badshah
 * 100% Free - Sends instant Telegram order alerts to your Telegram Admin Group/Channel
 */

export async function sendTelegramOrderNotification(orderData) {
  let token = process.env.TELEGRAM_BOT_TOKEN
  let chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    try {
      const { fetchFirestoreDoc } = await import('./firestoreServer')
      const settingsDoc = await fetchFirestoreDoc('settings', 'restaurant')
      if (settingsDoc) {
        if (!token && settingsDoc.telegramBotToken) token = settingsDoc.telegramBotToken
        if (!chatId && settingsDoc.telegramChatId) chatId = settingsDoc.telegramChatId
      }
    } catch (_) {}
  }

  token = token ? String(token).trim().replace(/^['"]|['"]$/g, '') : ''
  chatId = chatId ? String(chatId).trim().replace(/^['"]|['"]$/g, '') : ''

  if (!token || !chatId) {
    console.log('[TelegramNotification] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in environment or settings. Skipping.')
    return { success: false, reason: 'Telegram keys not set' }
  }

  if (!orderData || !orderData.orderId) {
    return { success: false, reason: 'Invalid order data' }
  }

  const {
    orderId,
    grandTotal,
    subtotal,
    deliveryCharge,
    tax,
    discount,
    items,
    customerName,
    userName,
    customerPhone,
    userPhone,
    deliveryAddress,
    paymentMethod,
    paymentStatus,
  } = orderData

  const customer = customerName || userName || 'Customer'
  const phone = customerPhone || userPhone || 'Not provided'
  const address = deliveryAddress || 'Pickup / Direct Order'
  const amount = Math.round(grandTotal || 0)
  const pMethod = paymentMethod || 'COD'
  const isCod = (pMethod || '').toUpperCase() === 'COD' || (pMethod || '').toLowerCase().includes('cash')
  const displayMethod = isCod ? '💵 Cash on Delivery' : pMethod
  const headline = isCod ? '🍗 <b>NEW CASH ON DELIVERY ORDER!</b>' : '🍗 <b>NEW ORDER CONFIRMED!</b>'
  const actionLine = isCod
    ? `💵 <b>Rider Action:</b> Collect ₹${amount} in Cash at Doorstep\n✅ <i>Status: Order Placed (${orderData.orderStatus || paymentStatus || 'Pending'})</i>`
    : `✅ <i>Status: Payment Verified (${paymentStatus || 'confirmed'})</i>`

  // Format Items List
  let itemListText = ''
  if (Array.isArray(items) && items.length > 0) {
    itemListText = items.map((item, idx) => {
      const name = item.name || item.title || `Item ${idx + 1}`
      const qty = item.qty || item.quantity || 1
      const price = item.price ? ` (₹${item.price * qty})` : ''
      return `   • ${name} x${qty}${price}`
    }).join('\n')
  } else {
    itemListText = '   • Order items details unavailable'
  }

  // Format Message HTML
  const messageHtml = `
${headline}
━━━━━━━━━━━━━━━━━━
🆔 <b>Order ID:</b> <code>${orderId}</code>
💰 <b>Total Amount:</b> ₹${amount} (${displayMethod})
👤 <b>Customer:</b> ${customer}
📞 <b>Phone:</b> <code>${phone}</code>
📍 <b>Address:</b> ${address}

📦 <b>Order Items:</b>
${itemListText}

⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
━━━━━━━━━━━━━━━━━━
${actionLine}
`.trim()

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      })
    })

    const data = await res.json()
    if (!res.ok || !data.ok) {
      console.warn('[TelegramNotification] Failed to send Telegram alert:', data.description || res.statusText)
      return { success: false, error: data.description || 'Telegram API Error' }
    }

    console.log(`[TelegramNotification] Successfully sent Telegram order alert for #${orderId}`)
    return { success: true, messageId: data.result?.message_id }
  } catch (error) {
    console.error('[TelegramNotification] Error sending Telegram alert:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Generic helper to send any custom text message to Telegram
 */
export async function sendTelegramMessage(messageText, customToken = null, customChatId = null) {
  let token = customToken || process.env.TELEGRAM_BOT_TOKEN
  let chatId = customChatId || process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    try {
      const { fetchFirestoreDoc } = await import('./firestoreServer')
      const settingsDoc = await fetchFirestoreDoc('settings', 'restaurant')
      if (settingsDoc) {
        if (!token && settingsDoc.telegramBotToken) token = settingsDoc.telegramBotToken
        if (!chatId && settingsDoc.telegramChatId) chatId = settingsDoc.telegramChatId
      }
    } catch (_) {}
  }

  if (!token || !chatId) {
    return {
      success: false,
      error: 'Telegram Bot Token or Chat ID not configured. Please enter them in Admin Settings or set in environment variables.'
    }
  }

  const cleanToken = String(token).trim().replace(/^['"]|['"]$/g, '')
  const cleanChatId = String(chatId).trim().replace(/^['"]|['"]$/g, '')

  if (cleanToken.includes('7123456789') || cleanChatId.includes('1928374650')) {
    return {
      success: false,
      error: 'Sample/example token detected! Please generate your bot via @BotFather on Telegram and configure the valid token.'
    }
  }

  try {
    const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: messageText,
        parse_mode: 'HTML',
      })
    })

    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { success: false, error: data.description || `Telegram API Error (${res.status})` }
    }

    return { success: true, messageId: data.result?.message_id }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
