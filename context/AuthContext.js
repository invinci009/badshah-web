import { createContext, useContext, useEffect, useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext({
  user: null,
  userProfile: null,
  isAdmin: false,
  accessToken: null,
  loading: true,
  isAuthModalOpen: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  loginWithEmail: async () => {},
  logout: async () => {},
  updateUserProfileData: async () => {}
})

const ADMIN_EMAILS = [
  'admin@biryanibadshah.com',
  'admin@biryanibadshah.in',
  'amaanullah2607@gmail.com',
  'md.amanullahkhan1980@gmail.com',
  'admin@gmail.com',
  'admin@admin.com',
  'admin'
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  const openAuthModal = () => setIsAuthModalOpen(true)
  const closeAuthModal = () => setIsAuthModalOpen(false)

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const userRef = doc(db, 'users', fbUser.uid)
          const userSnap = await getDoc(userRef)

          const cleanEmail = (fbUser.email || '').toLowerCase()
          const isAdminEmail = ADMIN_EMAILS.includes(cleanEmail) || cleanEmail.startsWith('admin@')

          let profileData = {
            uid: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Foodie User',
            email: fbUser.email,
            photoURL: fbUser.photoURL || '',
            phone: fbUser.phoneNumber || '',
            role: isAdminEmail ? 'admin' : 'customer',
            lastLogin: new Date().toISOString(),
            defaultAddress: '',
            walletBalance: 0,
            isBlocked: false
          }

          if (userSnap.exists()) {
            profileData = { ...profileData, ...userSnap.data(), role: isAdminEmail ? 'admin' : (userSnap.data().role || 'customer'), lastLogin: new Date().toISOString() }
            await updateDoc(userRef, { role: profileData.role, lastLogin: serverTimestamp() }).catch(() => {})
          } else {
            // First time user registration in Firestore
            await setDoc(userRef, {
              ...profileData,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp()
            }).catch(() => {})
          }

          setUserProfile(profileData)
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: profileData.name,
            photoURL: profileData.photoURL,
            role: profileData.role
          })

          // Close auth modal and ensure backend JWT/cookie session is established
          closeAuthModal()
          syncWithBackend(fbUser)
        } catch (err) {
          console.warn('Firestore user sync notice:', err.message)
          const cleanEmail = (fbUser.email || '').toLowerCase()
          const isAdminEmail = ADMIN_EMAILS.includes(cleanEmail) || cleanEmail.startsWith('admin@')
          const fallbackUser = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Foodie User',
            photoURL: fbUser.photoURL || '',
            role: isAdminEmail ? 'admin' : 'customer'
          }
          setUser(fallbackUser)
          closeAuthModal()
          syncWithBackend(fbUser)
        }
      } else {
        setUser(null)
        setUserProfile(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Auto-restore session via HttpOnly refresh cookie on app mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          setAccessToken(data.accessToken)
        }
      } catch (err) {
        console.warn('Session restoration notice:', err.message)
      }
    }
    restoreSession()
  }, [])

  // Sync token & user with backend API after Firebase login
  const syncWithBackend = async (firebaseUser) => {
    if (!firebaseUser || !firebaseUser.uid) return

    // 1. Immediately set user state and close modal for instant UI response
    setUser(prev => ({
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Foodie User',
      photoURL: firebaseUser.photoURL || '',
      role: prev?.role || 'customer'
    }))
    closeAuthModal()

    // 2. Sync JWT & HttpOnly cookie with server in background
    try {
      const payload = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Foodie User',
        photoURL: firebaseUser.photoURL || '',
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        setAccessToken(data.accessToken)
      }
    } catch (err) {
      console.warn('Backend Auth Sync Notice:', err.message)
    }
  }

  // ID & Password Auth (Login or Signup with ADMIN support & Email Verification)
  const loginWithEmail = async (identifier, password, isSignup = false, displayName = '') => {
    let email = (identifier || '').trim()
    const isAdminCredential = (email.toUpperCase() === 'ADMIN' || email.toLowerCase() === 'admin@biryanibadshah.com' || email.toLowerCase() === 'admin') && password === 'AMANULLAHPATNA2607'

    if (email.toUpperCase() === 'ADMIN' || email.toLowerCase() === 'admin') {
      email = 'admin@biryanibadshah.com'
    }

    // Email format validation for signup
    if (isSignup) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email address format. Please enter a valid Google / Email address (e.g. name@gmail.com).')
      }
    } else {
      if (!email.includes('@') && email !== 'admin@biryanibadshah.com') {
        email = `${email.toLowerCase()}@biryanibadshah.com`
      }
    }

    try {
      let userCredential
      let emailVerifiedSent = false

      if (isSignup) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password)
        if (displayName && userCredential.user) {
          await updateProfile(userCredential.user, { displayName })
        }
        // Send Email Verification link to the user's Google / Email inbox
        try {
          if (userCredential.user) {
            await sendEmailVerification(userCredential.user)
            emailVerifiedSent = true
          }
        } catch (evErr) {
          console.warn('Email verification send notice:', evErr.message)
        }
      } else {
        try {
          userCredential = await signInWithEmailAndPassword(auth, email, password)
        } catch (signInErr) {
          if (isAdminCredential || signInErr?.code === 'auth/user-not-found' || signInErr?.code === 'auth/invalid-credential') {
            if (isAdminCredential) {
              try {
                userCredential = await createUserWithEmailAndPassword(auth, email, password)
                if (userCredential?.user) {
                  await updateProfile(userCredential.user, { displayName: 'Store Admin' })
                }
              } catch (createErr) {
                if (createErr?.code === 'auth/email-already-in-use') {
                  throw signInErr
                }
                throw createErr
              }
            } else {
              throw signInErr
            }
          } else {
            throw signInErr
          }
        }
      }

      const fbUser = userCredential.user
      if (displayName) fbUser.displayName = displayName

      await syncWithBackend(fbUser)
      return { success: true, emailVerifiedSent }
    } catch (error) {
      console.error('ID / Password Auth Error:', error)
      throw error
    }
  }

  // Update User Profile in Firestore
  const updateUserProfileData = async (data) => {
    if (!user) return
    try {
      const userRef = doc(db, 'users', user.uid)
      await updateDoc(userRef, { ...data, updatedAt: serverTimestamp() })
      setUserProfile(prev => ({ ...prev, ...data }))
      if (data.name) {
        setUser(prev => ({ ...prev, displayName: data.name }))
      }
    } catch (err) {
      console.error('Update Profile Error:', err)
      throw err
    }
  }

  // Logout
  const logout = async () => {
    try {
      await firebaseSignOut(auth)
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.warn('Logout notice:', err)
    } finally {
      setUser(null)
      setUserProfile(null)
      setAccessToken(null)
    }
  }

  const currentEmail = (user?.email || userProfile?.email || '').toLowerCase().trim()
  const userRole = (userProfile?.role || user?.role || 'customer').toLowerCase()
  const isAdmin = Boolean(user && (userRole === 'admin' || ADMIN_EMAILS.includes(currentEmail) || currentEmail.startsWith('admin@')))

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        userRole: isAdmin ? 'admin' : userRole,
        isAdmin,
        isStaff: isAdmin ? false : userRole === 'staff',
        accessToken,
        loading,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        loginWithEmail,
        logout,
        updateUserProfileData
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

