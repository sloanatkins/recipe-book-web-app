// ========================================
// ACCOUNT PAGE JAVASCRIPT - FIXED
// ========================================

console.log('🟢 Account.js loaded!');

let currentUser = null;
let userProfile = null;

// Placeholder avatars for people without a photo
const DEFAULT_USER_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>');
const DEFAULT_MEMBER_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>');

// ========================================
// INITIALIZATION
// ========================================

firebase.auth().onAuthStateChanged(async (user) => {
    console.log('🟢 Auth state changed:', user ? user.email : 'No user');
    
    if (!user) {
        console.log('❌ No user logged in, redirecting to index.html');
        window.location.href = '/index.html';
        return;
    }
    
    currentUser = user;
    console.log('🟢 Current user set:', currentUser.uid);
    
    try {
        await loadUserProfile();
        await checkUsernameSetup();
        await loadStats();
        await loadFriendsData(); // Load friend system data
        await loadTeamspaces(); // Load teamspaces
        
        setupEventListeners();
        setupTabSwitching();
        setupTeamspaceSettingsTabs(); // Setup teamspace modal tabs
        setupTeamspaceAccessDropdown();

        
        // Hide loading overlay with fade
        const loadingOverlay = document.getElementById('account-loading');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
            setTimeout(() => {
                loadingOverlay.remove();
            }, 300);
        }
        
        console.log('✅ All initialization complete!');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        
        // Hide loading and show error
        const loadingOverlay = document.getElementById('account-loading');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        
        alert('Error loading account. Please check Firestore permissions.');
    }
});

// ========================================
// USER PROFILE
// ========================================

async function loadUserProfile() {
    console.log('📥 Loading user profile...');
    try {
        const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            userProfile = userDoc.data();
            await removeStoredEmail(currentUser.uid, userProfile);
            console.log('✅ User profile loaded:', userProfile);
        } else {
            console.log('⚠️ No profile exists, creating new one...');
            // Generate random username from email
            const randomUsername = generateUsernameFromEmail(currentUser.email);
            console.log('🎲 Generated username:', randomUsername);
            
            // Create initial user profile
            // No email here on purpose: profiles are readable by other users,
            // and Firebase Auth already has the email for the signed-in person
            userProfile = {
                uid: currentUser.uid,
                displayName: currentUser.displayName || '',
                photoURL: currentUser.photoURL || '',
                username: randomUsername,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Save the profile and reserve the username in one batch. The rules
            // only accept a username that's reserved in the same write.
            const batch = firebase.firestore().batch();
            batch.set(firebase.firestore().collection('users').doc(currentUser.uid), userProfile);
            batch.set(firebase.firestore().collection('usernames').doc(randomUsername.toLowerCase()), {
                uid: currentUser.uid
            });
            await batch.commit();
            console.log('✅ User profile created and username reserved:', randomUsername);
        }
        
        displayUserProfile();
    } catch (error) {
        console.error('❌ Error loading user profile:', error);
        
        // If permission denied, create minimal profile from Firebase Auth
        if (error.code === 'permission-denied') {
            console.log('⚠️ Permission denied, using Firebase Auth data only');
            const randomUsername = generateUsernameFromEmail(currentUser.email);
            userProfile = {
                uid: currentUser.uid,
                displayName: currentUser.displayName || '',
                photoURL: currentUser.photoURL || '',
                username: randomUsername,
            };
            displayUserProfile();
            alert('⚠️ Firestore permissions issue. Some features may not work. Please check your security rules.');
        } else {
            throw error;
        }
    }
}

function generateUsernameFromEmail(email) {
    // Get part before @ and clean it
    const baseName = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    // Add random 4 digits
    const random = Math.floor(1000 + Math.random() * 9000);
    return baseName + random;
}

function displayUserProfile() {
    console.log('🖼️ Displaying user profile...');
    
    if (!userProfile) {
        console.error('❌ userProfile is null!');
        return;
    }
    
    // Photo
    const photoElement = document.getElementById('profile-photo');
    if (photoElement) {
        if (userProfile.photoURL) {
            photoElement.src = userProfile.photoURL;
            console.log('✅ Profile photo set from URL');
        } else {
            photoElement.src = 'data:image/svg+xml,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            `);
            console.log('✅ Default profile photo set');
        }
    }
    
    // Name
    const nameElement = document.getElementById('profile-display-name');
    if (nameElement) {
        nameElement.value = userProfile.displayName || '';
        console.log('✅ Display name set:', userProfile.displayName);
    }
    
    // Username
    const usernameElement = document.getElementById('profile-username');
    if (usernameElement) {
        usernameElement.textContent = userProfile.username ? `@${userProfile.username}` : '@username';
        console.log('✅ Username displayed:', userProfile.username);
    }
    
    // Email
    const emailElement = document.getElementById('profile-email');
    if (emailElement) {
        // Comes from the login, not Firestore, so only you ever see it
        emailElement.textContent = currentUser.email || '';
        console.log('✅ Email displayed');
    }
    
    // Workspace Name
    const workspaceNameInput = document.getElementById('workspace-name');
    if (workspaceNameInput) {
        workspaceNameInput.value = userProfile.workspaceName || 'My Recipe Book';
        console.log('✅ Workspace name set:', userProfile.workspaceName || 'My Recipe Book');
    }
}

// ========================================
// USERNAME MANAGEMENT
// ========================================

async function checkUsernameSetup() {
    if (!userProfile || !userProfile.username) {
        console.log('⚠️ No username, showing setup modal');
        const modal = document.getElementById('username-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }
}

async function validateUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    
    if (username.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }
    
    if (username.length > 20) {
        return { valid: false, error: 'Username must be 20 characters or less' };
    }
    
    try {
        const usernameDoc = await firebase.firestore().collection('usernames').doc(username.toLowerCase()).get();
        if (usernameDoc.exists && usernameDoc.data().uid !== currentUser.uid) {
            return { valid: false, error: 'Username is already taken' };
        }
    } catch (error) {
        console.warn('Could not check username availability:', error);
    }
    
    return { valid: true };
}

async function saveUsername(username) {
    console.log('💾 Saving username:', username);
    try {
        const validation = await validateUsername(username);
        if (!validation.valid) {
            console.log('❌ Username validation failed:', validation.error);
            return { success: false, error: validation.error };
        }
        
        const batch = firebase.firestore().batch();
        
        // Update user profile
        const userRef = firebase.firestore().collection('users').doc(currentUser.uid);
        batch.update(userRef, { username: username });
        
        // Reserve new username
        const usernameRef = firebase.firestore().collection('usernames').doc(username.toLowerCase());
        batch.set(usernameRef, { uid: currentUser.uid });
        
        // Delete old username if exists
        if (userProfile && userProfile.username) {
            const oldUsernameRef = firebase.firestore().collection('usernames').doc(userProfile.username.toLowerCase());
            batch.delete(oldUsernameRef);
        }
        
        await batch.commit();
        if (userProfile) {
            userProfile.username = username;
        }
        displayUserProfile();
        console.log('✅ Username saved successfully');
        
        return { success: true };
    } catch (error) {
        console.error('❌ Error saving username:', error);
        return { success: false, error: 'Failed to save username. Check Firestore permissions.' };
    }
}

// ========================================
// STATS
// ========================================

async function loadStats() {
    console.log('📊 Loading stats...');
    try {
        // Count recipes
        const recipesSnapshot = await firebase.firestore()
            .collection('recipes')
            .where('userId', '==', currentUser.uid)
            .get();
        const recipeCount = document.getElementById('recipe-count');
        if (recipeCount) {
            recipeCount.textContent = recipesSnapshot.size;
            console.log('✅ Recipe count:', recipesSnapshot.size);
        }
        
        // Count friends
        const friendsSnapshot = await firebase.firestore()
            .collection('friends')
            .where('users', 'array-contains', currentUser.uid)
            .get();
        const friendCount = document.getElementById('friend-count');
        if (friendCount) {
            friendCount.textContent = friendsSnapshot.size;
            console.log('✅ Friend count:', friendsSnapshot.size);
        }
        
        // Count pending requests
        const requestsSnapshot = await firebase.firestore()
            .collection('friendRequests')
            .where('toUserId', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        const pendingCount = document.getElementById('pending-count');
        if (pendingCount) {
            pendingCount.textContent = requestsSnapshot.size;
            console.log('✅ Pending count:', requestsSnapshot.size);
        }
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}

// ========================================
// FRIEND SYSTEM
// ========================================

let searchTimeout = null;
let friendsData = {
    friends: [],
    requests: [],
    sentRequests: []
};

// Real-time user search
async function searchUsers(searchTerm) {
    console.log('🔍 Searching users:', searchTerm);
    
    if (!searchTerm || searchTerm.length < 1) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    
    try {
        // Reload friends data first to get latest status
        await loadFriendsData();
        
        const searchLower = searchTerm.toLowerCase();
        const endTerm = searchLower + '\uf8ff'; // Unicode trick for prefix search
        
        // Force fresh query (no cache)
        const results = await firebase.firestore()
            .collection('users')
            .where('username', '>=', searchLower)
            .where('username', '<=', endTerm)
            .limit(10)
            .get({ source: 'server' }); // Force server query, not cache
        
        const users = results.docs
            .map(doc => doc.data())
            .filter(user => user.uid !== currentUser.uid); // Exclude self
        
        console.log('✅ Found', users.length, 'users');
        displaySearchResults(users);
    } catch (error) {
        console.error('❌ Error searching users:', error);
        document.getElementById('search-results').innerHTML = '<div class="settings-empty-state">Error searching users</div>';
    }
}

function displaySearchResults(users) {
    const resultsDiv = document.getElementById('search-results');
    
    if (users.length === 0) {
        resultsDiv.innerHTML = '<div class="settings-empty-state">No users found</div>';
        return;
    }
    
    resultsDiv.innerHTML = users.map(user => {
        // Check relationship status
        const isFriend = friendsData.friends.some(f => f.users.includes(user.uid));
        const hasSentRequest = friendsData.sentRequests.some(r => r.toUserId === user.uid);
        const hasReceivedRequest = friendsData.requests.some(r => r.fromUserId === user.uid);
        
        let buttonHTML;
        if (isFriend) {
            buttonHTML = '<span class="settings-user-button friends">Friends</span>';
        } else if (hasSentRequest) {
            buttonHTML = '<span class="settings-user-button pending">Pending</span>';
        } else if (hasReceivedRequest) {
            buttonHTML = '<button class="settings-user-button" onclick="acceptFriendRequestFromSearch(\'' + user.uid + '\', \'' + user.username + '\')">Accept Request</button>';
        } else {
            buttonHTML = '<button class="settings-user-button" onclick="sendFriendRequest(\'' + user.uid + '\', \'' + user.username + '\')">Add Friend</button>';
        }
        
        return `
            <div class="settings-user-item">
                <div class="settings-user-info">
                    <img src="${safeImageSrc(user.photoURL, DEFAULT_USER_AVATAR)}" 
                         alt="${escapeHtml(user.displayName || user.username)}" 
                         class="settings-user-photo">
                    <div class="settings-user-details">
                        <div class="settings-user-username">@${escapeHtml(user.username)}</div>
                        <div class="settings-user-name">${escapeHtml(user.displayName || '')}</div>
                    </div>
                </div>
                ${buttonHTML}
            </div>
        `;
    }).join('');
}

// Send friend request
async function sendFriendRequest(toUserId, toUsername) {
    console.log('📤 Sending friend request to:', toUsername);
    
    try {
        const request = {
            fromUserId: currentUser.uid,
            toUserId: toUserId,
            fromUsername: userProfile.username,
            toUsername: toUsername,
            fromDisplayName: userProfile.displayName || '',
            fromPhotoURL: userProfile.photoURL || '',
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await firebase.firestore().collection('friendRequests').add(request);
        
        console.log('✅ Friend request sent');
        
        // Immediately reload all data
        await loadFriendsData();
        await loadStats();
        
        // Re-run search to update button states
        const searchInput = document.getElementById('user-search');
        if (searchInput && searchInput.value) {
            await searchUsers(searchInput.value);
        }
        
        showCustomAlert('Friend request sent!', 'success');
    } catch (error) {
        console.error('❌ Error sending friend request:', error);
        showCustomAlert('Failed to send friend request', 'error');
    }
}

// Accept friend request from search results
async function acceptFriendRequestFromSearch(fromUserId, fromUsername) {
    const request = friendsData.requests.find(r => r.fromUserId === fromUserId);
    if (request) {
        await acceptFriendRequest(request.id, fromUserId, fromUsername);
    }
}

// Load all friend-related data
async function loadFriendsData() {
    console.log('👥 Loading friends data...');
    
    try {
        // Load friends
        const friendsSnapshot = await firebase.firestore()
            .collection('friends')
            .where('users', 'array-contains', currentUser.uid)
            .get();
        
        friendsData.friends = friendsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Check for and remove duplicates
        const seenFriends = new Set();
        const duplicates = [];
        
        friendsData.friends.forEach(friendship => {
            const friendId = friendship.users.find(uid => uid !== currentUser.uid);
            if (seenFriends.has(friendId)) {
                // This is a duplicate
                duplicates.push(friendship.id);
            } else {
                seenFriends.add(friendId);
            }
        });
        
        // Delete duplicate friendships
        if (duplicates.length > 0) {
            console.log('🗑️ Removing', duplicates.length, 'duplicate friendships');
            const batch = firebase.firestore().batch();
            duplicates.forEach(docId => {
                batch.delete(firebase.firestore().collection('friends').doc(docId));
            });
            await batch.commit();
            
            // Reload after cleanup
            const cleanSnapshot = await firebase.firestore()
                .collection('friends')
                .where('users', 'array-contains', currentUser.uid)
                .get();
            
            friendsData.friends = cleanSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        }
        
        // Load received requests
        const requestsSnapshot = await firebase.firestore()
            .collection('friendRequests')
            .where('toUserId', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        
        friendsData.requests = requestsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Load sent requests
        const sentRequestsSnapshot = await firebase.firestore()
            .collection('friendRequests')
            .where('fromUserId', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        
        friendsData.sentRequests = sentRequestsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('✅ Friends data loaded:', {
            friends: friendsData.friends.length,
            requests: friendsData.requests.length,
            sent: friendsData.sentRequests.length
        });
        
        // Display
        displayFriendRequests();
        displayFriends();
    } catch (error) {
        console.error('❌ Error loading friends data:', error);
    }
}

// Display friend requests
function displayFriendRequests() {
    const requestsList = document.getElementById('friend-requests-list');
    
    if (friendsData.requests.length === 0) {
        requestsList.innerHTML = '<div class="settings-zero-state">0 requests</div>';
        return;
    }
    
    requestsList.innerHTML = friendsData.requests.map(request => `
        <div class="settings-user-item">
            <div class="settings-user-info">
                <img src="${safeImageSrc(request.fromPhotoURL, DEFAULT_USER_AVATAR)}" 
                     alt="${escapeHtml(request.fromUsername)}" 
                     class="settings-user-photo">
                <div class="settings-user-details">
                    <div class="settings-user-username">@${escapeHtml(request.fromUsername)}</div>
                    <div class="settings-user-name">${escapeHtml(request.fromDisplayName || '')}</div>
                </div>
            </div>
            <div class="settings-user-actions">
                <button class="settings-user-button" onclick="acceptFriendRequest('${request.id}', '${request.fromUserId}', '${request.fromUsername}')">Accept</button>
                <button class="settings-user-button pending" onclick="declineFriendRequest('${request.id}')">Decline</button>
            </div>
        </div>
    `).join('');
}

// Display friends list
async function displayFriends() {
    const friendsList = document.getElementById('friends-list');
    
    if (friendsData.friends.length === 0) {
        friendsList.innerHTML = '<div class="settings-zero-state">0 friends</div>';
        return;
    }
    
    // Get friend user details and recipe counts
    const friendsWithDetails = await Promise.all(
        friendsData.friends.map(async (friendship) => {
            const friendId = friendship.users.find(uid => uid !== currentUser.uid);
            
            if (!friendId) {
                console.warn('Invalid friendship document:', friendship);
                return null;
            }
            
            // Get friend's profile
            const friendDoc = await firebase.firestore().collection('users').doc(friendId).get();
            if (!friendDoc.exists) {
                console.warn('Friend user not found:', friendId);
                return null;
            }
            const friendData = friendDoc.data();
            
            // Recipes are private to their owner now, so we don't count a
            // friend's recipes from here anymore
            return {
                ...friendData,
                uid: friendData.uid || friendId
            };
        })
    );
    
    // Filter out null entries and deduplicate by uid
    const uniqueFriends = friendsWithDetails
        .filter(friend => friend !== null)
        .reduce((acc, friend) => {
            // Only add if we haven't seen this uid before
            if (!acc.find(f => f.uid === friend.uid)) {
                acc.push(friend);
            }
            return acc;
        }, []);
    
    if (uniqueFriends.length === 0) {
        friendsList.innerHTML = '<div class="settings-zero-state">0 friends</div>';
        return;
    }
    
    friendsList.innerHTML = uniqueFriends.map(friend => `
        <div class="settings-user-item">
            <div class="settings-user-info">
                <img src="${safeImageSrc(friend.photoURL, DEFAULT_USER_AVATAR)}" 
                     alt="${escapeHtml(friend.username)}" 
                     class="settings-user-photo">
                <div class="settings-user-details">
                    <div class="settings-user-username">@${escapeHtml(friend.username)}</div>
                    <div class="settings-user-name">${escapeHtml(friend.displayName || '')}</div>
                </div>
            </div>
            <div class="settings-user-actions">
                <button class="settings-user-button settings-remove-btn" onclick="removeFriend('${friend.uid}', '${friend.username}')">Remove</button>
            </div>
        </div>
    `).join('');
}

// Accept friend request
async function acceptFriendRequest(requestId, fromUserId, fromUsername) {
    console.log('✅ Accepting friend request from:', fromUsername);
    
    try {
        // First check if friendship already exists
        const existingFriendship = await firebase.firestore()
            .collection('friends')
            .where('users', 'array-contains', currentUser.uid)
            .get();
        
        const alreadyFriends = existingFriendship.docs.some(doc => 
            doc.data().users.includes(fromUserId)
        );
        
        if (alreadyFriends) {
            console.log('⚠️ Already friends, just updating request status');
            // Just update the request status
            await firebase.firestore().collection('friendRequests').doc(requestId).update({
                status: 'accepted',
                acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Create new friendship
            const batch = firebase.firestore().batch();
            
            // Create the friendship with the same ID as the request it came
            // from. The rules check that request was sent to me and accepted here.
            const friendshipRef = firebase.firestore().collection('friends').doc(requestId);
            batch.set(friendshipRef, {
                requestId: requestId,
                users: [currentUser.uid, fromUserId],
                usernames: [userProfile.username, fromUsername],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update request status
            const requestRef = firebase.firestore().collection('friendRequests').doc(requestId);
            batch.update(requestRef, { 
                status: 'accepted',
                acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await batch.commit();
        }
        
        console.log('✅ Friend request accepted');
        
        // Reload data
        await loadFriendsData();
        await loadStats(); // Update friend count
        
        // Re-run search if active
        const searchInput = document.getElementById('user-search');
        if (searchInput && searchInput.value) {
            await searchUsers(searchInput.value);
        }
        
        showCustomAlert('Friend request accepted!', 'success');
    } catch (error) {
        console.error('❌ Error accepting friend request:', error);
        showCustomAlert('Failed to accept friend request', 'error');
    }
}

// Decline friend request
async function declineFriendRequest(requestId) {
    console.log('❌ Declining friend request');
    
    try {
        await firebase.firestore().collection('friendRequests').doc(requestId).update({
            status: 'declined',
            declinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Friend request declined');
        
        // Reload data immediately
        await loadFriendsData();
        await loadStats(); // Update pending count
        
        showCustomAlert('Friend request declined', 'success');
    } catch (error) {
        console.error('❌ Error declining friend request:', error);
        showCustomAlert('Failed to decline friend request', 'error');
    }
}

// Remove friend
async function removeFriend(friendUserId, friendUsername) {
    console.log('🗑️ Removing friend:', friendUsername);
    
    showCustomConfirm(
        'Remove friend?',
        `Remove @${friendUsername} from your friends list?`,
        async () => {
            try {
                // Find the friendship document
                const friendshipQuery = await firebase.firestore()
                    .collection('friends')
                    .where('users', 'array-contains', currentUser.uid)
                    .get();
                
                const friendshipDoc = friendshipQuery.docs.find(doc => 
                    doc.data().users.includes(friendUserId)
                );
                
                if (!friendshipDoc) {
                    console.error('❌ Friendship not found');
                    showCustomAlert('Friend not found', 'error');
                    return;
                }
                
                // Delete the friendship
                await firebase.firestore().collection('friends').doc(friendshipDoc.id).delete();
                
                console.log('✅ Friend removed');
                
                // Reload data immediately
                await loadFriendsData();
                await loadStats(); // Update friend count
                
                // Update search results if active
                const searchInput = document.getElementById('user-search');
                if (searchInput && searchInput.value) {
                    await searchUsers(searchInput.value);
                }
                
                showCustomAlert('Friend removed', 'success');
            } catch (error) {
                console.error('❌ Error removing friend:', error);
                showCustomAlert('Failed to remove friend', 'error');
            }
        }
    );
}

// Make functions globally available for onclick handlers
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.acceptFriendRequestFromSearch = acceptFriendRequestFromSearch;
window.declineFriendRequest = declineFriendRequest;
window.removeFriend = removeFriend;

// ========================================
// PROFILE PHOTO
// ========================================

async function updateProfilePhoto(file) {
    console.log('📸 Updating profile photo...');
    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    const maxSize = 400;
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > height) {
                        if (width > maxSize) {
                            height = height * (maxSize / width);
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width = width * (maxSize / height);
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
            photoURL: base64
        });
        
        if (userProfile) {
            userProfile.photoURL = base64;
        }
        displayUserProfile();
        console.log('✅ Profile photo updated');
    } catch (error) {
        console.error('❌ Error updating profile photo:', error);
        alert('Failed to update photo. Check Firestore permissions.');
    }
}

// ========================================
// DISPLAY NAME UPDATE
// ========================================

async function updateDisplayName(newName) {
    console.log('💾 Updating display name:', newName);
    try {
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
            displayName: newName
        });
        
        if (userProfile) {
            userProfile.displayName = newName;
        }
        console.log('✅ Display name updated successfully');
    } catch (error) {
        console.error('❌ Error updating display name:', error);
        alert('Failed to update name. Check Firestore permissions.');
    }
}

async function updateWorkspaceName(newWorkspaceName) {
    console.log('💾 Updating workspace name:', newWorkspaceName);
    try {
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
            workspaceName: newWorkspaceName
        });
        
        if (userProfile) {
            userProfile.workspaceName = newWorkspaceName;
        }
        console.log('✅ Workspace name updated successfully');
        showCustomAlert('Workspace name saved', 'success');
    } catch (error) {
        console.error('❌ Error updating workspace name:', error);
        showCustomAlert('Failed to update workspace name', 'error');
    }
}

// ========================================
// LOGOUT & DELETE
// ========================================

async function logoutAllDevices() {
    console.log('🚪 Logging out...');
    showCustomConfirm(
        'Sign out from all devices?',
        'This will end all active sessions.',
        async () => {
            try {
                await firebase.auth().signOut();
                window.location.href = '/index.html';
            } catch (error) {
                console.error('❌ Error signing out:', error);
                showCustomAlert('Failed to sign out', 'error');
            }
        }
    );
}

async function deleteAccount() {
    console.log('⚠️ Delete account requested');
    showCustomPrompt(
        'Delete Account',
        'Type DELETE to permanently delete your account and all data:',
        'DELETE',
        async (input) => {
            if (input === 'DELETE') {
                try {
                    // Delete user data
                    await firebase.firestore().collection('users').doc(currentUser.uid).delete();
                    
                    if (userProfile && userProfile.username) {
                        await firebase.firestore().collection('usernames').doc(userProfile.username.toLowerCase()).delete();
                    }
                    
                    // Delete recipes
                    const recipesSnapshot = await firebase.firestore()
                        .collection('recipes')
                        .where('userId', '==', currentUser.uid)
                        .get();
                    
                    const batch = firebase.firestore().batch();
                    recipesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                    
                    // Delete Firebase Auth account
                    await currentUser.delete();
                    
                    showCustomAlert('Account deleted successfully', 'success');
                    setTimeout(() => {
                        window.location.href = '/index.html';
                    }, 1500);
                } catch (error) {
                    console.error('❌ Error deleting account:', error);
                    showCustomAlert('Failed to delete account. You may need to sign in again first.', 'error');
                }
            } else {
                showCustomAlert('Deletion cancelled - you must type DELETE exactly', 'error');
            }
        }
    );
}

// ========================================
// TAB SWITCHING
// ========================================

function setupTabSwitching() {
    console.log('🔄 Setting up tab switching...');
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('Tab clicked:', btn.dataset.tab);
            // Remove active from all buttons
            document.querySelectorAll('.settings-nav-btn').forEach(b => 
                b.classList.remove('active')
            );
            
            // Add active to clicked button
            btn.classList.add('active');
            
            // Hide all tabs
            document.querySelectorAll('.settings-tab').forEach(tab => 
                tab.classList.remove('active')
            );
            
            // Show selected tab
            const tabId = 'tab-' + btn.dataset.tab;
            const selectedTab = document.getElementById(tabId);
            if (selectedTab) {
                selectedTab.classList.add('active');
            }
        });
    });
    console.log('✅ Tab switching setup complete');
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    console.log('🔌 Setting up event listeners...');
    
    // Close button
    const closeBtn = document.getElementById('settings-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            console.log('Close button clicked');
            // Go directly to index.html without triggering auth redirect
            window.location.replace('/index.html');
        });
        console.log('✅ Close button listener added');
    } else {
        console.error('❌ Close button not found');
    }
    
    // Change photo button
    const changePhotoBtn = document.getElementById('change-photo-btn');
    if (changePhotoBtn) {
        changePhotoBtn.addEventListener('click', () => {
            console.log('Change photo button clicked');
            document.getElementById('photo-upload').click();
        });
        console.log('✅ Change photo button listener added');
    } else {
        console.error('❌ Change photo button not found');
    }
    
    // Photo upload
    const photoUpload = document.getElementById('photo-upload');
    if (photoUpload) {
        photoUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                console.log('File selected:', file.name);
                updateProfilePhoto(file);
            }
        });
        console.log('✅ Photo upload listener added');
    }
    
    // Display name - save on blur
    const displayNameInput = document.getElementById('profile-display-name');
    if (displayNameInput) {
        displayNameInput.addEventListener('blur', () => {
            const newName = displayNameInput.value.trim();
            if (userProfile && newName !== userProfile.displayName) {
                console.log('Display name changed, saving...');
                updateDisplayName(newName);
            }
        });
        console.log('✅ Display name blur listener added');
    }
    
    // Workspace name - save on blur
    const workspaceNameInput = document.getElementById('workspace-name');
    if (workspaceNameInput) {
        workspaceNameInput.addEventListener('blur', () => {
            const newWorkspaceName = workspaceNameInput.value.trim();
            const currentWorkspaceName = userProfile?.workspaceName || 'My Recipe Book';
            if (newWorkspaceName && newWorkspaceName !== currentWorkspaceName) {
                console.log('Workspace name changed, saving...');
                updateWorkspaceName(newWorkspaceName);
            }
        });
        console.log('✅ Workspace name blur listener added');
    }
    
    // Change username button
    const changeUsernameBtn = document.getElementById('change-username-btn');
    if (changeUsernameBtn) {
        changeUsernameBtn.addEventListener('click', () => {
            console.log('Change username button clicked');
            const input = document.getElementById('new-username-input');
            const error = document.getElementById('edit-username-error');
            const modal = document.getElementById('edit-username-modal');
            
            if (input && userProfile) {
                input.value = userProfile.username || '';
            }
            if (error) {
                error.classList.add('hidden');
            }
            if (modal) {
                modal.classList.remove('hidden');
            }
        });
        console.log('✅ Change username button listener added');
    }
    
    // Save new username
    const saveNewUsernameBtn = document.getElementById('save-new-username-btn');
    if (saveNewUsernameBtn) {
        saveNewUsernameBtn.addEventListener('click', async () => {
            console.log('Save new username clicked');
            const newUsername = document.getElementById('new-username-input').value.trim();
            const errorDiv = document.getElementById('edit-username-error');
            
            if (!newUsername) {
                if (errorDiv) {
                    errorDiv.textContent = 'Please enter a username';
                    errorDiv.classList.remove('hidden');
                }
                return;
            }
            
            const result = await saveUsername(newUsername);
            if (result.success) {
                const modal = document.getElementById('edit-username-modal');
                if (modal) {
                    modal.classList.add('hidden');
                }
            } else {
                if (errorDiv) {
                    errorDiv.textContent = result.error;
                    errorDiv.classList.remove('hidden');
                }
            }
        });
        console.log('✅ Save new username button listener added');
    }
    
    // Close username modal
    const closeUsernameModal = document.getElementById('close-username-modal');
    if (closeUsernameModal) {
        closeUsernameModal.addEventListener('click', () => {
            const modal = document.getElementById('edit-username-modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        });
        console.log('✅ Close username modal listener added');
    }
    
    // Username setup modal (for new users)
    const saveUsernameBtn = document.getElementById('save-username-btn');
    if (saveUsernameBtn) {
        saveUsernameBtn.addEventListener('click', async () => {
            const username = document.getElementById('username-input').value.trim();
            const errorDiv = document.getElementById('username-error');
            
            if (!username) {
                if (errorDiv) {
                    errorDiv.textContent = 'Please enter a username';
                    errorDiv.classList.remove('hidden');
                }
                return;
            }
            
            const result = await saveUsername(username);
            if (result.success) {
                const modal = document.getElementById('username-modal');
                if (modal) {
                    modal.classList.add('hidden');
                }
            } else {
                if (errorDiv) {
                    errorDiv.textContent = result.error;
                    errorDiv.classList.remove('hidden');
                }
            }
        });
        console.log('✅ Save username button listener added');
    }
    
    // Logout all devices
    const logoutAllBtn = document.getElementById('logout-all-btn');
    if (logoutAllBtn) {
        logoutAllBtn.addEventListener('click', logoutAllDevices);
        console.log('✅ Logout button listener added');
    }
    
    // Delete account
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', deleteAccount);
        console.log('✅ Delete account button listener added');
    }
    
    // User search - real-time filtering
    const userSearchInput = document.getElementById('user-search');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            
            // Clear previous timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Debounce search by 300ms
            searchTimeout = setTimeout(() => {
                searchUsers(searchTerm);
            }, 300);
        });
        console.log('✅ User search listener added');
    }
    
    // Remove photo button
    const removePhotoBtn = document.getElementById('remove-photo-btn');
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', removeProfilePhoto);
        console.log('✅ Remove photo button listener added');
    }
    
    // Teamspace buttons
    const newTeamspaceBtn = document.getElementById('new-teamspace-btn');
    console.log('🔍 Looking for new-teamspace-btn:', newTeamspaceBtn);
    if (newTeamspaceBtn) {
        newTeamspaceBtn.addEventListener('click', () => {
            console.log('🖱️ New teamspace button CLICKED!');
            openTeamspaceModal();
        });
        console.log('✅ New teamspace button listener added');
    } else {
        console.error('❌ new-teamspace-btn not found in DOM!');
    }
    
    const saveTeamspaceBtn = document.getElementById('save-teamspace-btn');
    if (saveTeamspaceBtn) {
        saveTeamspaceBtn.addEventListener('click', createTeamspace);
        console.log('✅ Save teamspace button listener added');
    }
    
    const cancelTeamspaceBtn = document.getElementById('cancel-teamspace-btn');
    if (cancelTeamspaceBtn) {
        cancelTeamspaceBtn.addEventListener('click', closeTeamspaceModal);
        console.log('✅ Cancel teamspace button listener added');
    }
    
    const closeTeamspaceModalBtn = document.getElementById('close-teamspace-modal');
    if (closeTeamspaceModalBtn) {
        closeTeamspaceModalBtn.addEventListener('click', closeTeamspaceModal);
        console.log('✅ Close teamspace modal button listener added');
    }
    
    const closeTeamspaceSettingsBtn = document.getElementById('close-teamspace-settings-modal');
    if (closeTeamspaceSettingsBtn) {
        closeTeamspaceSettingsBtn.addEventListener('click', closeTeamspaceSettingsModal);
        console.log('✅ Close teamspace settings button listener added');
    }
    
    const leaveTeamspaceBtn = document.getElementById('leave-teamspace-btn');
    if (leaveTeamspaceBtn) {
        leaveTeamspaceBtn.addEventListener('click', leaveTeamspace);
        console.log('✅ Leave teamspace button listener added');
    }
    
    // Add member search input
    const addMemberSearchInput = document.getElementById('teamspace-add-members-search');
    if (addMemberSearchInput) {
        addMemberSearchInput.addEventListener('input', async (e) => {
            const searchTerm = e.target.value.trim();
            await searchFriendsToAdd(searchTerm);
        });
        console.log('✅ Add member search listener added');
    }
    
    // Public teamspace search
    const publicTeamspaceSearch = document.getElementById('public-teamspace-search');
    if (publicTeamspaceSearch) {
        publicTeamspaceSearch.addEventListener('input', async (e) => {
            const searchTerm = e.target.value.trim();
            await searchPublicTeamspaces(searchTerm);
        });
        console.log('✅ Public teamspace search listener added');
    }
    
    console.log('✅ All event listeners setup complete');
}

// ========================================
// REMOVE PHOTO
// ========================================

async function removeProfilePhoto() {
    console.log('🗑️ Removing profile photo...');
    
    showCustomConfirm(
        'Remove photo?',
        'This will remove your profile photo.',
        async () => {
            try {
                await firebase.firestore().collection('users').doc(currentUser.uid).update({
                    photoURL: ''
                });
                
                if (userProfile) {
                    userProfile.photoURL = '';
                }
                displayUserProfile();
                console.log('✅ Profile photo removed');
                showCustomAlert('Photo removed successfully', 'success');
            } catch (error) {
                console.error('❌ Error removing photo:', error);
                showCustomAlert('Failed to remove photo', 'error');
            }
        }
    );
}

// ========================================
// CUSTOM MODALS (matching app style)
// ========================================

function showCustomConfirm(title, message, onConfirm) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="custom-modal-content">
            <h3 class="custom-modal-title">${escapeHtml(title)}</h3>
            <p class="custom-modal-message">${escapeHtml(message)}</p>
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                <button class="custom-modal-btn custom-modal-btn-confirm">OK</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Trigger animation by adding active class after a brief delay
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    });
    
    // Close function with smooth fade-out
    const closeModal = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 300);
    };
    
    // Add event listeners
    const cancelBtn = modal.querySelector('.custom-modal-btn-cancel');
    const confirmBtn = modal.querySelector('.custom-modal-btn-confirm');
    
    cancelBtn.addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', () => {
        closeModal();
        setTimeout(onConfirm, 350);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });
    
    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function showCustomPrompt(title, message, expectedValue, onSubmit) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="custom-modal-content">
            <h3 class="custom-modal-title">${escapeHtml(title)}</h3>
            <p class="custom-modal-message">${escapeHtml(message)}</p>
            <input type="text" class="custom-modal-input" placeholder="${escapeHtml(expectedValue)}">
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn custom-modal-btn-cancel">Cancel</button>
                <button class="custom-modal-btn custom-modal-btn-confirm">OK</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Get input element
    const input = modal.querySelector('.custom-modal-input');
    
    // Trigger animation and focus input
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('active');
            setTimeout(() => input.focus(), 350);
        });
    });
    
    // Close function with smooth fade-out
    const closeModal = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 300);
    };
    
    // Get buttons
    const cancelBtn = modal.querySelector('.custom-modal-btn-cancel');
    const confirmBtn = modal.querySelector('.custom-modal-btn-confirm');
    
    // Add event listeners
    cancelBtn.addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', () => {
        const value = input.value.trim();
        closeModal();
        setTimeout(() => onSubmit(value), 350);
    });
    
    // Submit on Enter
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const value = input.value.trim();
            closeModal();
            setTimeout(() => onSubmit(value), 350);
        }
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });
    
    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function showCustomAlert(message, type = 'info') {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="custom-modal-content">
            <p class="custom-modal-message">${escapeHtml(message)}</p>
            <div class="custom-modal-buttons">
                <button class="custom-modal-btn custom-modal-btn-confirm">OK</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Trigger animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    });
    
    // Close function with smooth fade-out
    const closeModal = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 300);
    };
    
    // Add event listener
    const confirmBtn = modal.querySelector('.custom-modal-btn-confirm');
    confirmBtn.addEventListener('click', closeModal);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });
    
    // Auto-close after 3 seconds for success
    if (type === 'success') {
        setTimeout(closeModal, 3000);
    }
    
    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// ========================================
// TEAMSPACES SYSTEM
// ========================================

let currentTeamspaceId = null;
let teamspacesData = [];

// Load all teamspaces
async function loadTeamspaces() {
    console.log('🏠 Loading teamspaces...');
    
    try {
        // Only ask for teamspaces I'm in. The security rules reject a query
        // for the whole collection, so this filter has to happen in Firestore.
        const teamspacesSnapshot = await firebase.firestore()
            .collection('teamspaces')
            .where('memberIds', 'array-contains', currentUser.uid)
            .get();
        
        teamspacesData = teamspacesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('✅ Loaded', teamspacesData.length, 'teamspaces');
        displayTeamspaces();
    } catch (error) {
        console.error('❌ Error loading teamspaces:', error);
    }
}

// Display teamspaces list
function displayTeamspaces() {
    const listDiv = document.getElementById('teamspaces-list');
    
    if (!listDiv) return;
    
    if (teamspacesData.length === 0) {
        listDiv.innerHTML = '<div class="settings-empty-state">No teamspaces yet. Click "New teamspace" to create one!</div>';
        return;
    }
    
    listDiv.innerHTML = teamspacesData.map(ts => {
        const memberCount = Object.keys(ts.members || {}).length;
        const accessLabel = capitalizeFirst(ts.accessLevel || 'default');
        const updatedDate = ts.updatedAt ? formatDate(ts.updatedAt.toDate()) : formatDate(new Date());
        
        return `
            <div class="settings-teamspace-row">
                <div class="settings-teamspace-info">
                    <div class="settings-teamspace-icon">🏠</div>
                    <div class="settings-teamspace-details">
                        <div class="settings-teamspace-name">${escapeHtml(ts.name)}</div>
                        <div class="settings-teamspace-meta">${memberCount} member${memberCount !== 1 ? 's' : ''} • Joined</div>
                    </div>
                </div>
                <div class="settings-teamspace-owners">
                    <div class="settings-owner-avatar" style="background: #2383e2;">
                        ${escapeHtml(userProfile.displayName?.charAt(0).toUpperCase() || 'U')}
                    </div>
                    <span class="settings-owner-name">${escapeHtml(userProfile.displayName || userProfile.username)}</span>
                </div>
                <div class="settings-access-badge">${accessLabel}</div>
                <div class="settings-teamspace-date">${updatedDate}</div>
                <button class="settings-teamspace-menu-btn" data-teamspace-id="${ts.id}">⋯</button>
            </div>
        `;
    }).join('');
    
    console.log('✅ Displayed', teamspacesData.length, 'teamspaces');
    
    // Add event listeners to all three-dot buttons
    document.querySelectorAll('.settings-teamspace-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const teamspaceId = btn.getAttribute('data-teamspace-id');
            console.log('⋯ button clicked for teamspace:', teamspaceId);
            openTeamspaceSettings(teamspaceId);
        });
    });
}

// Create new teamspace
async function createTeamspace() {
    const name = document.getElementById('teamspace-name-input').value.trim();
    const description = document.getElementById('teamspace-description-input').value.trim();
    const accessLevel = document.getElementById('teamspace-access-select').value;
    const errorDiv = document.getElementById('teamspace-error');
    
    if (!name) {
        errorDiv.textContent = 'Teamspace name is required';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    try {
        const teamspace = {
            name: name,
            description: description,
            ownerId: currentUser.uid,
            ownerName: userProfile?.displayName || userProfile?.username || '',
            members: {
                [currentUser.uid]: {
                    role: 'owner',
                    addedAt: firebase.firestore.FieldValue.serverTimestamp()
                }
            },
            memberIds: [currentUser.uid],
            accessLevel: accessLevel,
            inviteLinkEnabled: false,
            permissions: {
                canInvite: 'any',
                canEditSidebar: 'any'
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await firebase.firestore().collection('teamspaces').add(teamspace);
        
        console.log('✅ Teamspace created:', name);
        
        // Close modal and reload
        closeTeamspaceModal();
        await loadTeamspaces();
        
        showCustomAlert('Teamspace created!', 'success');
    } catch (error) {
        console.error('❌ Error creating teamspace:', error);
        errorDiv.textContent = 'Failed to create teamspace';
        errorDiv.classList.remove('hidden');
    }
}

// Open teamspace settings
function openTeamspaceSettings(teamspaceId) {
    console.log('🏠 Opening teamspace settings for:', teamspaceId);
    currentTeamspaceId = teamspaceId;
    const teamspace = teamspacesData.find(ts => ts.id === teamspaceId);
    
    if (!teamspace) {
        console.error('❌ Teamspace not found:', teamspaceId);
        return;
    }
    
    console.log('✅ Found teamspace:', teamspace.name);
    
    const isOwner = teamspace.ownerId === currentUser.uid;
    
    // Populate modal
    document.getElementById('teamspace-settings-title').textContent = teamspace.name;
    const memberCount = Object.keys(teamspace.members || {}).length;
    document.getElementById('teamspace-settings-members').textContent = `${memberCount} member${memberCount !== 1 ? 's' : ''}`;
    document.getElementById('teamspace-edit-description').value = teamspace.description || '';
    document.getElementById('teamspace-access-label').textContent = capitalizeFirst(teamspace.accessLevel || 'default');
    document.getElementById('teamspace-invite-permission').value = teamspace.permissions?.canInvite || 'any';
    document.getElementById('teamspace-invite-link-toggle').checked = teamspace.inviteLinkEnabled || false;
    
    // Update leave/delete button
    const leaveBtn = document.getElementById('leave-teamspace-btn');
    const leaveTitle = document.getElementById('leave-teamspace-title');
    const leaveDesc = document.getElementById('leave-teamspace-description');
    
    if (isOwner) {
        leaveBtn.textContent = 'Delete teamspace';
        leaveTitle.textContent = 'Delete teamspace';
        leaveDesc.textContent = 'Permanently delete this teamspace and all its data';
        leaveBtn.style.color = '#e53e3e';
    } else {
        leaveBtn.textContent = 'Leave teamspace';
        leaveTitle.textContent = 'Leave teamspace';
        leaveDesc.textContent = 'Removes teamspace from your sidebar';
        leaveBtn.style.color = '';
    }
    
    // Load members
    loadTeamspaceMembers(teamspaceId);
    
    // Load pending requests
    loadTeamspaceRequests(teamspaceId);
    
    // Show modal
    const modal = document.getElementById('teamspace-settings-modal');
    console.log('📦 Modal element:', modal);
    console.log('🔍 Modal classes before:', modal.className);
    
    modal.classList.remove('hidden');
    modal.classList.add('active');
    
    console.log('✅ Modal classes after:', modal.className);
}

// Load teamspace members
async function loadTeamspaceMembers(teamspaceId) {
    const teamspace = teamspacesData.find(ts => ts.id === teamspaceId);
    if (!teamspace) return;
    
    const membersListDiv = document.getElementById('teamspace-members-list');
    const members = teamspace.members || {};
    
    // Get user details for each member
    const memberDetails = await Promise.all(
        Object.keys(members).map(async (uid) => {
            const userDoc = await firebase.firestore().collection('users').doc(uid).get();
            const userData = userDoc.data() || {};
            return {
                uid: uid,
                role: members[uid].role,
                ...userData
            };
        })
    );
    
    // Store for filtering
    window.currentTeamspaceMembers = memberDetails;
    
    membersListDiv.innerHTML = memberDetails.map(member => `
        <div class="settings-member-row">
            <div class="settings-member-info">
                <img src="${safeImageSrc(member.photoURL, DEFAULT_MEMBER_AVATAR)}" 
                     alt="${escapeHtml(member.displayName)}" 
                     class="settings-member-avatar">
                <div>
                    <div class="settings-member-name">${escapeHtml(member.displayName || member.username)} ${member.uid === currentUser.uid ? '(You)' : ''}</div>
                    <div class="settings-member-email">@${escapeHtml(member.username || '')}</div>
                </div>
            </div>
            <select class="settings-select-inline" onchange="changeTeamspaceMemberRole('${teamspaceId}', '${member.uid}', this.value)" ${member.role === 'owner' && member.uid === teamspace.ownerId ? 'disabled' : ''}>
                <option value="owner" ${member.role === 'owner' ? 'selected' : ''}>Teamspace owner</option>
                <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Teamspace editor</option>
                <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Teamspace viewer</option>
            </select>
        </div>
    `).join('');
}

// Filter teamspace members
function filterTeamspaceMembers(searchTerm) {
    if (!window.currentTeamspaceMembers || !currentTeamspaceId) return;
    
    const teamspace = teamspacesData.find(ts => ts.id === currentTeamspaceId);
    if (!teamspace) return;
    
    const membersListDiv = document.getElementById('teamspace-members-list');
    
    let filteredMembers = window.currentTeamspaceMembers;
    
    if (searchTerm) {
        filteredMembers = filteredMembers.filter(member => {
            const name = (member.displayName || '').toLowerCase();
            const username = (member.username || '').toLowerCase();
            return name.includes(searchTerm) || username.includes(searchTerm);
        });
    }
    
    // Redisplay filtered members
    membersListDiv.innerHTML = filteredMembers.map(member => `
        <div class="settings-member-row">
            <div class="settings-member-info">
                <img src="${safeImageSrc(member.photoURL, DEFAULT_MEMBER_AVATAR)}" 
                     alt="${escapeHtml(member.displayName)}" 
                     class="settings-member-avatar">
                <div>
                    <div class="settings-member-name">${escapeHtml(member.displayName || member.username)} ${member.uid === currentUser.uid ? '(You)' : ''}</div>
                    <div class="settings-member-email">@${escapeHtml(member.username || '')}</div>
                </div>
            </div>
            <select class="settings-select-inline" onchange="changeTeamspaceMemberRole('${currentTeamspaceId}', '${member.uid}', this.value)" ${member.role === 'owner' && member.uid === teamspace.ownerId ? 'disabled' : ''}>
                <option value="owner" ${member.role === 'owner' ? 'selected' : ''}>Teamspace owner</option>
                <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Teamspace editor</option>
                <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Teamspace viewer</option>
            </select>
        </div>
    `).join('');
}

// Search friends to add to teamspace
async function searchFriendsToAdd(searchTerm) {
    const resultsDiv = document.getElementById('teamspace-add-members-results');
    
    if (!searchTerm) {
        resultsDiv.classList.add('hidden');
        return;
    }
    
    if (!currentTeamspaceId) {
        console.error('No current teamspace');
        return;
    }
    
    // Get current teamspace members
    const teamspace = teamspacesData.find(ts => ts.id === currentTeamspaceId);
    if (!teamspace) return;
    
    const memberUids = Object.keys(teamspace.members || {});
    
    // Get friends not in teamspace
    const availableFriends = [];
    const searchLower = searchTerm.toLowerCase();
    
    for (const friendship of friendsData.friends) {
        const friendUid = friendship.users.find(uid => uid !== currentUser.uid);
        
        // Skip if already a member
        if (memberUids.includes(friendUid)) continue;
        
        // Get friend details
        try {
            const friendDoc = await firebase.firestore().collection('users').doc(friendUid).get();
            if (friendDoc.exists) {
                const friendData = friendDoc.data();
                const name = (friendData.displayName || '').toLowerCase();
                const username = (friendData.username || '').toLowerCase();
                
                // Check if matches
                const nameStartsWith = name.startsWith(searchLower);
                const usernameStartsWith = username.startsWith(searchLower);
                const nameContains = name.includes(searchLower);
                const usernameContains = username.includes(searchLower);
                
                if (nameStartsWith || usernameStartsWith || nameContains || usernameContains) {
                    // Add with priority score for sorting
                    let priority = 0;
                    if (usernameStartsWith) priority = 4;
                    else if (nameStartsWith) priority = 3;
                    else if (usernameContains) priority = 2;
                    else if (nameContains) priority = 1;
                    
                    availableFriends.push({
                        uid: friendUid,
                        priority: priority,
                        ...friendData
                    });
                }
            }
        } catch (error) {
            console.error('Error getting friend data:', error);
        }
    }
    
    // Sort by priority (highest first)
    availableFriends.sort((a, b) => b.priority - a.priority);
    
    console.log(`🔍 Found ${availableFriends.length} friends matching "${searchTerm}"`);
    lastFriendsToAdd = availableFriends;
    displayFriendsToAdd(availableFriends);
}

// Friends shown in the last search, so the Add click can look up the name
let lastFriendsToAdd = [];

// Display friends that can be added
function displayFriendsToAdd(friends) {
    const resultsDiv = document.getElementById('teamspace-add-members-results');
    
    if (friends.length === 0) {
        resultsDiv.innerHTML = '<div class="settings-empty-result" style="padding: 12px; text-align: center; color: #999;">No friends found</div>';
        resultsDiv.classList.remove('hidden');
        return;
    }
    
    resultsDiv.innerHTML = friends.map(friend => `
        <div class="settings-search-result-item" onclick="addFriendToTeamspace('${escapeHtml(friend.uid)}')">
            <img src="${safeImageSrc(friend.photoURL, DEFAULT_MEMBER_AVATAR)}" class="settings-user-photo" style="width: 32px; height: 32px; border-radius: 50%;">
            <div style="flex: 1;">
                <div style="font-size: 14px; font-weight: 500; color: #1a1a1a;">${escapeHtml(friend.displayName || friend.username)}</div>
                <div style="font-size: 13px; color: #999;">@${escapeHtml(friend.username)}</div>
            </div>
            <button class="settings-add-btn" style="padding: 6px 12px; background: #2383e2; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer;">Add</button>
        </div>
    `).join('');
    
    resultsDiv.classList.remove('hidden');
}

// Add friend to teamspace
async function addFriendToTeamspace(friendUid) {
    console.log('Adding friend to teamspace:', friendUid);
    const friend = lastFriendsToAdd.find(f => f.uid === friendUid) || {};
    const friendName = friend.displayName || friend.username || 'Friend';
    
    try {
        // members and memberIds always change together (the rules check this)
        await firebase.firestore().collection('teamspaces').doc(currentTeamspaceId).update({
            [`members.${friendUid}`]: {
                role: 'editor',
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            },
            memberIds: firebase.firestore.FieldValue.arrayUnion(friendUid),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Friend added to teamspace');
        
        // Reload teamspace data
        await loadTeamspaces();
        
        // Reload members
        await loadTeamspaceMembers(currentTeamspaceId);
        
        // Clear search
        document.getElementById('teamspace-add-members-search').value = '';
        document.getElementById('teamspace-add-members-results').classList.add('hidden');
        
        showCustomAlert(`${friendName} added to teamspace!`, 'success');
    } catch (error) {
        console.error('❌ Error adding friend to teamspace:', error);
        showCustomAlert('Failed to add member', 'error');
    }
}

// Make globally available
window.addFriendToTeamspace = addFriendToTeamspace;

// Change member role
async function changeTeamspaceMemberRole(teamspaceId, memberId, newRole) {
    try {
        await firebase.firestore().collection('teamspaces').doc(teamspaceId).update({
            [`members.${memberId}.role`]: newRole,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Member role updated');
        await loadTeamspaces();
        showCustomAlert('Member role updated', 'success');
    } catch (error) {
        console.error('❌ Error updating member role:', error);
        showCustomAlert('Failed to update role', 'error');
    }
}

// Change teamspace access level
async function changeTeamspaceAccess(teamspaceId, newAccess) {
    try {
        await firebase.firestore().collection('teamspaces').doc(teamspaceId).update({
            accessLevel: newAccess,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Access level updated');
        await loadTeamspaces();
        showCustomAlert('Access level updated', 'success');
    } catch (error) {
        console.error('❌ Error updating access:', error);
        showCustomAlert('Failed to update access', 'error');
    }
}

// Leave teamspace
async function leaveTeamspace() {
    if (!currentTeamspaceId) return;
    
    const teamspace = teamspacesData.find(ts => ts.id === currentTeamspaceId);
    const isOwner = teamspace.ownerId === currentUser.uid;
    
    if (isOwner) {
        // Owner is deleting the teamspace
        showCustomConfirm(
            'Delete teamspace?',
            `Are you sure you want to permanently delete "${teamspace.name}"? This action cannot be undone and all data will be lost.`,
            async () => {
                try {
                    await firebase.firestore().collection('teamspaces').doc(currentTeamspaceId).delete();
                    console.log('✅ Teamspace deleted');
                    closeTeamspaceSettingsModal();
                    await loadTeamspaces();
                    showCustomAlert('Teamspace deleted', 'success');
                } catch (error) {
                    console.error('❌ Error deleting teamspace:', error);
                    showCustomAlert('Failed to delete teamspace', 'error');
                }
            }
        );
    } else {
        // Member is leaving
        showCustomConfirm(
            'Leave teamspace?',
            `Are you sure you want to leave "${teamspace.name}"?`,
            async () => {
                try {
                    await firebase.firestore().collection('teamspaces').doc(currentTeamspaceId).update({
                        [`members.${currentUser.uid}`]: firebase.firestore.FieldValue.delete(),
                        memberIds: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    console.log('✅ Left teamspace');
                    closeTeamspaceSettingsModal();
                    await loadTeamspaces();
                    showCustomAlert('Left teamspace', 'success');
                } catch (error) {
                    console.error('❌ Error leaving teamspace:', error);
                    showCustomAlert('Failed to leave teamspace', 'error');
                }
            }
        );
    }
}

// Helper functions
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function openTeamspaceModal() {
    console.log('🏠 Opening teamspace modal...');
    
    const modal = document.getElementById('teamspace-modal');
    console.log('📦 Modal element:', modal);
    
    if (!modal) {
        console.error('❌ Modal not found!');
        return;
    }
    
    document.getElementById('teamspace-modal-title').textContent = 'New teamspace';
    document.getElementById('save-teamspace-btn').textContent = 'Create teamspace';
    document.getElementById('teamspace-name-input').value = '';
    document.getElementById('teamspace-description-input').value = '';
    document.getElementById('teamspace-access-select').value = 'default';
    document.getElementById('teamspace-error').classList.add('hidden');
    
    console.log('🗑️ Removing hidden class');
    modal.classList.remove('hidden');
    console.log('➕ Adding active class');
    modal.classList.add('active');
    console.log('✅ Modal classes now:', modal.className);
}

function closeTeamspaceModal() {
    const modal = document.getElementById('teamspace-modal');
    modal.classList.remove('active');
    // Add hidden back after animation
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function closeTeamspaceSettingsModal() {
    const modal = document.getElementById('teamspace-settings-modal');
    modal.classList.remove('active');
    // Add hidden back after animation
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
    currentTeamspaceId = null;
}

// Global functions
window.openTeamspaceSettings = openTeamspaceSettings;
window.changeTeamspaceMemberRole = changeTeamspaceMemberRole;
window.changeTeamspaceAccess = changeTeamspaceAccess;
window.leaveTeamspace = leaveTeamspace;

// Setup teamspace settings tabs
function setupTeamspaceSettingsTabs() {
    const tabs = document.querySelectorAll('#teamspace-settings-modal .settings-modal-tab');
    const tabContents = document.querySelectorAll('#teamspace-settings-modal .settings-modal-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `teamspace-tab-${tabName}`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// Format date helper
function formatDate(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear().toString().slice(-2);
    return `${month}/${day}/${year}`;
}

// ========================================
// TEAMSPACE ACCESS DROPDOWN
// ========================================

function setupTeamspaceAccessDropdown() {
    const row = document.querySelector('.settings-permission-row');
    const dropdown = document.getElementById('teamspace-access-dropdown');
    const label = document.getElementById('teamspace-access-label');

    if (!row || !dropdown) {
        console.warn('⚠️ Teamspace access dropdown elements not found');
        return;
    }

    // Toggle dropdown
    row.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    // Close when clicking outside
    document.addEventListener('click', () => {
        dropdown.classList.add('hidden');
    });

    // Handle option click
    dropdown.querySelectorAll('.settings-permission-option').forEach(option => {
        option.addEventListener('click', async (e) => {
            e.stopPropagation();

            const newAccess = option.dataset.value;
            if (!currentTeamspaceId) return;

            // Update UI immediately
            label.textContent = capitalizeFirst(newAccess);
            dropdown.classList.add('hidden');

            // Save to Firestore
            await changeTeamspaceAccess(currentTeamspaceId, newAccess);
        });
    });
}
// ========================================
// PUBLIC TEAMSPACE SEARCH & JOIN
// ========================================

async function searchPublicTeamspaces(searchTerm) {
    const listContainer = document.getElementById('public-teamspaces-list');
    if (!listContainer) return;
    
    // Clear if search is empty
    if (!searchTerm || searchTerm.length < 2) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;"><p>Search to find public teamspaces</p></div>';
        return;
    }
    
    listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;"><p>Searching...</p></div>';
    
    try {
        // Search for teamspaces with accessLevel "open" or "closed"
        const snapshot = await firebase.firestore().collection('teamspaces')
            .where('accessLevel', 'in', ['open', 'closed'])
            .get();
        
        const results = [];
        const lowerSearch = searchTerm.toLowerCase();
        
        snapshot.forEach(doc => {
            const ts = doc.data();
            const teamspaceName = (ts.name || '').toLowerCase();
            const teamspaceDesc = (ts.description || '').toLowerCase();
            
            console.log('Checking teamspace:', ts.name, 'Members:', ts.members, 'Type:', typeof ts.members);
            
            const isAlreadyMember = (ts.memberIds || []).includes(currentUser.uid);
            
            console.log('Is already member:', isAlreadyMember);
            
            // Filter by search term and exclude if already a member
            if (!isAlreadyMember && (teamspaceName.includes(lowerSearch) || teamspaceDesc.includes(lowerSearch))) {
                results.push({ id: doc.id, ...ts });
            }
        });
        
        // Display results
        if (results.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;"><p>No public teamspaces found</p></div>';
            return;
        }
        
        listContainer.innerHTML = results.map(ts => renderPublicTeamspaceRow(ts)).join('');
        
        // Add event listeners to join/request buttons
        results.forEach(ts => {
            const btn = document.getElementById(`join-btn-${ts.id}`);
            if (btn) {
                btn.addEventListener('click', () => handleJoinTeamspace(ts));
            }
        });
        
    } catch (error) {
        console.error('Error searching public teamspaces:', error);
        listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;"><p>Error loading teamspaces</p></div>';
    }
}

function renderPublicTeamspaceRow(ts) {
    const ownerName = ts.ownerName || 'Unknown';
    const memberCount = (ts.memberIds || []).length;
    
    const accessLabel = ts.accessLevel === 'open' ? '🔓 Open' : '🔒 Closed';
    const buttonLabel = ts.accessLevel === 'open' ? 'Join' : 'Request';
    const buttonClass = ts.accessLevel === 'open' ? 'settings-primary-button' : 'settings-secondary-button';
    
    return `
        <div class="settings-teamspace-row">
            <div class="settings-teamspace-info">
                <div class="settings-teamspace-icon">${escapeHtml(ts.emoji || '🏠')}</div>
                <div class="settings-teamspace-details">
                    <div class="settings-teamspace-name">${escapeHtml(ts.name || 'Untitled')}</div>
                    ${ts.description ? `<div class="settings-teamspace-meta">${escapeHtml(ts.description)}</div>` : ''}
                </div>
            </div>
            <div class="settings-teamspace-owners">
                <span class="settings-owner-name">${escapeHtml(ownerName)}</span>
            </div>
            <div>
                <span style="font-size: 13px;">${accessLabel}</span>
            </div>
            <div>
                <span style="font-size: 13px; color: #666;">${memberCount} ${memberCount === 1 ? 'member' : 'members'}</span>
            </div>
            <div>
                <button class="${buttonClass}" id="join-btn-${ts.id}" style="padding: 6px 16px; font-size: 13px; min-width: 80px; white-space: nowrap;">
                    ${buttonLabel}
                </button>
            </div>
        </div>
    `;
}

async function handleJoinTeamspace(teamspace) {
    const btn = document.getElementById(`join-btn-${teamspace.id}`);
    if (!btn) return;
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    try {
        if (teamspace.accessLevel === 'open') {
            // Join immediately
            await joinTeamspaceDirectly(teamspace.id);
            showCustomAlert('Joined!', `You've joined "${teamspace.name}"`);
            
            // Remove from public list and reload user's teamspaces
            await searchPublicTeamspaces(document.getElementById('public-teamspace-search').value);
            await loadTeamspaces();
            
        } else if (teamspace.accessLevel === 'closed') {
            // Send join request
            await sendJoinRequest(teamspace.id);
            showCustomAlert('Request sent', `Your request to join "${teamspace.name}" has been sent to the owner`);
            btn.textContent = 'Requested';
            btn.disabled = true;
        }
    } catch (error) {
        console.error('Error joining teamspace:', error);
        showCustomAlert('Error', 'Failed to join teamspace. Please try again.');
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function joinTeamspaceDirectly(teamspaceId) {
    const teamspaceRef = firebase.firestore().collection('teamspaces').doc(teamspaceId);
    const teamspace = await teamspaceRef.get();
    
    if (!teamspace.exists) {
        throw new Error('Teamspace not found');
    }
    
    // Add myself as a viewer. This used to arrayUnion onto `members`, which
    // turned the members map into an array and wiped out everyone else,
    // including the owner.
    await teamspaceRef.update({
        [`members.${currentUser.uid}`]: {
            role: 'viewer',
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        memberIds: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function sendJoinRequest(teamspaceId) {
    const teamspaceRef = firebase.firestore().collection('teamspaces').doc(teamspaceId);
    const teamspace = await teamspaceRef.get();
    
    if (!teamspace.exists) {
        throw new Error('Teamspace not found');
    }
    
    // Add to pending requests
    await teamspaceRef.update({
        pendingRequests: firebase.firestore.FieldValue.arrayUnion({
            userId: currentUser.uid,
            displayName: userProfile?.displayName || userProfile?.username || 'Someone',
            photoURL: userProfile?.photoURL || null,
            requestedAt: firebase.firestore.Timestamp.now()
        })
    });
}

// ========================================
// MANAGE JOIN REQUESTS FOR CLOSED TEAMSPACES
// ========================================

async function loadTeamspaceRequests(teamspaceId) {
    const requestsList = document.getElementById('teamspace-requests-list');
    const noRequestsMsg = document.getElementById('teamspace-no-requests');
    
    if (!requestsList) return;
    
    try {
        const teamspaceRef = firebase.firestore().collection('teamspaces').doc(teamspaceId);
        const teamspace = await teamspaceRef.get();
        
        if (!teamspace.exists) return;
        
        const ts = teamspace.data();
        const pendingRequests = ts.pendingRequests || [];
        
        if (pendingRequests.length === 0) {
            requestsList.innerHTML = '';
            noRequestsMsg.classList.remove('hidden');
            return;
        }
        
        noRequestsMsg.classList.add('hidden');
        requestsList.innerHTML = pendingRequests.map((request, index) => `
            <div class="settings-request-row" data-user-id="${escapeHtml(request.userId)}">
                <div class="settings-request-info">
                    <div class="settings-request-avatar">
                        ${safeImageSrc(request.photoURL) ? 
                            `<img src="${safeImageSrc(request.photoURL)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : 
                            `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #e0e0e0; border-radius: 50%; font-weight: 600; color: white;">${escapeHtml((request.displayName || 'U')[0].toUpperCase())}</div>`
                        }
                    </div>
                    <div>
                        <div class="settings-request-name">${escapeHtml(request.displayName || 'Unknown User')}</div>
                        <div class="settings-request-date">Requested ${formatRequestDate(request.requestedAt)}</div>
                    </div>
                </div>
                <div class="settings-request-actions">
                    <button class="settings-secondary-button" onclick="denyJoinRequest('${escapeHtml(teamspaceId)}', '${escapeHtml(request.userId)}')">Deny</button>
                    <button class="settings-primary-button" onclick="approveJoinRequest('${escapeHtml(teamspaceId)}', '${escapeHtml(request.userId)}')">Approve</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading requests:', error);
    }
}

function formatRequestDate(timestamp) {
    if (!timestamp) return 'recently';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

async function approveJoinRequest(teamspaceId, userId) {
    try {
        const teamspaceRef = firebase.firestore().collection('teamspaces').doc(teamspaceId);
        const teamspace = await teamspaceRef.get();
        
        if (!teamspace.exists) return;
        
        const ts = teamspace.data();
        const pendingRequests = ts.pendingRequests || [];
        const request = pendingRequests.find(r => r.userId === userId) || {};
        const displayName = request.displayName || 'Member';
        
        // Find and remove the request
        const updatedRequests = pendingRequests.filter(r => r.userId !== userId);
        
        // Add them as a viewer (map entry + memberIds, same as every other join)
        await teamspaceRef.update({
            [`members.${userId}`]: {
                role: 'viewer',
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            },
            memberIds: firebase.firestore.FieldValue.arrayUnion(userId),
            pendingRequests: updatedRequests,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Reload the requests list
        await loadTeamspaceRequests(teamspaceId);
        
        showCustomAlert('Approved', `${displayName} has been added to the teamspace`);
        
    } catch (error) {
        console.error('Error approving request:', error);
        showCustomAlert('Error', 'Failed to approve request');
    }
}

async function denyJoinRequest(teamspaceId, userId) {
    try {
        const teamspaceRef = firebase.firestore().collection('teamspaces').doc(teamspaceId);
        const teamspace = await teamspaceRef.get();
        
        if (!teamspace.exists) return;
        
        const ts = teamspace.data();
        const pendingRequests = ts.pendingRequests || [];
        
        // Remove the request
        const updatedRequests = pendingRequests.filter(r => r.userId !== userId);
        
        await teamspaceRef.update({
            pendingRequests: updatedRequests
        });
        
        // Reload the requests list
        await loadTeamspaceRequests(teamspaceId);
        
        showCustomAlert('Denied', 'Request has been denied');
        
    } catch (error) {
        console.error('Error denying request:', error);
        showCustomAlert('Error', 'Failed to deny request');
    }
}