import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getFirestore, initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyClkMR4dDkQj-OC7zX6Jq_dSTAYWjtcQBU",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "badshah-web.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "badshah-web",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "badshah-web.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "326562136220",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:326562136220:web:f4ade2aea3437e6a976d59"
}

// Initialize Firebase app singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const auth = getAuth(app)

let db
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true
  })
} catch (e) {
  db = getFirestore(app)
}

const storage = getStorage(app)

// Use local persistence so login sessions persist when phone screen is locked or browser is closed
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() => {})
}

export { app, auth, db, storage }


