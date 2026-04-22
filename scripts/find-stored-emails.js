// ========================================
// FIND EMAILS STILL STORED IN FIRESTORE
// ========================================
// Lists every profile that still has an `email` field, plus any teamspace
// join request whose display name is an email address. Read-only: it
// changes nothing.
//
// How to run:
//   1. Open the deployed app, sign in, and open the browser console.
//   2. Paste this whole file and press Enter.
//   3. Type: await findStoredEmails()
//
// Then remove each listed field in the Firebase console:
//   Firestore Database -> users -> (doc ID) -> hover the email field -> trash icon

async function findStoredEmails() {
    const db = firebase.firestore();

    const users = await db.collection('users').get();
    const withEmail = users.docs.filter(d => 'email' in d.data()).map(d => d.id);
    if (withEmail.length > 0) {
        console.warn(`${withEmail.length} profile(s) still store an email. Delete the field on these docs:`, withEmail);
    } else {
        console.log('No profiles store an email.');
    }

    const teamspaces = await db.collection('teamspaces')
        .where('accessLevel', 'in', ['open', 'closed'])
        .get();
    teamspaces.forEach(doc => {
        const emails = (doc.data().pendingRequests || []).filter(r => (r.displayName || '').includes('@'));
        if (emails.length > 0) {
            console.warn(`Teamspace "${doc.data().name}" (${doc.id}) has join requests showing an email. Approve or deny them to clear it.`);
        }
    });

    console.log('Done.');
}
