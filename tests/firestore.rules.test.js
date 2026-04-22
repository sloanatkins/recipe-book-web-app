// Security rules tests
// ====================
// Runs against the local Firestore emulator, so nothing touches the real
// database. Run with:  npm test
//
// Cast of characters:
//   alice - owns a personal recipe and the "Family" teamspace
//   bob   - editor in Family
//   cara  - viewer in Family
//   eve   - signed in, but not in anything (the attacker)

const fs = require('fs');
const path = require('path');
const {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails,
} = require('@firebase/rules-unit-testing');
const {
    doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
    collection, query, where, getDocs,
    arrayUnion, arrayRemove, deleteField, writeBatch,
} = require('firebase/firestore');

let testEnv;

// ── Setup ──

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'demo-recipe-book',
        firestore: {
            rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
        },
    });
});

after(async () => {
    await testEnv.cleanup();
});

beforeEach(async () => {
    await testEnv.clearFirestore();

    // Seed data with rules turned off
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();

        await setDoc(doc(db, 'recipes/alicePasta'), { userId: 'alice', title: 'Pasta' });

        await setDoc(doc(db, 'teamspaces/family'), {
            name: 'Family',
            ownerId: 'alice',
            accessLevel: 'default',
            members: {
                alice: { role: 'owner' },
                bob: { role: 'editor' },
                cara: { role: 'viewer' },
            },
            memberIds: ['alice', 'bob', 'cara'],
        });

        await setDoc(doc(db, 'teamspaces/openClub'), {
            name: 'Open Club',
            ownerId: 'alice',
            accessLevel: 'open',
            members: { alice: { role: 'owner' } },
            memberIds: ['alice'],
        });

        await setDoc(doc(db, 'teamspaces/closedClub'), {
            name: 'Closed Club',
            ownerId: 'alice',
            accessLevel: 'closed',
            members: { alice: { role: 'owner' } },
            memberIds: ['alice'],
            pendingRequests: [],
        });

        await setDoc(doc(db, 'recipes/familySoup'), { teamspaceId: 'family', userId: null, title: 'Soup' });

        await setDoc(doc(db, 'users/alice'), { uid: 'alice', username: 'alice' });
        await setDoc(doc(db, 'users/oldie'), { uid: 'oldie', username: 'oldie', email: 'oldie@example.com' });
        await setDoc(doc(db, 'users/eve'), { uid: 'eve', username: 'eve' });
        await setDoc(doc(db, 'usernames/alice'), { uid: 'alice' });
        await setDoc(doc(db, 'usernames/eve'), { uid: 'eve' });
        await setDoc(doc(db, 'usernames/bob'), { uid: 'bob' });

        await setDoc(doc(db, 'friendRequests/eveToAlice'), {
            fromUserId: 'eve', toUserId: 'alice',
            fromUsername: 'eve', toUsername: 'alice', status: 'pending',
        });
    });
});

const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

// ── Personal recipes ──

describe('personal recipes', () => {
    it('owner can read, update, and delete their recipe', async () => {
        const db = as('alice');
        await assertSucceeds(getDoc(doc(db, 'recipes/alicePasta')));
        await assertSucceeds(updateDoc(doc(db, 'recipes/alicePasta'), { title: 'Better Pasta' }));
        await assertSucceeds(deleteDoc(doc(db, 'recipes/alicePasta')));
    });

    it('other users cannot read, edit, or delete it', async () => {
        const db = as('eve');
        await assertFails(getDoc(doc(db, 'recipes/alicePasta')));
        await assertFails(updateDoc(doc(db, 'recipes/alicePasta'), { title: 'pwned' }));
        await assertFails(deleteDoc(doc(db, 'recipes/alicePasta')));
    });

    it('signed-out visitors cannot read it', async () => {
        await assertFails(getDoc(doc(anon(), 'recipes/alicePasta')));
    });

    it('nobody can list every recipe', async () => {
        await assertFails(getDocs(collection(as('eve'), 'recipes')));
        await assertFails(getDocs(collection(anon(), 'recipes')));
    });

    it('you can list your own recipes', async () => {
        const db = as('alice');
        await assertSucceeds(getDocs(query(collection(db, 'recipes'), where('userId', '==', 'alice'))));
    });

    it('you cannot create a recipe in someone else\'s name', async () => {
        await assertFails(addDoc(collection(as('eve'), 'recipes'), { userId: 'alice', title: 'planted' }));
        await assertSucceeds(addDoc(collection(as('eve'), 'recipes'), { userId: 'eve', title: 'mine' }));
    });

    it('you cannot change who owns a recipe', async () => {
        await assertFails(updateDoc(doc(as('alice'), 'recipes/alicePasta'), { userId: 'eve' }));
    });
});

// ── Teamspace content ──

describe('teamspace recipes', () => {
    it('members can read and list them, outsiders cannot', async () => {
        await assertSucceeds(getDoc(doc(as('cara'), 'recipes/familySoup')));
        await assertSucceeds(getDocs(query(collection(as('cara'), 'recipes'), where('teamspaceId', '==', 'family'))));
        await assertFails(getDoc(doc(as('eve'), 'recipes/familySoup')));
        await assertFails(getDocs(query(collection(as('eve'), 'recipes'), where('teamspaceId', '==', 'family'))));
    });

    it('editors can edit, viewers cannot', async () => {
        await assertSucceeds(updateDoc(doc(as('bob'), 'recipes/familySoup'), { title: 'Tomato Soup' }));
        await assertFails(updateDoc(doc(as('cara'), 'recipes/familySoup'), { title: 'nope' }));
        await assertFails(updateDoc(doc(as('eve'), 'recipes/familySoup'), { title: '<img src=x onerror=alert(1)>' }));
    });

    it('editors can add recipes, viewers and outsiders cannot', async () => {
        await assertSucceeds(addDoc(collection(as('bob'), 'recipes'), { teamspaceId: 'family', userId: 'bob' }));
        await assertFails(addDoc(collection(as('cara'), 'recipes'), { teamspaceId: 'family', userId: 'cara' }));
        await assertFails(addDoc(collection(as('eve'), 'recipes'), { teamspaceId: 'family', userId: 'eve' }));
    });

    it('a recipe cannot be moved into a teamspace you cannot edit', async () => {
        await assertFails(updateDoc(doc(as('alice'), 'recipes/alicePasta'), { teamspaceId: 'closedClubNope' }));
        await assertFails(updateDoc(doc(as('bob'), 'recipes/familySoup'), { teamspaceId: 'openClub' }));
    });

    it('the owner can move their own draft into a teamspace they edit', async () => {
        await assertSucceeds(updateDoc(doc(as('alice'), 'recipes/alicePasta'), { teamspaceId: 'family' }));
    });
});

// ── Teamspaces ──

describe('teamspaces', () => {
    it('you can create one where you are the only member and owner', async () => {
        await assertSucceeds(addDoc(collection(as('eve'), 'teamspaces'), {
            name: 'Eve Eats', ownerId: 'eve', accessLevel: 'default',
            members: { eve: { role: 'owner' } }, memberIds: ['eve'],
        }));
    });

    it('you cannot create one that adds other people or makes someone else owner', async () => {
        await assertFails(addDoc(collection(as('eve'), 'teamspaces'), {
            name: 'Trap', ownerId: 'eve',
            members: { eve: { role: 'owner' }, alice: { role: 'viewer' } }, memberIds: ['eve', 'alice'],
        }));
        await assertFails(addDoc(collection(as('eve'), 'teamspaces'), {
            name: 'Framed', ownerId: 'alice',
            members: { alice: { role: 'owner' } }, memberIds: ['alice'],
        }));
    });

    it('members can find their teamspaces with a query', async () => {
        const q = query(collection(as('bob'), 'teamspaces'), where('memberIds', 'array-contains', 'bob'));
        await assertSucceeds(getDocs(q));
    });

    it('outsiders cannot see a default teamspace but can see open and closed ones', async () => {
        await assertFails(getDoc(doc(as('eve'), 'teamspaces/family')));
        await assertSucceeds(getDoc(doc(as('eve'), 'teamspaces/openClub')));
        await assertSucceeds(getDocs(query(collection(as('eve'), 'teamspaces'), where('accessLevel', 'in', ['open', 'closed']))));
    });

    it('outsiders cannot add themselves to a default teamspace', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'teamspaces/family'), {
            'members.eve': { role: 'owner' }, memberIds: arrayUnion('eve'),
        }));
    });

    it('anyone can join an open teamspace, but only as a viewer', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'teamspaces/openClub'), {
            'members.eve': { role: 'editor' }, memberIds: arrayUnion('eve'),
        }));
        await assertSucceeds(updateDoc(doc(as('eve'), 'teamspaces/openClub'), {
            'members.eve': { role: 'viewer' }, memberIds: arrayUnion('eve'),
        }));
    });

    it('members and memberIds have to stay in sync', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'teamspaces/openClub'), {
            'members.eve': { role: 'viewer' },
        }));
    });

    it('you can request to join a closed teamspace for yourself only', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'teamspaces/closedClub'), {
            pendingRequests: arrayUnion({ userId: 'bob', displayName: 'Bob' }),
        }));
        await assertSucceeds(updateDoc(doc(as('eve'), 'teamspaces/closedClub'), {
            pendingRequests: arrayUnion({ userId: 'eve', displayName: 'Eve' }),
        }));
    });

    it('a member can leave, but cannot remove someone else', async () => {
        await assertFails(updateDoc(doc(as('cara'), 'teamspaces/family'), {
            'members.bob': deleteField(), memberIds: arrayRemove('bob'),
        }));
        await assertSucceeds(updateDoc(doc(as('cara'), 'teamspaces/family'), {
            'members.cara': deleteField(), memberIds: arrayRemove('cara'),
        }));
    });

    it('only the owner can change roles or access', async () => {
        await assertFails(updateDoc(doc(as('bob'), 'teamspaces/family'), { 'members.bob.role': 'owner' }));
        await assertFails(updateDoc(doc(as('bob'), 'teamspaces/family'), { accessLevel: 'open' }));
        await assertSucceeds(updateDoc(doc(as('alice'), 'teamspaces/family'), { 'members.bob.role': 'viewer' }));
    });

    it('nobody can take over ownership', async () => {
        await assertFails(updateDoc(doc(as('bob'), 'teamspaces/family'), { ownerId: 'bob' }));
    });

    it('only the owner can delete', async () => {
        await assertFails(deleteDoc(doc(as('bob'), 'teamspaces/family')));
        await assertSucceeds(deleteDoc(doc(as('alice'), 'teamspaces/family')));
    });
});

// ── Friends ──

describe('friends', () => {
    it('you can only send friend requests as yourself', async () => {
        const base = { toUserId: 'alice', fromUsername: 'eve', toUsername: 'alice', status: 'pending' };
        await assertSucceeds(addDoc(collection(as('eve'), 'friendRequests'), { ...base, fromUserId: 'eve' }));
        await assertFails(addDoc(collection(as('eve'), 'friendRequests'), { ...base, fromUserId: 'bob' }));
    });

    it('a request cannot claim to come from someone else\'s username', async () => {
        await assertFails(addDoc(collection(as('eve'), 'friendRequests'), {
            fromUserId: 'eve', toUserId: 'alice', status: 'pending',
            fromUsername: 'bob', toUsername: 'alice',
        }));
    });

    it('usernames in requests are validated', async () => {
        await assertFails(addDoc(collection(as('eve'), 'friendRequests'), {
            fromUserId: 'eve', toUserId: 'alice', status: 'pending',
            fromUsername: "eve'); alert(1); //", toUsername: 'alice',
        }));
    });

    it('only the recipient can accept a request', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'friendRequests/eveToAlice'), { status: 'accepted' }));
        await assertSucceeds(updateDoc(doc(as('alice'), 'friendRequests/eveToAlice'), { status: 'accepted' }));
    });

    it('accepting a request creates the friendship in the same write', async () => {
        const db = as('alice');
        const batch = writeBatch(db);
        batch.update(doc(db, 'friendRequests/eveToAlice'), { status: 'accepted' });
        batch.set(doc(db, 'friends/eveToAlice'), { requestId: 'eveToAlice', users: ['alice', 'eve'] });
        await assertSucceeds(batch.commit());
    });

    it('the sender cannot make the friendship themselves', async () => {
        await assertFails(setDoc(doc(as('eve'), 'friends/eveToAlice'), { requestId: 'eveToAlice', users: ['eve', 'alice'] }));
    });

    it('you cannot create a friendship with no accepted request', async () => {
        await assertFails(setDoc(doc(as('eve'), 'friends/made-up'), { requestId: 'made-up', users: ['eve', 'alice'] }));
        await assertFails(addDoc(collection(as('eve'), 'friends'), { users: ['alice', 'bob'] }));
    });
});

// ── Profiles ──

describe('profiles', () => {
    it('you can edit your own profile but not someone else\'s', async () => {
        await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { displayName: 'Alice' }));
        await assertFails(updateDoc(doc(as('eve'), 'users/alice'), { displayName: 'hacked' }));
    });

    it('usernames have to be letters, numbers, and underscores', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'users/eve'), { username: '<b>eve</b>' }));
    });

    it('changing your username works when you reserve it in the same write', async () => {
        const db = as('eve');
        const batch = writeBatch(db);
        batch.update(doc(db, 'users/eve'), { username: 'eve_2' });
        batch.set(doc(db, 'usernames/eve_2'), { uid: 'eve' });
        await assertSucceeds(batch.commit());
    });

    it('you cannot take a username without reserving it', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'users/eve'), { username: 'unreserved' }));
    });

    it('you cannot use someone else\'s username', async () => {
        await assertFails(updateDoc(doc(as('eve'), 'users/eve'), { username: 'alice' }));
    });

    it('profiles can never store an email', async () => {
        await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { email: 'alice@example.com' }));
        const db = as('newbie');
        const batch = writeBatch(db);
        batch.set(doc(db, 'users/newbie'), { uid: 'newbie', username: 'newbie1234', email: 'n@example.com' });
        batch.set(doc(db, 'usernames/newbie1234'), { uid: 'newbie' });
        await assertFails(batch.commit());
    });

    it('an old profile can remove its stored email, and nothing else saves until it does', async () => {
        await assertFails(updateDoc(doc(as('oldie'), 'users/oldie'), { displayName: 'Oldie' }));
        await assertSucceeds(updateDoc(doc(as('oldie'), 'users/oldie'), { email: deleteField() }));
        await assertSucceeds(updateDoc(doc(as('oldie'), 'users/oldie'), { displayName: 'Oldie' }));
    });

    it('a new user can sign up with a profile and username together', async () => {
        const db = as('newbie');
        const batch = writeBatch(db);
        batch.set(doc(db, 'users/newbie'), { uid: 'newbie', username: 'newbie1234' });
        batch.set(doc(db, 'usernames/newbie1234'), { uid: 'newbie' });
        await assertSucceeds(batch.commit());
    });

    it('you can only reserve a username for yourself', async () => {
        await assertSucceeds(setDoc(doc(as('eve'), 'usernames/eve_2'), { uid: 'eve' }));
        await assertFails(setDoc(doc(as('eve'), 'usernames/alice_2'), { uid: 'alice' }));
    });
});
