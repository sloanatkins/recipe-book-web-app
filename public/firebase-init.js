// Firebase initialization for account page
// Firebase app is already initialized in firebase-config.js
// This file just does additional setup if needed

console.log('🔥 Firebase init loaded for account page');

// Verify Firebase is available
if (typeof firebase !== 'undefined') {
    console.log('✅ Firebase SDK ready');
    if (firebase.auth && firebase.firestore) {
        console.log('✅ Auth and Firestore services available');
    }
} else {
    console.error('❌ Firebase not loaded!');
}