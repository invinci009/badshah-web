/**
 * Telegram Notification Engine for Biryani Badshah
 * 100% Free - Sends instant Telegram order alerts to your Telegram Admin Group/Channel
 */

export async function sendTelegramOrderNotification(orderData) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.log('[TelegramNotification] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in environment variables. Skipping.')
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
  const pMethod = paymentMethod || 'Online'

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
🍗 <b>NEW ORDER CONFIRMED!</b>
━━━━━━━━━━━━━━━━━━
🆔 <b>Order ID:</b> <code>${orderId}</code>
💰 <b>Total Amount:</b> ₹${amount} (${pMethod})
👤 <b>Customer:</b> ${customer}
📞 <b>Phone:</b> <code>${phone}</code>
📍 <b>Address:</b> ${address}

📦 <b>Order Items:</b>
${itemListText}

⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
━━━━━━━━━━━━━━━━━━
✅ <i>Status: Payment Verified (${paymentStatus || 'confirmed'})</i>
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
export async function sendTelegramMessage(messageText) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in .env.local' }
  }

  if (token.includes('7123456789') || chatId.includes('1928374650')) {
    return {
      success: false,
      error: 'Sample/example token detected in .env.local! Please create your real bot on Telegram via @BotFather and replace TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID in .env.local.'
    }
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
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
