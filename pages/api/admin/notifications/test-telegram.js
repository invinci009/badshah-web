import { withAuth } from '../../../../lib/authMiddleware'
import { sendTelegramMessage } from '../../../../lib/telegramNotification'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { telegramBotToken, telegramChatId } = req.body || {}

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

  const result = await sendTelegramMessage(testMessage, telegramBotToken, telegramChatId)

  if (result.success) {
    return res.status(200).json({
      success: true,
      message: '✅ Telegram test alert sent successfully! Check your Telegram group/channel.'
    })
  } else {
    let errorMsg = result.error || 'Failed to send Telegram test alert.'
    if (errorMsg.includes('Unauthorized') || errorMsg.includes('invalid token') || errorMsg.includes('401')) {
      errorMsg = 'Unauthorized: Expired or invalid token. Please ensure your Telegram bot token is correct and active. You can get or generate a fresh token from @BotFather on Telegram.'
    } else if (errorMsg.includes('chat not found') || errorMsg.includes('400')) {
      errorMsg = `Chat not found (${result.error}). Make sure your bot is added as an Admin to your Telegram group/channel, or send /start to your bot directly.`
    }
    return res.status(400).json({
      error: errorMsg
    })
  }
}

export default withAuth(handler, true)
