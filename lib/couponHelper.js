import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Atomically increments coupon usage count and tracks user ID when an order is placed.
 */
export async function trackCouponUsage(couponCode, userId) {
  if (!couponCode) return false

  const cleanCode = String(couponCode).toUpperCase().trim()
  if (cleanCode === 'CODERSAPIEN50') return true // Unlimited secret promo

  try {
    const q = query(collection(db, 'coupons'), where('couponCode', '==', cleanCode))
    const snap = await getDocs(q)

    if (!snap.empty) {
      const couponDoc = snap.docs[0]
      const updateData = {
        usedCount: increment(1)
      }
      if (userId) {
        updateData[`usedByUsers.${userId}`] = increment(1)
      }
      await updateDoc(doc(db, 'coupons', couponDoc.id), updateData)
      console.log(`Coupon ${cleanCode} usage successfully tracked for user ${userId || 'guest'}`)
      return true
    }
  } catch (err) {
    console.warn(`Coupon usage track notice for ${cleanCode}:`, err.message)
  }
  return false
}
