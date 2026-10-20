import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase'

export const archiveOrderIfCompleted = async (orderId, orderData = null) => {
  if (!orderId) return false
  
  try {
    let dataToArchive = orderData
    
    // If no data provided, fetch it first
    if (!dataToArchive) {
      const docRef = doc(db, 'orders', orderId)
      const docSnap = await getDoc(docRef)
      
      if (!docSnap.exists()) return false
      dataToArchive = docSnap.data()
    }
    
    // Check if the status indicates completion
    const status = (dataToArchive.orderStatus || dataToArchive.status || '').toLowerCase()
    const paymentStatus = (dataToArchive.paymentStatus || '').toLowerCase()
    
    const isCompleted = 
      status === 'delivered' || 
      status === 'cancelled' || 
      status === 'rejected' ||
      status === 'refunded' ||
      paymentStatus === 'refunded'
      
    if (isCompleted) {
      // 1. Write to orders_archive
      const archiveRef = doc(db, 'orders_archive', orderId)
      await setDoc(archiveRef, {
        ...dataToArchive,
        archivedAt: new Date().toISOString()
      }, { merge: true })
      
      // 2. Delete from active orders
      const activeRef = doc(db, 'orders', orderId)
      await deleteDoc(activeRef)
      
      console.log(`Order ${orderId} successfully archived.`)
      return true
    }
    
    return false
  } catch (error) {
    console.warn(`Failed to archive order ${orderId}:`, error)
    return false
  }
}
