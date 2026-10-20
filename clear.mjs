import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAZ6ACAX4aYc_e3mBbFCnHTz5E3_Omodys",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "badshah-web.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "badshah-web",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "badshah-web.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "326562136220",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:326562136220:web:f4ade2aea3437e6a976d59"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearDatabase() {
    console.log('--- STARTING DATABASE CLEANUP ---');

    // 1. Clear active 'orders'
    console.log('Fetching active orders...');
    const ordersSnap = await getDocs(collection(db, 'orders'));
    console.log(`Found ${ordersSnap.docs.length} documents in 'orders' collection.`);
    let activeDeleted = 0;
    for (const document of ordersSnap.docs) {
        await deleteDoc(doc(db, 'orders', document.id));
        console.log(`Deleted order ${document.id}`);
        activeDeleted++;
    }
    console.log(`Deleted ${activeDeleted} active orders.`);

    // 2. Clear 'orders_archive'
    console.log('\nFetching archived orders...');
    const archiveSnap = await getDocs(collection(db, 'orders_archive'));
    console.log(`Found ${archiveSnap.docs.length} documents in 'orders_archive' collection.`);
    let archiveDeleted = 0;
    for (const document of archiveSnap.docs) {
        await deleteDoc(doc(db, 'orders_archive', document.id));
        console.log(`Deleted archived order ${document.id}`);
        archiveDeleted++;
    }
    console.log(`Deleted ${archiveDeleted} archived orders.`);

    // 3. Reset coupon stats in 'coupons'
    console.log('\nFetching coupons to reset usage stats...');
    const couponsSnap = await getDocs(collection(db, 'coupons'));
    console.log(`Found ${couponsSnap.docs.length} documents in 'coupons' collection.`);
    for (const couponDoc of couponsSnap.docs) {
        await updateDoc(doc(db, 'coupons', couponDoc.id), {
            usedCount: 0,
            usedByUsers: {}
        });
        console.log(`Reset usage stats for coupon ${couponDoc.id} (${couponDoc.data().couponCode || 'N/A'})`);
    }

    console.log('\n--- CLEANUP COMPLETE ---');
    console.log(`Total Orders Deleted: ${activeDeleted + archiveDeleted}`);
    console.log(`Revenue reset to ₹0`);
    process.exit(0);
}

clearDatabase().catch(err => {
    console.error('Cleanup Error:', err);
    process.exit(1);
});
