import { clearRefreshTokenCookie } from '../../../lib/jwt'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    clearRefreshTokenCookie(res)
    return res.status(200).json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout Error:', error)
    return res.status(500).json({ error: 'Failed to logout' })
  }
}
