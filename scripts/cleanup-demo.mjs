import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, deleteDoc, getDocs, collection } from 'firebase/firestore'
import { readFileSync } from 'fs'

const env = {}
readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') })
const app = initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID })
const db = getFirestore(app)

await signInWithEmailAndPassword(getAuth(app), 'md.amanullahkhan1980@gmail.com', 'AMANULLAHPATNA2607')
const snap = await getDocs(collection(db, 'orders'))
for (const d of snap.docs) {
  if (d.id.includes('DIAG') || d.id === 'PERM_TEST_CREATE') {
    await deleteDoc(doc(db, 'orders', d.id))
    console.log('removed junk order:', d.id)
  }
}
console.log('cleanup done')
process.exit(0)
