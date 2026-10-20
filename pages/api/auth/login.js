import { generateAccessToken, generateRefreshToken, setRefreshTokenCookie } from '../../../lib/jwt'
import { ROLES, resolveRole } from '../../../lib/roles'
import { fetchFirestoreDoc, patchFirestoreDoc } from '../../../lib/firestoreServer'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { uid, email, displayName, photoURL } = req.body

    if (!uid || !email) {
      return res.status(400).json({ error: 'Missing required credentials (uid and email)' })
    }

    // 1. RBAC: resolve role server-side (Firestore user doc → admin email list) and embed in the JWT.
    let storedRole = null
    try {
      const existing = await fetchFirestoreDoc('users', uid)
      if (existing?.role) storedRole = existing.role
    } catch (e) {}
    const role = resolveRole({ email, role: storedRole })

    // 2. Generate Access Token (expires in 20m) & Refresh Token (expires in 60d)
    const tokenPayload = { uid, email, displayName: displayName || email.split('@')[0], role }
    const accessToken = generateAccessToken(tokenPayload)
    const refreshToken = generateRefreshToken(tokenPayload)

    // 3. Set HttpOnly Refresh Cookie
    setRefreshTokenCookie(res, refreshToken)

    // 4. Update user record in Firestore non-blocking
    patchFirestoreDoc('users', uid, {
      uid,
      email,
      name: displayName || email.split('@')[0],
      displayName: displayName || email.split('@')[0],
      photoURL: photoURL || '',
      role,
      latestRefreshToken: refreshToken,
      lastLogin: new Date().toISOString(),
    }).catch(e => console.warn('Firestore User Sync Notice:', e.message))

    return res.status(200).json({
      success: true,
      message: 'Login successful. Access token generated.',
      user: {
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        photoURL: photoURL || '',
        role,
      },
      accessToken,
    })
  } catch (error) {
    console.error('Login Auth API Error:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}
