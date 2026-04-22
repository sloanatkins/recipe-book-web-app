// ========================================
// ONE-TIME MIGRATION (run BEFORE deploying the new firestore.rules)
// ========================================
// What it does:
//   1. Gives every teamspace a memberIds array that matches its members map.
//      The new rules and queries depend on memberIds.
//   2. Repairs teamspaces where joining turned `members` into an array
//      (the old arrayUnion bug). The owner is put back as 'owner'.
//   3. Reports recipes, cuisines, and ingredients with no owner and no
//      teamspace. Under the new rules nobody can read those, so check them.
//
// How to run:
//   1. Open the deployed app, sign in, and open the browser console.
//   2. Paste this whole file and press Enter.
//   3. Type: await migrateBeforeRules()
//
// It is safe to run more than once.

async function migrateBeforeRules() {
    const db = firebase.firestore();
    console.log('Starting migration...');

    // ── Teamspaces ──
    const teamspaces = await db.collection('teamspaces').get();
    let fixed = 0;

    for (const doc of teamspaces.docs) {
        const ts = doc.data();
        let members = ts.members;

        // Old join bug: members became an array of { userId, role, ... }
        if (Array.isArray(members)) {
            const rebuilt = {};
            members.forEach(m => {
                if (m && m.userId) {
                    rebuilt[m.userId] = { role: m.role || 'viewer', addedAt: m.joinedAt || null };
                }
            });
            members = rebuilt;
            console.log(`  Repaired members array on "${ts.name}"`);
        }

        members = members || {};

        // The owner always has to be in the map
        if (ts.ownerId && !members[ts.ownerId]) {
            members[ts.ownerId] = { role: 'owner', addedAt: null };
        }
        if (ts.ownerId) {
            members[ts.ownerId].role = 'owner';
        }

        const memberIds = Object.keys(members);
        await doc.ref.update({ members, memberIds });
        fixed++;
        console.log(`  ${ts.name}: ${memberIds.length} member(s)`);
    }
    console.log(`Teamspaces updated: ${fixed}`);

    // ── Orphaned content ──
    for (const name of ['recipes', 'cuisines', 'ingredients']) {
        const snap = await db.collection(name).get();
        const orphans = snap.docs.filter(d => {
            const data = d.data();
            return !data.userId && !data.teamspaceId;
        });
        if (orphans.length > 0) {
            console.warn(`${name}: ${orphans.length} doc(s) with no owner and no teamspace`,
                orphans.map(d => ({ id: d.id, title: d.data().title || d.data().name })));
        }
    }

    // ── Usernames the new rules would reject ──
    const users = await db.collection('users').get();
    const badNames = users.docs
        .map(d => d.data())
        .filter(u => u.username && !/^[A-Za-z0-9_]{3,40}$/.test(u.username));
    if (badNames.length > 0) {
        console.warn('Users whose username will need changing:', badNames.map(u => u.username));
    }

    console.log('Migration done. Now deploy the rules: firebase deploy --only firestore:rules');
}
