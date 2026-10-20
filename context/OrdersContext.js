import { createContext, useContext, useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './AuthContext'

const OrdersContext = createContext({})

export function OrdersProvider({ children }) {
  const { user, isAdmin } = useAuth()
  const [activeOrders, setActiveOrders] = useState([])

  // Shared Active Orders Listener (For Admin Desk live view)
  useEffect(() => {
    if (!user || !isAdmin) {
      setActiveOrders([])
      return
    }

    try {
      const unsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
        const fetched = snapshot.docs.map(d => {
          const data = d.data()
          let dateObj = new Date()
          if (data.createdAt?.toDate) {
            dateObj = data.createdAt.toDate()
          } else if (data.createdAtSeconds) {
            dateObj = new Date(data.createdAtSeconds * 1000)
          } else if (data.createdAt) {
            dateObj = new Date(data.createdAt)
          }

          return {
            id: d.id,
            ...data,
            dateObj
          }
        })

        fetched.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime())
        setActiveOrders(fetched)
      }, (err) => console.warn('Active orders listener notice:', err.message))

      return () => unsub()
    } catch (e) {}
  }, [user, isAdmin])

  return (
    <OrdersContext.Provider
      value={{
        activeOrders
      }}
    >
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrdersContext() {
  return useContext(OrdersContext)
}
