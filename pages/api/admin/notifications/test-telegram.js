import { withAuth } from '../../../../lib/authMiddleware'
import { sendTelegramMessage } from '../../../../lib/telegramNotification'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return res.status(400).json({
      error: 'Telegram Bot credentials not set in server environment. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local'
    })
  }

  const testMessage = `
🔔 <b>TELEGRAM BOT TEST ALERT</b>
━━━━━━━━━━━━━━━━━━
✅ Your Telegram bot is successfully connected to <b>Biryani Badshah</b>!

📦 <b>Sample Order:</b> #BB-PATNA-TEST99
💰 <b>Amount:</b> ₹499 (Paid via UPI)
👤 <b>Customer:</b> Test Admin
📍 <b>Address:</b> Boring Road, Patna

🎉 <i>You will receive instant alerts here whenever a new order is placed!</i>
`.trim()

  const result = await sendTelegramMessage(testMessage)

  if (result.success) {
    return res.status(200).json({
      success: true,
      message: '✅ Telegram test alert sent successfully! Check your Telegram group/channel.'
    })
  } else {
    return res.status(500).json({
      error: result.error || 'Failed to send Telegram test alert. Check Bot Token & Chat ID.'
    })
  }
}

export default withAuth(handler, true)
