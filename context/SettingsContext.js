import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'

const SettingsContext = createContext({})

export const defaultSettings = {
  restaurantName: 'Biryani Badshah',
  isStoreOpen: true,
  deliveryCharge: 40,
  gstPercentage: 18,
  openingTime: '11:00 AM',
  closingTime: '11:30 PM',
  supportPhone: '+91 96939 99890',
  storeUpiId: 'electrohousejsr@okicici',
  restaurantAddress: 'Phulwari Rd, Near Shaheed Bhagat Singh Chowk, Birla Colony, Phulwari Sharif, Patna, Bihar',
  announcementEnabled: false,
  announcementText: '',
  announcementType: 'info',
  googlePlaceId: ''
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'settings', 'restaurant'), (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setSettings({
            restaurantName: data.restaurantName || defaultSettings.restaurantName,
            isStoreOpen: data.isStoreOpen ?? true,
            deliveryCharge: typeof data.deliveryCharge === 'number' ? data.deliveryCharge : (Number(data.deliveryCharge) || 40),
            gstPercentage: typeof data.gstPercentage === 'number' ? data.gstPercentage : (Number(data.gstPercentage) || 18),
            openingTime: data.openingTime || defaultSettings.openingTime,
            closingTime: data.closingTime || defaultSettings.closingTime,
            supportPhone: data.supportPhone || defaultSettings.supportPhone,
            storeUpiId: (data.storeUpiId && !data.storeUpiId.includes('8271301179') && !data.storeUpiId.includes('Q441280679')) ? data.storeUpiId : defaultSettings.storeUpiId,
            restaurantAddress: data.restaurantAddress || defaultSettings.restaurantAddress,
            announcementEnabled: Boolean(data.announcementEnabled),
            announcementText: typeof data.announcementText === 'string' ? data.announcementText : '',
            announcementType: data.announcementType || 'info',
            googlePlaceId: typeof data.googlePlaceId === 'string' ? data.googlePlaceId : ''
          })
        }
      }, (err) => console.warn('Settings live sync notice:', err.message))

      return () => unsub()
    } catch (e) {}
  }, [])

  return (
    <SettingsContext.Provider value={{ settings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
