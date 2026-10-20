import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, signOut } from 'firebase/auth'
import { getFirestore, doc, setDoc, updateDoc, getDocs, collection, serverTimestamp, limit } from 'firebase/firestore'
import { readFileSync } from 'fs'

const env = {}
readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') })
const app = initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID })
const db = getFirestore(app)

const snap = await getDocs(collection(db, 'orders'))
const all = snap.docs
console.log('orders visible READ:', all.length)

const t = await (async () => {
  const { user } = await signInAnonymously(getAuth(app))
  console.log('anon uid:', user.uid)
  try {
    await setDoc(doc(db, 'orders', 'PERM_TEST_CREATE'), { test: true, createdAt: serverTimestamp() })
    console.log('CREATE orders: ALLOWED')
    await updateDoc(doc(db, 'orders', 'PERM_TEST_CREATE'), { test2: true })
    console.log('UPDATE own-created: ALLOWED')
    await deleteDocSafe()
    async function deleteDocSafe() {
      const { deleteDoc } = await import('firebase/firestore')
      await deleteDoc(doc(db, 'orders', 'PERM_TEST_CREATE')).catch(e => console.log('DELETE orders:', e.code))
    }
  } catch (e1) {
    console.log('CREATE/UPDATE orders:', e1.code || e1.message)
  }
  // try updating one of the demo orders
  const demo = all.find(d => /^BB-PATNA-[A-Z0-9-]+$/.test(d.id) && d.data().customerName)
  if (demo) {
    try {
      await updateDoc(doc(db, 'orders', demo.id), { permProbeAt: serverTimestamp() })
      console.log('UPDATE demo order', demo.id, ': ALLOWED')
      await updateDoc(doc(db, 'orders', demo.id), { permProbeAt: null }).catch(() => {})
    } catch (e2) {
      console.log('UPDATE demo order:', e2.code || e2.message)
    }
  }
  await signOut(getAuth(app))
})()
