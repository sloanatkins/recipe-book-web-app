// ================================
// CONFIRM MODAL
// ================================
function macConfirm(message) {
    return new Promise(resolve => {
        const overlay = document.getElementById("macos-confirm-overlay");
        const msgEl = document.getElementById("macos-confirm-message");
        const btnCancel = overlay.querySelector(".macos-cancel");
        const btnOk = overlay.querySelector(".macos-ok");

        msgEl.textContent = message;
        overlay.classList.remove("hidden");
        
        // Show both buttons for confirm
        if (btnCancel) btnCancel.style.display = '';
        if (btnOk) btnOk.style.display = '';

        function cleanup(choice) {
            overlay.classList.add("hidden");
            btnCancel.onclick = null;
            btnOk.onclick = null;
            resolve(choice);
        }

        btnCancel.onclick = () => cleanup(false);
        btnOk.onclick = () => cleanup(true);
    });
}

// ================================
// ALERT MODAL (Info only - OK button)
// ================================
function macAlert(message) {
    return new Promise(resolve => {
        const overlay = document.getElementById("macos-confirm-overlay");
        const msgEl = document.getElementById("macos-confirm-message");
        const btnCancel = overlay.querySelector(".macos-cancel");
        const btnOk = overlay.querySelector(".macos-ok");

        msgEl.textContent = message;
        overlay.classList.remove("hidden");
        
        // Hide cancel button, show only OK for alerts
        if (btnCancel) btnCancel.style.display = 'none';
        if (btnOk) btnOk.style.display = '';

        function cleanup() {
            overlay.classList.add("hidden");
            btnOk.onclick = null;
            // Restore cancel button for next confirm
            if (btnCancel) btnCancel.style.display = '';
            resolve();
        }

        btnOk.onclick = () => cleanup();
    });
}

// ================================
// CUISINES - CREATE NEW
// ================================
async function createNewCuisine() {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error("No user logged in");
            return;
        }
        
        // Get workspace filter
        const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
        
        const cuisineData = {
            name: "Cuisine",
            count: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add appropriate ownership field based on workspace
        if (workspaceFilter.type === 'personal') {
            cuisineData.userId = user.uid;
            cuisineData.teamspaceId = null;
        } else {
            cuisineData.teamspaceId = workspaceFilter.teamspaceId;
            cuisineData.createdBy = user.uid;
        }
        
        const docRef = await db.collection("cuisines").add(cuisineData);

        console.log("Created cuisine:", docRef.id);
        
        // Add the new cuisine directly to the list with animation
        const list = document.getElementById("cuisines-list");
        if (!list) return;

        const newData = { name: "Cuisine", count: 0 };
        addCuisineRow(list, docRef.id, newData, true); // true = animate in
        
    } catch (err) {
        console.error("Error creating cuisine:", err);
    }
}

// Create default cuisines for a teamspace (same defaults as personal workspace)
async function createDefaultCuisinesForTeamspace(teamspaceId, createdBy) {
    // Use the same defaults as personal workspace
    const defaultCuisines = [
        { name: "To Make", iconUrl: "Images/Icons/apron.png", order: 1 },
        { name: "Breakfast", iconUrl: "Images/Icons/pan.png", order: 2 },
        { name: "Dessert", iconUrl: "Images/Icons/cupcake.png", order: 3 },
        { name: "Drinks", iconUrl: "Images/Icons/coffee-cup.png", order: 4 },
        { name: "Mains", iconUrl: "Images/Icons/drumstick.png", order: 5 },
        { name: "Sauces", iconUrl: "Images/Icons/sauce.png", order: 6 },
        { name: "Sides", iconUrl: "Images/Icons/broccoli.png", order: 7 },
        { name: "Snacks", iconUrl: "Images/Icons/pretzel.png", order: 8 },
        { name: "American", iconUrl: "Images/Icons/hamburger.png", order: 9 },
        { name: "Chinese", iconUrl: "Images/Icons/noodles.png", order: 10 },
        { name: "Italian", iconUrl: "Images/Icons/bowl.png", order: 11 },
        { name: "Christmas Recipes", iconUrl: "Images/Icons/christmas.png", order: 12 },
        { name: "Fall Recipes", iconUrl: "Images/Icons/halloween.png", order: 13 }
    ];
    
    const batch = db.batch();
    
    for (const cuisine of defaultCuisines) {
        const docRef = db.collection('cuisines').doc();
        batch.set(docRef, {
            name: cuisine.name,
            iconUrl: cuisine.iconUrl,
            order: cuisine.order,
            teamspaceId: teamspaceId,
            createdBy: createdBy,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    try {
        await batch.commit();
        console.log('Created default cuisines for teamspace');
    } catch (error) {
        console.error('Error creating default cuisines for teamspace:', error);
    }
}


// Helper function to create and add a cuisine row
function addCuisineRow(list, id, data, animate = false, isSpecial = false) {
    const row = document.createElement("div");
    row.classList.add("cuisine-row");
    if (isSpecial) {
        row.classList.add("cuisine-row-special");
        row.setAttribute("draggable", "false");
    } else {
        row.setAttribute("draggable", "true");
    }
    row.setAttribute("data-id", id);

    // Start invisible if animating
    if (animate) {
        row.style.opacity = "0";
        row.style.transform = "translateX(-10px)";
    }

    row.innerHTML = `
        <div class="cuisine-drop-indicator cuisine-drop-indicator-top"></div>
        
        <div class="cuisine-dots">
            <img src="Images/dots.png" class="dots-icon">
        </div>

        ${isSpecial ? '' : '<div class="cuisine-delete-btn">×</div>'}

        <div class="cuisine-main">
            <div class="cuisine-count">${data.count || 0}</div>
            ${(() => {
                const cursorStyle = isSpecial ? 'cursor: default;' : 'cursor: pointer;';
                if (!data.iconUrl || data.iconUrl === 'Images/cuisine.png') {
                    return `<img src="Images/cuisine.png" class="cuisine-row-icon" data-cuisine-id="${id}" style="${cursorStyle}">`;
                }
                // Check if it's JSON (SVG icon)
                try {
                    const iconObj = JSON.parse(data.iconUrl);
                    if (iconObj.svg) {
                        return `<div class="cuisine-row-icon-svg" data-cuisine-id="${id}" style="${cursorStyle} display: inline-flex; align-items: center; justify-content: center;">${sanitizeSvg(iconObj.svg).replace('<svg', '<svg width="22" height="22" style="stroke: #333; fill: none;"')}</div>`;
                    }
                } catch (e) {
                    // Not JSON, check if emoji or image
                    if (!data.iconUrl.startsWith('data:') && !data.iconUrl.startsWith('Images/') && !data.iconUrl.startsWith('http')) {
                        return `<span class="cuisine-row-icon-emoji" data-cuisine-id="${id}" style="${cursorStyle}">${escapeHtml(data.iconUrl)}</span>`;
                    } else {
                        return `<img src="${safeImageSrc(data.iconUrl, 'Images/cuisine.png')}" class="cuisine-row-icon" data-cuisine-id="${id}" style="${cursorStyle}">`;
                    }
                }
            })()}
            <input class="cuisine-name-input" value="${escapeHtml(data.name)}" ${isSpecial ? 'readonly' : 'readonly'}>
        </div>

        ${isSpecial ? '' : '<div class="cuisine-edit-btn"><img src="Images/edit.png" class="edit-icon"></div>'}
        
        <div class="cuisine-drop-indicator cuisine-drop-indicator-bottom"></div>
    `;

    // Insert logic: special rows go at the top, regular rows go after special rows
    if (isSpecial) {
        // Insert special rows at the very top
        if (list.firstChild) {
            list.insertBefore(row, list.firstChild);
        } else {
            list.appendChild(row);
        }
    } else {
        // Find the first non-special row (after Favorites)
        const firstRegularRow = list.querySelector('.cuisine-row:not(.cuisine-row-special)');
        if (firstRegularRow) {
            list.insertBefore(row, firstRegularRow);
        } else {
            // No regular rows yet, append to end
            list.appendChild(row);
        }
    }

    // No need for trailing indicator anymore
    
    const editBtn = row.querySelector(".cuisine-edit-btn");
    const deleteBtn = row.querySelector(".cuisine-delete-btn");
    const input = row.querySelector(".cuisine-name-input");
    const iconImg = row.querySelector(".cuisine-row-icon");
    const iconEmoji = row.querySelector(".cuisine-row-icon-emoji");
    const iconSvg = row.querySelector(".cuisine-row-icon-svg");

    // Add click listener to icon to open icon picker
    if ((iconImg || iconEmoji || iconSvg) && !isSpecial) {
        const iconElement = iconImg || iconEmoji || iconSvg;
        iconElement.addEventListener("click", (e) => {
            e.stopPropagation();
            openIconPicker(id, data.iconUrl || 'Images/cuisine.png', iconElement);
        });
    }

    if (editBtn) {
        editBtn.addEventListener("click", () => {
            input.removeAttribute('readonly');
            input.focus();
            requestAnimationFrame(() => {
                const end = input.value.length;
                input.setSelectionRange(end, end);
            });
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
            const confirmed = await macConfirm("Delete this cuisine? This cannot be undone.");
            if (!confirmed) return;

            try {
                // Get the order of the deleted cuisine BEFORE deleting
                const deletedDoc = await db.collection("cuisines").doc(id).get();
                const deletedData = deletedDoc.exists ? deletedDoc.data() : null;
                const deletedOrder = deletedData && typeof deletedData.order === 'number' ? deletedData.order : null;
                
                // Delete the cuisine
                await db.collection("cuisines").doc(id).delete();
                
                // Reorder remaining cuisines if we have a valid order
                if (deletedOrder !== null && deletedOrder !== undefined) {
                    const user = auth.currentUser;
                    if (user) {
                        // Get ALL user's cuisines (no compound query needed)
                        const snapshot = await db.collection("cuisines")
                            .where("userId", "==", user.uid)
                            .get();
                        
                        // Filter and update only those with order > deletedOrder
                        const batch = db.batch();
                        let updateCount = 0;
                        
                        snapshot.forEach(doc => {
                            const cuisineData = doc.data();
                            if (cuisineData.order > deletedOrder) {
                                batch.update(doc.ref, { order: cuisineData.order - 1 });
                                updateCount++;
                            }
                        });
                        
                        if (updateCount > 0) {
                            await batch.commit();
                        }
                    }
                }
                
                // Reload cuisines immediately to show correct order
                await loadCuisinesWithFade();
            } catch (error) {
                console.error('Error deleting cuisine:', error);
                // Still reload to show correct state
                await loadCuisinesWithFade();
            }
        });
    }

    if (!isSpecial) {
        input.addEventListener("blur", async () => {
            input.setAttribute('readonly', 'readonly');
            await db.collection("cuisines").doc(id).update({
                name: input.value.trim()
            });
        });
    }

    // Add click handler to open cuisine detail panel
    // Click on the cuisine-main area (count + name) to open
    const cuisineMain = row.querySelector('.cuisine-main');
    if (cuisineMain) {
        // Track if drag started to prevent click from firing
        let dragStarted = false;
        
        // Listen for dragstart to know if user is dragging
        row.addEventListener('dragstart', () => {
            dragStarted = true;
        }, { capture: true });
        
        // Reset drag flag when drag ends
        row.addEventListener('dragend', () => {
            setTimeout(() => {
                dragStarted = false;
            }, 100);
        });
        
        // Function to open panel
        const handleCuisineClick = (e) => {
            // Don't open if a drag operation started
            if (dragStarted) {
                dragStarted = false;
                return;
            }
            
            // Don't open if clicking on interactive elements (but allow name input clicks)
            if (e.target.closest('.cuisine-row-icon, .cuisine-row-icon-emoji, .cuisine-row-icon-svg, .cuisine-edit-btn, .cuisine-delete-btn, .cuisine-dots')) {
                return;
            }
            
            e.stopPropagation(); // Prevent event bubbling
            e.preventDefault(); // Prevent default behavior
            
            const cuisineId = row.getAttribute('data-id');
            const cuisineName = input?.value || 'Cuisine';
            const cuisineCount = row.querySelector('.cuisine-count')?.textContent || '0';
            
            // Get icon
            let cuisineIcon = 'Images/cuisine.png';
            const iconImg = row.querySelector('.cuisine-row-icon');
            const iconEmoji = row.querySelector('.cuisine-row-icon-emoji');
            const iconSvg = row.querySelector('.cuisine-row-icon-svg');
            
            if (iconEmoji) {
                cuisineIcon = iconEmoji.textContent;
            } else if (iconSvg) {
                const svg = iconSvg.innerHTML;
                cuisineIcon = JSON.stringify({ svg: svg });
            } else if (iconImg) {
                cuisineIcon = iconImg.src;
            }
            
            console.log('🟢 Opening cuisine panel from row click', { cuisineId, cuisineName, cuisineIcon });
            
            try {
                if (typeof openCuisineDetailPanel === 'function') {
                    openCuisineDetailPanel(cuisineId, cuisineName, cuisineIcon, cuisineCount);
                } else {
                    console.error('openCuisineDetailPanel function not found');
                }
            } catch (error) {
                console.error('Error opening cuisine panel:', error);
            }
        };
        
        // Attach click handler to cuisine-main
        cuisineMain.addEventListener('click', handleCuisineClick);
        
        // Also attach to row as fallback (but check if click is in cuisine-main)
        row.addEventListener('click', (e) => {
            if (cuisineMain.contains(e.target)) {
                handleCuisineClick(e);
            }
        });
        
        // Add visual feedback
        cuisineMain.style.cursor = 'pointer';
    }

    // Animate in if requested
    if (animate) {
        row.style.transition = "opacity 0.4s ease, transform 0.4s ease";
        // Small delay to ensure the initial invisible state is rendered first
        setTimeout(() => {
            row.style.opacity = "1";
            row.style.transform = "translateX(0)";
        }, 10);
    }

    // Re-enable drag and drop for all rows
    enableDragAndDrop();

    return row;
}

async function ensureDefaultCuisinesForWorkspace(workspaceFilter, userId) {
    if (!workspaceFilter || !workspaceFilter.type) {
        workspaceFilter = { type: 'personal' };
    }

    let query = db.collection('cuisines');

    if (workspaceFilter.type === 'personal') {
        query = query.where('userId', '==', userId);
    } else {
        query = query.where('teamspaceId', '==', workspaceFilter.teamspaceId);
    }

    const snapshot = await query.limit(1).get();
    if (!snapshot.empty) return;

    const defaultCuisines = [
        { name: "To Make", iconUrl: "Images/Icons/apron.png", order: 1 },
        { name: "Breakfast", iconUrl: "Images/Icons/pan.png", order: 2 },
        { name: "Dessert", iconUrl: "Images/Icons/cupcake.png", order: 3 },
        { name: "Drinks", iconUrl: "Images/Icons/coffee-cup.png", order: 4 },
        { name: "Mains", iconUrl: "Images/Icons/drumstick.png", order: 5 },
        { name: "Sauces", iconUrl: "Images/Icons/sauce.png", order: 6 },
        { name: "Sides", iconUrl: "Images/Icons/broccoli.png", order: 7 },
        { name: "Snacks", iconUrl: "Images/Icons/pretzel.png", order: 8 },
        { name: "American", iconUrl: "Images/Icons/hamburger.png", order: 9 },
        { name: "Chinese", iconUrl: "Images/Icons/noodles.png", order: 10 },
        { name: "Italian", iconUrl: "Images/Icons/bowl.png", order: 11 },
        { name: "Christmas Recipes", iconUrl: "Images/Icons/christmas.png", order: 12 },
        { name: "Fall Recipes", iconUrl: "Images/Icons/halloween.png", order: 13 }
    ];

    const batch = db.batch();

    defaultCuisines.forEach(cuisine => {
        const ref = db.collection('cuisines').doc();
        batch.set(ref, {
            ...cuisine,
            userId: workspaceFilter.type === 'personal' ? userId : null,
            teamspaceId: workspaceFilter.type === 'teamspace' ? workspaceFilter.teamspaceId : null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    });

    await batch.commit();
    console.log('✨ Default cuisines created for workspace');
}


// ================================
// CUISINES - LOAD LIST
// ================================
// Wrapper function with fade transition
async function loadCuisinesWithFade(sortBy = 'order', sortOrder = 'desc') {
    const list = document.getElementById("cuisines-list");
    if (!list) return;
    
    // Store current height to maintain layout
    const currentHeight = list.offsetHeight;
    if (currentHeight > 0) {
        list.style.minHeight = currentHeight + 'px';
    }
    
    // Fade out
    list.style.opacity = '0';
    list.style.transition = 'opacity 0.2s ease';
    
    // Wait for fade out to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Load cuisines (this will clear and rebuild the list)
    await loadCuisines(sortBy, sortOrder);
    
    // Remove min-height after content is loaded
    list.style.minHeight = '';
    
    // Force reflow
    void list.offsetHeight;
    
    // Fade back in
    requestAnimationFrame(() => {
        list.style.opacity = '';
    });
}

async function loadCuisines(sortBy = 'order', sortOrder = 'desc') {
    const list = document.getElementById("cuisines-list");
    if (!list) return;

    const user = auth.currentUser;
    if (!user) {
        console.error("No user logged in");
        return;
    }

    list.innerHTML = "";
    
    // Get workspace filter
    const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
    console.log('ðŸ“¦ Loading cuisines for workspace:', workspaceFilter);
    
    // Ensure default cuisines exist for this workspace
    await ensureDefaultCuisinesForWorkspace(workspaceFilter, user.uid);

    try {
        // Build queries based on workspace type
        let cuisinesQuery;
        
        if (workspaceFilter.type === 'personal') {
            cuisinesQuery = db.collection("cuisines")
                .where("userId", "==", user.uid);
        } else {
            cuisinesQuery = db.collection("cuisines")
                .where("teamspaceId", "==", workspaceFilter.teamspaceId);
        }
        
        // Add "Favorites" first as a special cuisine (count will be calculated below)
        const favoritesData = { name: "Favorites", count: 0, iconUrl: "Images/star-black.png" };
        addCuisineRow(list, "FAVORITES", favoritesData, false, true);

        const snapshot = await cuisinesQuery.get();

        // Convert to array and calculate counts if needed
        const items = [];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });

        // Always calculate counts for each cuisine (needed for display)
        let recipesQuery;
        if (workspaceFilter.type === 'personal') {
            // Personal workspace: query user's recipes, will filter out teamspace ones below
            recipesQuery = db.collection("recipes").where("userId", "==", user.uid);
        } else {
            recipesQuery = db.collection("recipes").where("teamspaceId", "==", workspaceFilter.teamspaceId);
        }
        
        const recipesSnapshot = await recipesQuery.get();
        
        // Count by ID (new format) and by name (backward compatibility)
        const cuisineCountsById = {};
        const cuisineCountsByName = {};
        
        recipesSnapshot.forEach(doc => {
            const recipeData = doc.data();
            
            // Skip teamspace recipes when in personal workspace
            if (workspaceFilter.type === 'personal' && recipeData.teamspaceId) {
                return;
            }
            
            const cuisines = recipeData.cuisines || (recipeData.cuisine ? [recipeData.cuisine] : []);
            cuisines.forEach(cuisine => {
                if (cuisine) {
                    // Handle both old format (string name) and new format (object with id/name)
                    if (typeof cuisine === 'string') {
                        cuisineCountsByName[cuisine] = (cuisineCountsByName[cuisine] || 0) + 1;
                    } else if (cuisine.id) {
                        cuisineCountsById[cuisine.id] = (cuisineCountsById[cuisine.id] || 0) + 1;
                    } else if (cuisine.name) {
                        cuisineCountsByName[cuisine.name] = (cuisineCountsByName[cuisine.name] || 0) + 1;
                    }
                }
            });
        });
        
        // Add counts to items (prefer ID count, fallback to name count)
        items.forEach(item => {
            if (cuisineCountsById[item.id] !== undefined) {
                item.count = cuisineCountsById[item.id];
            } else {
                item.count = cuisineCountsByName[item.name] || 0;
            }
        });

        // Update Favorites count from calculated counts
        const favoritesRow = list.querySelector('[data-id="FAVORITES"]');
        if (favoritesRow) {
            const countElement = favoritesRow.querySelector('.cuisine-count');
            if (countElement) {
                countElement.textContent = cuisineCountsByName["Favorites"] || 0;
            }
        }

        // Sort the items
        items.sort((a, b) => {
            let compareResult = 0;
            
            if (sortBy === 'order') {
                // Sort by custom order field
                const orderA = a.order || 999;
                const orderB = b.order || 999;
                compareResult = orderA - orderB; // Lower order numbers first (1, 2, 3...)
            } else if (sortBy === 'name') {
                compareResult = (a.name || 'Untitled').localeCompare(b.name || 'Untitled');
            } else if (sortBy === 'date') {
                const dateA = a.createdAt?.toMillis() || 0;
                const dateB = b.createdAt?.toMillis() || 0;
                compareResult = dateB - dateA; // Default newest first for dates
            } else if (sortBy === 'count') {
                // Sort by count (number of recipes)
                const countA = a.count || 0;
                const countB = b.count || 0;
                compareResult = countB - countA; // Default highest first
                
                // If counts are equal, sort alphabetically
                if (compareResult === 0) {
                    compareResult = (a.name || 'Untitled').localeCompare(b.name || 'Untitled');
                }
            }
            
            // Reverse if descending (except date and count which default to desc)
            if (sortBy !== 'date' && sortBy !== 'count' && sortOrder === 'desc') {
                compareResult = -compareResult;
            } else if (sortBy === 'date' && sortOrder === 'asc') {
                compareResult = -compareResult;
            } else if (sortBy === 'count' && sortOrder === 'asc') {
                compareResult = -compareResult;
            } else if (sortBy === 'order' && sortOrder === 'desc') {
                compareResult = -compareResult;
            }
            
            return compareResult;
        });

        // Render sorted items (Favorites is already added)
        items.forEach(item => {
            addCuisineRow(list, item.id, item, false); // false = no animation on initial load
        });

        enableDragAndDrop();
        
        // Update all cuisine counts after loading
        await updateAllCuisineCounts();
    } catch (error) {
        console.error("Error loading cuisines:", error);
    }
}


let draggedCuisine = null;

function enableDragAndDrop() {
    const rows = document.querySelectorAll(".cuisine-row");
    const list = document.getElementById("cuisines-list");
    
    // Guard: if no cuisines list exists, exit early
    if (!list) {
        console.log('No cuisines list found, skipping drag and drop init');
        return;
    }
    
    console.log('enableDragAndDrop called, found rows:', rows.length);

    rows.forEach(row => {
        // Skip special rows (like Favorites) - they are not draggable
        if (row.classList.contains('cuisine-row-special')) {
            return;
        }
        
        // Make sure draggable attribute is set
        row.setAttribute('draggable', 'true');
        
        // Skip if already initialized (prevents duplicate listeners)
        if (row.dataset.dragInit) return;
        row.dataset.dragInit = 'true';
        
        row.addEventListener("dragstart", (e) => {
            draggedCuisine = row;
            row.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        });

        row.addEventListener("dragend", () => {
            if (draggedCuisine) {
                draggedCuisine.classList.remove("dragging");
            }
            // Clear all indicators
            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");
            draggedCuisine = null;
        });

        row.addEventListener("dragenter", (e) => {
            e.preventDefault();
            if (!draggedCuisine || draggedCuisine === row || row.getAttribute('data-id') === 'FAVORITES') return;
        });

        row.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (!draggedCuisine || draggedCuisine === row || row.getAttribute('data-id') === 'FAVORITES') return;

            // Clear all indicators
            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");

            const rect = row.getBoundingClientRect();
            const mouseY = e.clientY;
            const rowMiddle = rect.top + (rect.height / 2);

            if (mouseY < rowMiddle) {
                // Show indicator above this row
                const topIndicator = row.querySelector('.cuisine-drop-indicator-top');
                if (topIndicator) topIndicator.style.display = 'block';
            } else {
                // Show indicator below this row
                const bottomIndicator = row.querySelector('.cuisine-drop-indicator-bottom');
                if (bottomIndicator) bottomIndicator.style.display = 'block';
            }
        });

        row.addEventListener("dragleave", (e) => {
            // Only clear if leaving the row entirely
            if (!row.contains(e.relatedTarget)) {
                const topIndicator = row.querySelector('.cuisine-drop-indicator-top');
                const bottomIndicator = row.querySelector('.cuisine-drop-indicator-bottom');
                if (topIndicator) topIndicator.style.display = 'none';
                if (bottomIndicator) bottomIndicator.style.display = 'none';
            }
        });

        row.addEventListener("drop", async (e) => {
            e.preventDefault();
            if (!draggedCuisine || draggedCuisine === row || row.getAttribute('data-id') === 'FAVORITES') return;

            const rect = row.getBoundingClientRect();
            const mouseY = e.clientY;
            const rowMiddle = rect.top + (rect.height / 2);

            if (mouseY < rowMiddle) {
                list.insertBefore(draggedCuisine, row);
            } else {
                list.insertBefore(draggedCuisine, row.nextSibling);
            }

            await saveNewOrder();
        });
    });
}

async function saveNewOrder() {
    const rows = document.querySelectorAll(".cuisine-row:not(.cuisine-row-special)");

    const batch = db.batch();

    rows.forEach((row, index) => {
        const id = row.getAttribute("data-id");
        // Skip Favorites and other special rows
        if (id === "FAVORITES") return;
        const ref = db.collection("cuisines").doc(id);
        batch.update(ref, { order: index });
    });

    await batch.commit();
}


// ================================
// ICON PICKER
// ================================
let currentCuisineIdForIcon = null;

// Global function to close icon picker modal
function closeIconPickerModal() {
    const modal = document.getElementById('icon-picker-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active');
    }
    currentCuisineIdForIcon = null;
}

// Food/cuisine-related emojis
// Emoji icons with names for searching
const emojiIcons = [
    { emoji: '🥑', name: 'avocado' },
    { emoji: '🍼', name: 'baby bottle' },
    { emoji: '🥓', name: 'bacon' },
    { emoji: '🥯', name: 'bagel' },
    { emoji: '🥖', name: 'baguette bread' },
    { emoji: '🍌', name: 'banana' },
    { emoji: '🍺', name: 'beer mug' },
    { emoji: '🍱', name: 'bento box' },
    { emoji: '🧃', name: 'beverage box' },
    { emoji: '🎂', name: 'birthday cake' },
    { emoji: '🦴', name: 'bone' },
    { emoji: '🍾', name: 'champagne bottle' },
    { emoji: '🥣', name: 'bowl with spoon' },
    { emoji: '🍞', name: 'bread' },
    { emoji: '🥦', name: 'broccoli' },
    { emoji: '🧋', name: 'bubble tea' },
    { emoji: '🌯', name: 'burrito' },
    { emoji: '🍬', name: 'candy' },
    { emoji: '🥫', name: 'canned food' },
    { emoji: '🧀', name: 'cheese' },
    { emoji: '🍒', name: 'cherries' },
    { emoji: '🌰', name: 'chestnut' },
    { emoji: '🥢', name: 'chopsticks' },
    { emoji: '🍫', name: 'chocolate bar' },
    { emoji: '🍻', name: 'clinking beer mugs' },
    { emoji: '🥂', name: 'clinking glasses' },
    { emoji: '🥥', name: 'coconut' },
    { emoji: '🍸', name: 'cocktail glass' },
    { emoji: '🍚', name: 'cooked rice' },
    { emoji: '🍪', name: 'cookie' },
    { emoji: '🌽', name: 'corn' },
    { emoji: '🥐', name: 'croissant' },
    { emoji: '🥒', name: 'cucumber' },
    { emoji: '🥤', name: 'cup with straw' },
    { emoji: '🍛', name: 'curry rice' },
    { emoji: '🍮', name: 'custard pudding' },
    { emoji: '🍡', name: 'dango' },
    { emoji: '🍩', name: 'doughnut donut' },
    { emoji: '🥟', name: 'dumpling' },
    { emoji: '🥚', name: 'egg' },
    { emoji: '🍆', name: 'eggplant' },
    { emoji: '🍥', name: 'fish cake' },
    { emoji: '🍴', name: 'fork and knife' },
    { emoji: '🍽️', name: 'fork and knife with plate' },
    { emoji: '🥠', name: 'fortune cookie' },
    { emoji: '🍳', name: 'fried egg cooking' },
    { emoji: '🍤', name: 'fried shrimp' },
    { emoji: '🍟', name: 'fries french fries' },
    { emoji: '🧄', name: 'garlic' },
    { emoji: '🥛', name: 'glass of milk' },
    { emoji: '🍇', name: 'grapes' },
    { emoji: '🍏', name: 'green apple' },
    { emoji: '🍔', name: 'hamburger burger' },
    { emoji: '🍯', name: 'honey pot' },
    { emoji: '☕', name: 'hot beverage coffee' },
    { emoji: '🌭', name: 'hot dog' },
    { emoji: '🌶️', name: 'hot pepper' },
    { emoji: '🧊', name: 'ice' },
    { emoji: '🍨', name: 'ice cream' },
    { emoji: '🥬', name: 'leafy greens' },
    { emoji: '🍋', name: 'lemon' },
    { emoji: '🍭', name: 'lollipop' },
    { emoji: '🥭', name: 'mango' },
    { emoji: '🧉', name: 'mate' },
    { emoji: '🍖', name: 'meat on bone' },
    { emoji: '🍈', name: 'melon' },
    { emoji: '🥮', name: 'moon cake' },
    { emoji: '🍄', name: 'mushroom' },
    { emoji: '🍢', name: 'oden' },
    { emoji: '🧅', name: 'onion' },
    { emoji: '🦪', name: 'oyster' },
    { emoji: '🥞', name: 'pancakes' },
    { emoji: '🍑', name: 'peach' },
    { emoji: '🍐', name: 'pear' },
    { emoji: '🥜', name: 'peanuts' },
    { emoji: '🥧', name: 'pie' },
    { emoji: '🍍', name: 'pineapple' },
    { emoji: '🍕', name: 'pizza' },
    { emoji: '🍿', name: 'popcorn' },
    { emoji: '🍲', name: 'pot food stew' },
    { emoji: '🥔', name: 'potato' },
    { emoji: '🍗', name: 'poultry leg' },
    { emoji: '🥨', name: 'pretzel' },
    { emoji: '🍎', name: 'red apple' },
    { emoji: '🍙', name: 'rice ball' },
    { emoji: '🍘', name: 'rice cracker' },
    { emoji: '🍶', name: 'sake' },
    { emoji: '🥗', name: 'salad' },
    { emoji: '🧂', name: 'salt' },
    { emoji: '🥪', name: 'sandwich' },
    { emoji: '🍧', name: 'shaved ice' },
    { emoji: '🍰', name: 'shortcake cake' },
    { emoji: '🍦', name: 'soft ice cream' },
    { emoji: '🍝', name: 'spaghetti pasta' },
    { emoji: '🥄', name: 'spoon' },
    { emoji: '🥩', name: 'steak' },
    { emoji: '🍜', name: 'steaming bowl ramen' },
    { emoji: '🍓', name: 'strawberry' },
    { emoji: '🥙', name: 'stuffed flatbread' },
    { emoji: '🍣', name: 'sushi' },
    { emoji: '🌮', name: 'taco' },
    { emoji: '🥡', name: 'takeout box' },
    { emoji: '🍊', name: 'tangerine orange' },
    { emoji: '🍵', name: 'teacup tea' },
    { emoji: '🫖', name: 'teapot' },
    { emoji: '🍅', name: 'tomato' },
    { emoji: '🍹', name: 'tropical drink' },
    { emoji: '🥃', name: 'tumbler glass' },
    { emoji: '🧇', name: 'waffle' },
    { emoji: '🍉', name: 'watermelon' },
    { emoji: '🍷', name: 'wine glass' }
];


const iconOptions = [
    { name: 'apple', image: 'Images/Icons/apple.png' },
    { name: 'apron', image: 'Images/Icons/apron.png' },
    { name: 'bananas', image: 'Images/Icons/bananas.png' },
    { name: 'bowl', image: 'Images/Icons/bowl.png' },
    { name: 'bowl-stuffing', image: 'Images/Icons/bowl-stuffing.png' },
    { name: 'bread', image: 'Images/Icons/bread.png' },
    { name: 'broccoli', image: 'Images/Icons/broccoli.png' },
    { name: 'cake', image: 'Images/Icons/cake.png' },
    { name: 'candycane', image: 'Images/Icons/candycane.png' },
    { name: 'carrot', image: 'Images/Icons/carrot.png' },
    { name: 'champagne', image: 'Images/Icons/champagne.png' },
    { name: 'cheese', image: 'Images/Icons/cheese.png' },
    { name: 'cherries', image: 'Images/Icons/cherries.png' },
    { name: 'christmas', image: 'Images/Icons/christmas.png' },
    { name: 'coffee', image: 'Images/Icons/coffee.png' },
    { name: 'coffee-cup', image: 'Images/Icons/coffee-cup.png' },
    { name: 'cookie', image: 'Images/Icons/cookie.png' },
    { name: 'corn', image: 'Images/Icons/corn.png' },
    { name: 'crab', image: 'Images/Icons/crab.png' },
    { name: 'croissant', image: 'Images/Icons/croissant.png' },
    { name: 'cupcake', image: 'Images/Icons/cupcake.png' },
    { name: 'donut', image: 'Images/Icons/donut.png' },
    { name: 'drumstick', image: 'Images/Icons/drumstick.png' },
    { name: 'egg', image: 'Images/Icons/egg.png' },
    { name: 'fast-food', image: 'Images/Icons/fast-food.png' },
    { name: 'fish', image: 'Images/Icons/fish.png' },
    { name: 'flower', image: 'Images/Icons/flower.png' },
    { name: 'goblet', image: 'Images/Icons/goblet.png' },
    { name: 'grapes', image: 'Images/Icons/grapes.png' },
    { name: 'halloween', image: 'Images/Icons/halloween.png' },
    { name: 'hamburger', image: 'Images/Icons/hamburger.png' },
    { name: 'hotdog', image: 'Images/Icons/hotdog.png' },
    { name: 'icecream', image: 'Images/Icons/icecream.png' },
    { name: 'jar', image: 'Images/Icons/jar.png' },
    { name: 'juice', image: 'Images/Icons/juice.png' },
    { name: 'lemon', image: 'Images/Icons/lemon.png' },
    { name: 'lolipop', image: 'Images/Icons/lolipop.png' },
    { name: 'martini', image: 'Images/Icons/martini.png' },
    { name: 'menorah', image: 'Images/Icons/menorah.png' },
    { name: 'mug', image: 'Images/Icons/mug.png' },
    { name: 'mushroom', image: 'Images/Icons/mushroom.png' },
    { name: 'noodles', image: 'Images/Icons/noodles.png' },
    { name: 'onion', image: 'Images/Icons/onion.png' },
    { name: 'orange', image: 'Images/Icons/orange.png' },
    { name: 'pan', image: 'Images/Icons/pan.png' },
    { name: 'pancakes', image: 'Images/Icons/pancakes.png' },
    { name: 'peanut', image: 'Images/Icons/peanut.png' },
    { name: 'pear', image: 'Images/Icons/pear.png' },
    { name: 'pepper', image: 'Images/Icons/pepper.png' },
    { name: 'pie', image: 'Images/Icons/pie.png' },
    { name: 'pizza', image: 'Images/Icons/pizza.png' },
    { name: 'popcorn', image: 'Images/Icons/popcorn.png' },
    { name: 'pot', image: 'Images/Icons/pot.png' },
    { name: 'pretzel', image: 'Images/Icons/pretzel.png' },
    { name: 'salad', image: 'Images/Icons/salad.png' },
    { name: 'sandwich', image: 'Images/Icons/sandwich.png' },
    { name: 'sauce', image: 'Images/Icons/sauce.png' },
    { name: 'shopping', image: 'Images/Icons/shopping.png' },
    { name: 'shrimp', image: 'Images/Icons/shrimp.png' },
    { name: 'soup', image: 'Images/Icons/soup.png' },
    { name: 'st.patricks', image: 'Images/Icons/st.patricks.png' },
    { name: 'steak', image: 'Images/Icons/steak.png' },
    { name: 'strawberry', image: 'Images/Icons/strawberry.png' },
    { name: 'sushi', image: 'Images/Icons/suhsi.png' },
    { name: 'taco', image: 'Images/Icons/taco.png' },
    { name: 'takeout', image: 'Images/Icons/takeout.png' },
    { name: 'tea', image: 'Images/Icons/tea.png' },
    { name: 'toaster', image: 'Images/Icons/toaster.png' },
    { name: 'turkey', image: 'Images/Icons/turkey.png' },
    { name: 'utensils', image: 'Images/Icons/utensils.png' },
    { name: 'whiskey', image: 'Images/Icons/whiskey.png' }
];


function initIconPicker() {
    const modal = document.getElementById('icon-picker-modal');
    const closeBtn = document.getElementById('icon-picker-close');
    const removeBtn = document.getElementById('icon-picker-remove');
    const tabs = document.querySelectorAll('.icon-picker-tab');
    const searchInput = document.getElementById('icon-picker-search');
    const uploadBtn = document.getElementById('icon-picker-upload-btn');
    const fileInput = document.getElementById('icon-picker-file-input');
    const cuisineList = document.getElementById('cuisines-list');

    // Close modal - use global function
    function closeModal() {
        closeIconPickerModal();
    }
    
    // Prevent clicks inside modal from closing it
    if (modal) {
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Event delegation for icon clicks on the cuisine list
    // This handles both existing and dynamically created icons
    if (cuisineList) {
        cuisineList.addEventListener('click', (e) => {
            const clickedIcon = e.target.closest('.cuisine-row-icon, .cuisine-row-icon-emoji, .cuisine-row-icon-svg');
            if (clickedIcon) {
                const row = clickedIcon.closest('.cuisine-row');
                if (row && !row.classList.contains('cuisine-row-special')) {
                    e.stopPropagation();
                    // Don't open if modal is already open for this icon
                    if (modal.classList.contains('active') && currentCuisineIdForIcon) {
                        const cuisineId = clickedIcon.getAttribute('data-cuisine-id') || row.getAttribute('data-id');
                        if (cuisineId === currentCuisineIdForIcon) {
                            return; // Already open for this icon
                        }
                    }
                    
                    const cuisineId = clickedIcon.getAttribute('data-cuisine-id') || row.getAttribute('data-id');
                    if (cuisineId) {
                        // Get current icon value
                        let currentIcon = 'Images/cuisine.png';
                        if (clickedIcon.tagName === 'IMG' && clickedIcon.src) {
                            currentIcon = clickedIcon.src;
                        } else if (clickedIcon.classList.contains('cuisine-row-icon-emoji') && clickedIcon.textContent) {
                            currentIcon = clickedIcon.textContent.trim();
                        } else if (clickedIcon.classList.contains('cuisine-row-icon-svg') && clickedIcon.innerHTML) {
                            // For SVG, we need to get the stored iconUrl from the row data
                            currentIcon = clickedIcon.innerHTML.trim();
                        }
                        openIconPicker(cuisineId, currentIcon, clickedIcon);
                    }
                }
            }
        });
    }

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeModal();
        });
    }
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (modal && modal.classList.contains('active') && !modal.contains(e.target)) {
            const clickedIcon = e.target.closest('.cuisine-row-icon, .cuisine-row-icon-emoji, .cuisine-row-icon-svg');
            if (!clickedIcon) {
                closeModal();
            } else {
                // If clicking an icon while modal is open, open the picker for that icon
                const iconElement = clickedIcon;
                const cuisineId = iconElement.getAttribute('data-cuisine-id');
                if (cuisineId) {
                    const currentIcon = iconElement.src || iconElement.textContent || iconElement.innerHTML;
                    openIconPicker(cuisineId, currentIcon, iconElement);
                }
            }
        }
    });

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            document.querySelectorAll('.icon-picker-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`icon-picker-${tabName}`).classList.add('active');
            
            // Load content if needed
            if (tabName === 'emoji' && document.getElementById('icon-picker-emoji-grid').children.length === 0) {
                loadEmojiIcons();
            } else if (tabName === 'icons' && document.getElementById('icon-picker-icons-grid').children.length === 0) {
                loadIconOptions();
            }
            
            // Reapply current filter when switching tabs
            if (searchInput && searchInput.value) {
                const filter = searchInput.value.toLowerCase();
                if (tabName === 'emoji') {
                    filterIcons('icon-picker-emoji-grid', filter);
                } else if (tabName === 'icons') {
                    filterIcons('icon-picker-icons-grid', filter);
                }
            }
        });
    });

    // Search filter
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const filter = e.target.value;
            const activeTab = document.querySelector('.icon-picker-tab.active')?.dataset.tab;
            
            if (activeTab === 'emoji') {
                filterIcons('icon-picker-emoji-grid', filter);
            } else if (activeTab === 'icons') {
                filterIcons('icon-picker-icons-grid', filter);
            }
        });
    }

    // Remove button
    if (removeBtn) {
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentCuisineIdForIcon) return;
            
            await db.collection('cuisines').doc(currentCuisineIdForIcon).update({
                iconUrl: 'Images/cuisine.png'
            });
            
            // Update UI - replace with default icon
            const row = document.querySelector(`[data-id="${currentCuisineIdForIcon}"]`);
            if (row) {
                const cuisineMain = row.querySelector('.cuisine-main');
                const oldIcon = row.querySelector('.cuisine-row-icon, .cuisine-row-icon-emoji, .cuisine-row-icon-svg');
                const input = row.querySelector('.cuisine-name-input');
                
                if (oldIcon && cuisineMain) {
                    oldIcon.remove();
                    
                    // Event delegation will handle clicks
                    const img = document.createElement('img');
                    img.src = 'Images/cuisine.png';
                    img.className = 'cuisine-row-icon';
                    img.setAttribute('data-cuisine-id', currentCuisineIdForIcon);
                    img.style.cursor = 'pointer';
                    cuisineMain.insertBefore(img, input);
                }
            }
            
            closeModal();
        });
    }

    // Upload button
    if (uploadBtn) {
        uploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!fileInput) {
                console.error('File input not found');
                return;
            }
            if (!currentCuisineIdForIcon) {
                console.error('No cuisine selected for icon upload');
                return;
            }
            fileInput.click();
        });
    }

    // File input
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                console.log('No file selected');
                return;
            }
            if (!currentCuisineIdForIcon) {
                console.error('No cuisine selected for icon upload');
                e.target.value = ''; // Reset file input
                return;
            }
            
            // Check file type
            if (!file.type.startsWith('image/')) {
                alert('Please select an image file');
                e.target.value = ''; // Reset file input
                return;
            }
            
            // For now, convert to data URL (in production, upload to Firebase Storage)
            const reader = new FileReader();
            reader.onerror = (error) => {
                console.error('Error reading file:', error);
                alert('Error reading file. Please try again.');
                e.target.value = ''; // Reset file input
            };
            reader.onload = async (event) => {
                try {
                    const dataUrl = event.target.result;
                    
                    await db.collection('cuisines').doc(currentCuisineIdForIcon).update({
                        iconUrl: dataUrl
                    });
                    
                    // Update UI - replace the icon element (same as selectIcon)
                    const row = document.querySelector(`[data-id="${currentCuisineIdForIcon}"]`);
                    if (row) {
                        const cuisineMain = row.querySelector('.cuisine-main');
                        const oldIcon = row.querySelector('.cuisine-row-icon, .cuisine-row-icon-emoji, .cuisine-row-icon-svg');
                        const input = row.querySelector('.cuisine-name-input');
                        
                        if (oldIcon && cuisineMain) {
                            oldIcon.remove();
                            
                            const img = document.createElement('img');
                            img.src = dataUrl;
                            img.className = 'cuisine-row-icon';
                            img.setAttribute('data-cuisine-id', currentCuisineIdForIcon);
                            img.style.cursor = 'pointer';
                            cuisineMain.insertBefore(img, input);
                        }
                    }
                    
                    // Reset file input
                    e.target.value = '';
                    
                    closeModal();
                } catch (error) {
                    console.error('Error uploading icon:', error);
                    alert('Error uploading icon. Please try again.');
                    e.target.value = ''; // Reset file input
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Load emoji icons on init
    loadEmojiIcons();
}

function openIconPicker(cuisineId, currentIcon, iconElement) {
    const modal = document.getElementById('icon-picker-modal');
    if (!modal) return;
    
    // If modal is already open, close it first
    if (modal.classList.contains('active')) {
        closeIconPickerModal();
    }
    
    // Small delay to ensure modal closes before opening again
    setTimeout(() => {
        currentCuisineIdForIcon = cuisineId;
        
        // Position modal relative to the clicked icon - below the icon
        if (iconElement) {
            const rect = iconElement.getBoundingClientRect();
            modal.style.top = (rect.bottom + 8) + 'px';
            modal.style.left = rect.left + 'px';
            modal.style.right = 'auto';
            modal.style.bottom = 'auto';
            modal.style.transform = 'none';
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }, 50);
    
    // Switch to emoji tab by default (better icons)
    document.querySelectorAll('.icon-picker-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector('.icon-picker-tab[data-tab="emoji"]').classList.add('active');
    
    document.querySelectorAll('.icon-picker-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('icon-picker-emoji').classList.add('active');
    
    // Load emojis if not already loaded
    if (document.getElementById('icon-picker-emoji-grid').children.length === 0) {
        loadEmojiIcons();
    }
}

function loadEmojiIcons() {
    const grid = document.getElementById('icon-picker-emoji-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    emojiIcons.forEach(emojiObj => {
        const emoji = typeof emojiObj === 'string' ? emojiObj : emojiObj.emoji;
        const name = typeof emojiObj === 'string' ? '' : emojiObj.name;
        const item = document.createElement('div');
        item.classList.add('icon-picker-item', 'emoji');
        item.textContent = emoji;
        item.dataset.icon = emoji;
        item.dataset.iconName = name;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectIcon(emoji);
        });
        grid.appendChild(item);
    });
}

function loadIconOptions() {
    const grid = document.getElementById('icon-picker-icons-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    iconOptions.forEach(icon => {
        const item = document.createElement('div');
        item.classList.add('icon-picker-item');
        
        // Check if icon has an image file path instead of SVG
        if (icon.image) {
            const img = document.createElement('img');
            img.src = icon.image;
            img.style.width = '14px';
            img.style.height = '14px';
            img.style.objectFit = 'contain';
            item.appendChild(img);
        } else if (icon.svg) {
            item.innerHTML = icon.svg;
            // Set fill and stroke on all SVG elements and paths
            const svg = item.querySelector('svg');
            if (svg) {
                svg.setAttribute('fill', '#1a1a1a');
                svg.setAttribute('stroke', '#1a1a1a');
                svg.setAttribute('stroke-width', '1');
                // Set fill on all paths and shapes
                const paths = svg.querySelectorAll('path, circle, ellipse, rect');
                paths.forEach(path => {
                    path.setAttribute('fill', '#1a1a1a');
                    path.setAttribute('stroke', '#1a1a1a');
                });
            }
        }
        
        item.dataset.icon = JSON.stringify(icon);
        item.dataset.iconName = icon.name;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectIcon(icon);
        });
        grid.appendChild(item);
    });
}

function filterIcons(gridId, filter) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    
    const items = grid.querySelectorAll('.icon-picker-item');
    const filterLower = filter ? filter.toLowerCase().trim() : '';
    
    items.forEach(item => {
        const iconName = item.dataset.iconName || '';
        const isEmoji = item.classList.contains('emoji');
        
        if (!filterLower) {
            // Show all if no filter
            item.style.display = 'flex';
        } else if (isEmoji) {
            // For emojis, filter by name
            if (iconName && iconName.toLowerCase().includes(filterLower)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        } else {
            // For PNG/SVG icons, filter by name
            if (iconName && iconName.toLowerCase().includes(filterLower)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        }
    });
}

async function selectIcon(icon) {
    if (!currentCuisineIdForIcon) return;
    
    // Determine if icon is emoji string or icon object
    const isEmoji = typeof icon === 'string' && (icon.length <= 2 || (!icon.startsWith('data:') && !icon.startsWith('Images/') && !icon.startsWith('http') && !icon.startsWith('{')));
    
    // Handle different icon types
    let iconUrl;
    if (isEmoji) {
        iconUrl = icon;
    } else if (icon && icon.image) {
        // Image file from Flaticon
        iconUrl = icon.image;
    } else if (icon && icon.svg) {
        // SVG icon object
        iconUrl = JSON.stringify(icon);
    } else {
        // Direct URL string
        iconUrl = typeof icon === 'string' ? icon : JSON.stringify(icon);
    }
    
    // Save icon data
    await db.collection('cuisines').doc(currentCuisineIdForIcon).update({
        iconUrl: iconUrl
    });
    
    // Update UI - replace the icon element
    const row = document.querySelector(`[data-id="${currentCuisineIdForIcon}"]`);
    if (row) {
        const cuisineMain = row.querySelector('.cuisine-main');
        const oldIcon = row.querySelector('.cuisine-row-icon, .cuisine-row-icon-emoji, .cuisine-row-icon-svg');
        const input = row.querySelector('.cuisine-name-input');
        
        if (oldIcon && cuisineMain) {
            oldIcon.remove();
            
            if (isEmoji) {
                // Emoji - event delegation will handle clicks
                const emojiSpan = document.createElement('span');
                emojiSpan.className = 'cuisine-row-icon-emoji';
                emojiSpan.setAttribute('data-cuisine-id', currentCuisineIdForIcon);
                emojiSpan.style.cursor = 'pointer';
                // Font size is handled by CSS
                emojiSpan.textContent = icon;
                cuisineMain.insertBefore(emojiSpan, input);
            } else if (icon.image) {
                // Image file icon (from Flaticon) - event delegation will handle clicks
                const img = document.createElement('img');
                img.src = icon.image;
                img.className = 'cuisine-row-icon';
                img.setAttribute('data-cuisine-id', currentCuisineIdForIcon);
                img.style.cursor = 'pointer';
                cuisineMain.insertBefore(img, input);
            } else if (icon.svg) {
                // SVG icon - event delegation will handle clicks
                const svgContainer = document.createElement('div');
                svgContainer.className = 'cuisine-row-icon-svg';
                svgContainer.setAttribute('data-cuisine-id', currentCuisineIdForIcon);
                svgContainer.style.cursor = 'pointer';
                svgContainer.style.display = 'inline-flex';
                svgContainer.style.alignItems = 'center';
                svgContainer.style.justifyContent = 'center';
                svgContainer.innerHTML = icon.svg;
                const svg = svgContainer.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', '22');
                    svg.setAttribute('height', '22');
                    svg.style.stroke = '#333';
                    svg.style.fill = 'none';
                }
                cuisineMain.insertBefore(svgContainer, input);
            } else {
                // Image URL - event delegation will handle clicks
                const img = document.createElement('img');
                img.src = icon;
                img.className = 'cuisine-row-icon';
                img.setAttribute('data-cuisine-id', currentCuisineIdForIcon);
                img.style.cursor = 'pointer';
                cuisineMain.insertBefore(img, input);
            }
        }
    }
    
    // Close modal using global function
    closeIconPickerModal();
}
// ================================
// CREATE DEFAULT CUISINES FOR NEW USERS
// ================================
async function createDefaultCuisines(userId) {
    const defaultCuisines = [
        { name: "To Make", iconUrl: "Images/Icons/apron.png", order: 1 },
        { name: "Breakfast", iconUrl: "Images/Icons/pan.png", order: 2 },
        { name: "Dessert", iconUrl: "Images/Icons/cupcake.png", order: 3 },
        { name: "Drinks", iconUrl: "Images/Icons/coffee-cup.png", order: 4 },
        { name: "Mains", iconUrl: "Images/Icons/drumstick.png", order: 5 },
        { name: "Sauces", iconUrl: "Images/Icons/sauce.png", order: 6 },
        { name: "Sides", iconUrl: "Images/Icons/broccoli.png", order: 7 },
        { name: "Snacks", iconUrl: "Images/Icons/pretzel.png", order: 8 },
        { name: "American", iconUrl: "Images/Icons/hamburger.png", order: 9 },
        { name: "Chinese", iconUrl: "Images/Icons/noodles.png", order: 10 },
        { name: "Italian", iconUrl: "Images/Icons/bowl.png", order: 11 },
        { name: "Christmas Recipes", iconUrl: "Images/Icons/christmas.png", order: 12 },
        { name: "Fall Recipes", iconUrl: "Images/Icons/halloween.png", order: 13 }
    ];
    
    const batch = db.batch();
    
    for (const cuisine of defaultCuisines) {
        const docRef = db.collection('cuisines').doc();
        batch.set(docRef, {
            name: cuisine.name,
            iconUrl: cuisine.iconUrl,
            order: cuisine.order,
            userId: userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    try {
        await batch.commit();
        console.log('✓ Created default cuisines for new user');
    } catch (error) {
        console.error('Error creating default cuisines:', error);
    }
}

// ================================
// CREATE DEFAULT CUISINES FOR NEW TEAMSPACES
// ================================
async function createDefaultCuisinesForTeamspace(teamspaceId, createdBy) {
    const defaultCuisines = [
        { name: "To Make", iconUrl: "Images/Icons/apron.png", order: 1 },
        { name: "Breakfast", iconUrl: "Images/Icons/pan.png", order: 2 },
        { name: "Dessert", iconUrl: "Images/Icons/cupcake.png", order: 3 },
        { name: "Drinks", iconUrl: "Images/Icons/coffee-cup.png", order: 4 },
        { name: "Mains", iconUrl: "Images/Icons/drumstick.png", order: 5 },
        { name: "Sauces", iconUrl: "Images/Icons/sauce.png", order: 6 },
        { name: "Sides", iconUrl: "Images/Icons/broccoli.png", order: 7 },
        { name: "Snacks", iconUrl: "Images/Icons/pretzel.png", order: 8 },
        { name: "American", iconUrl: "Images/Icons/hamburger.png", order: 9 },
        { name: "Chinese", iconUrl: "Images/Icons/noodles.png", order: 10 },
        { name: "Italian", iconUrl: "Images/Icons/bowl.png", order: 11 },
        { name: "Christmas Recipes", iconUrl: "Images/Icons/christmas.png", order: 12 },
        { name: "Fall Recipes", iconUrl: "Images/Icons/halloween.png", order: 13 }
    ];

    const batch = db.batch();

    for (const cuisine of defaultCuisines) {
        const docRef = db.collection('cuisines').doc();
        batch.set(docRef, {
            name: cuisine.name,
            iconUrl: cuisine.iconUrl,
            order: cuisine.order,
            userId: null,
            teamspaceId,
            createdBy,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    await batch.commit();
    console.log('✓ Created default cuisines for new teamspace');
}


// Helper function to add defaults to existing user (call from console)
window.addDefaultCuisinesToMe = async function() {
    const user = auth.currentUser;
    if (!user) {
        console.error('No user logged in!');
        return;
    }
    
    console.log('Adding default cuisines...');
    
    // Check what cuisines already exist
    const existingSnapshot = await db.collection('cuisines')
        .where('userId', '==', user.uid)
        .get();
    
    const existingNames = new Set();
    let maxOrder = 0;
    existingSnapshot.forEach(doc => {
        existingNames.add(doc.data().name);
        const order = doc.data().order || 0;
        if (order > maxOrder) maxOrder = order;
    });
    
    console.log('Existing cuisines:', Array.from(existingNames));
    
    const defaultCuisines = [
        { name: "To Make", iconUrl: "Images/Icons/apron.png" },
        { name: "Breakfast", iconUrl: "Images/Icons/pan.png" },
        { name: "Dessert", iconUrl: "Images/Icons/cupcake.png" },
        { name: "Drinks", iconUrl: "Images/Icons/coffee-cup.png" },
        { name: "Mains", iconUrl: "Images/Icons/drumstick.png" },
        { name: "Sauces", iconUrl: "Images/Icons/sauce.png" },
        { name: "Sides", iconUrl: "Images/Icons/broccoli.png" },
        { name: "Snacks", iconUrl: "Images/Icons/pretzel.png" },
        { name: "American", iconUrl: "Images/Icons/hamburger.png" },
        { name: "Chinese", iconUrl: "Images/Icons/noodles.png" },
        { name: "Italian", iconUrl: "Images/Icons/bowl.png" },
        { name: "Christmas Recipes", iconUrl: "Images/Icons/christmas.png" },
        { name: "Fall Recipes", iconUrl: "Images/Icons/halloween.png" }
    ];
    
    const batch = db.batch();
    let addedCount = 0;
    let currentOrder = maxOrder;
    
    for (const cuisine of defaultCuisines) {
        if (existingNames.has(cuisine.name)) {
            console.log(`âŠ˜ Skipping "${cuisine.name}" - already exists`);
            continue;
        }
        
        currentOrder++;
        const docRef = db.collection('cuisines').doc();
        batch.set(docRef, {
            name: cuisine.name,
            iconUrl: cuisine.iconUrl,
            order: currentOrder,
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        addedCount++;
        console.log(`✓ Adding "${cuisine.name}"`);
    }
    
    if (addedCount === 0) {
        console.log('✅ All defaults already exist!');
        return;
    }
    
    try {
        await batch.commit();
        console.log(`✅ Added ${addedCount} cuisines! Reloading...`);
        location.reload();
    } catch (error) {
        console.error('❌ Error:', error);
    }
};

// Helper function to fix the order of existing default cuisines
window.fixDefaultCuisineOrder = async function() {
    const user = auth.currentUser;
    if (!user) {
        console.error('No user logged in!');
        return;
    }
    
    console.log('Fixing cuisine order...');
    
    const correctOrder = {
        "To Make": 1,
        "Breakfast": 2,
        "Dessert": 3,
        "Drinks": 4,
        "Mains": 5,
        "Sauces": 6,
        "Sides": 7,
        "Snacks": 8,
        "American": 9,
        "Chinese": 10,
        "Italian": 11,
        "Christmas Recipes": 12,
        "Fall Recipes": 13
    };
    
    const snapshot = await db.collection('cuisines')
        .where('userId', '==', user.uid)
        .get();
    
    const batch = db.batch();
    let updatedCount = 0;
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const cuisineName = data.name;
        
        if (correctOrder[cuisineName] !== undefined) {
            const newOrder = correctOrder[cuisineName];
            if (data.order !== newOrder) {
                batch.update(doc.ref, { order: newOrder });
                console.log(`Updating "${cuisineName}": ${data.order || 'none'} → ${newOrder}`);
                updatedCount++;
            }
        }
    });
    
    if (updatedCount === 0) {
        console.log('✅ All cuisines already have correct order!');
        return;
    }
    
    try {
        await batch.commit();
        console.log(`✅ Fixed order for ${updatedCount} cuisines! Reloading...`);
        location.reload();
    } catch (error) {
        console.error('❌ Error:', error);
    }
};
// ================================
// CUISINE DETAIL PANEL
// ================================
console.log('🔵 Cuisine detail panel code loading...');

// Store current cuisine ID for use in other functions
let currentCuisineId = null;

function openCuisineDetailPanel(cuisineId, cuisineName, cuisineIcon, cuisineCount) {
    console.log('🔵 openCuisineDetailPanel called', { cuisineId, cuisineName, cuisineIcon, cuisineCount });
    
    const panel = document.getElementById('cuisine-detail-panel');
    const overlay = document.querySelector('.side-panel-overlay');
    
    if (!panel) {
        console.error('❌ Cuisine detail panel not found in DOM');
        return;
    }
    
    if (!overlay) {
        console.error('❌ Side panel overlay not found in DOM');
        return;
    }
    
    console.log('✅ Panel and overlay found, proceeding...');
    
    // Store current cuisine ID
    currentCuisineId = cuisineId;
    
    // Set cuisine information
    const titleEl = document.getElementById('cuisine-detail-title');
    const iconEl = document.getElementById('cuisine-detail-icon');
    const countEl = document.getElementById('cuisine-detail-count');
    
    if (titleEl) titleEl.textContent = cuisineName;
    
    // Set icon
    if (iconEl) {
        iconEl.innerHTML = '';
        iconEl.style.fontSize = '';
        
        if (!cuisineIcon || cuisineIcon === 'Images/cuisine.png') {
            iconEl.innerHTML = '<img src="Images/cuisine.png" alt="" style="width: 22px; height: 22px; object-fit: contain;">';
        } else {
            // Check if it's JSON (SVG icon)
            try {
                const iconObj = JSON.parse(cuisineIcon);
                if (iconObj.svg) {
                    const svgContainer = document.createElement('div');
                    svgContainer.innerHTML = sanitizeSvg(iconObj.svg);
                    const svg = svgContainer.querySelector('svg');
                    if (svg) {
                        svg.setAttribute('width', '22');
                        svg.setAttribute('height', '22');
                        svg.style.stroke = '#333';
                        svg.style.fill = 'none';
                    }
                    iconEl.appendChild(svgContainer.firstChild);
                }
            } catch (e) {
                // Not JSON, check if emoji or image
                if (!cuisineIcon.startsWith('data:') && !cuisineIcon.startsWith('Images/') && !cuisineIcon.startsWith('http')) {
                    // It's an emoji
                    iconEl.style.fontSize = '20px';
                    iconEl.textContent = cuisineIcon;
                } else {
                    // It's an image URL
                    iconEl.innerHTML = `<img src="${safeImageSrc(cuisineIcon, 'Images/cuisine.png')}" alt="" style="width: 22px; height: 22px; object-fit: contain;">`;
                }
            }
        }
    }
    
    // Load recipes for this cuisine (count will be updated in loadCuisineRecipes)
    loadCuisineRecipes(cuisineId, cuisineName);
    
    // Open panel
    panel.classList.add('open');
    overlay.classList.add('active');
}

async function loadCuisineRecipes(cuisineId, cuisineName) {
    const grid = document.getElementById('cuisine-recipe-grid');
    const countEl = document.getElementById('cuisine-detail-count');
    if (!grid) {
        console.error('Cuisine recipe grid not found');
        return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        console.error('No user logged in');
        return;
    }
    
    // Show loading state
    grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Loading recipes...</div>';
    
    try {
        // Get all recipes for this user
        const workspaceFilter =
            typeof getWorkspaceFilter === 'function'
                ? getWorkspaceFilter()
                : { type: 'personal', userId: user.uid };

        let recipesQuery = db.collection('recipes');

        if (workspaceFilter.type === 'personal') {
            // Personal workspace: query user's recipes, will filter out teamspace ones below
            recipesQuery = recipesQuery.where('userId', '==', user.uid);
        } else {
            recipesQuery = recipesQuery.where('teamspaceId', '==', workspaceFilter.teamspaceId);
        }

        const snapshot = await recipesQuery.get();

        
        if (snapshot.empty) {
            grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No recipes with this cuisine yet.</div>';
            if (countEl) {
                const countValue = countEl.querySelector('.count-value');
                if (countValue) countValue.textContent = '0';
            }
            return;
        }
        
        // Filter recipes that have this cuisine
        const matchingRecipes = [];
        snapshot.forEach(doc => {
            const recipe = doc.data();
            const recipeId = doc.id;
            
            // Skip teamspace recipes when in personal workspace
            if (workspaceFilter.type === 'personal' && recipe.teamspaceId) {
                return;
            }
            
            // Handle both old format (cuisine as string) and new format (cuisines as array)
            const cuisines = recipe.cuisines || (recipe.cuisine ? [recipe.cuisine] : []);
            
            // Check if this recipe has the selected cuisine
            let hasCuisine = false;
            
            if (cuisineId === 'FAVORITES') {
                // Special case for Favorites
                hasCuisine = cuisines.some(c => 
                    (typeof c === 'string' && c === 'Favorites') ||
                    (typeof c === 'object' && c.name === 'Favorites')
                );
            } else {
                // Check by ID or name
                hasCuisine = cuisines.some(c => {
                    if (typeof c === 'string') {
                        return c === cuisineId || c === cuisineName;
                    } else if (typeof c === 'object' && c.id) {
                        return c.id === cuisineId;
                    } else if (typeof c === 'object' && c.name) {
                        return c.name === cuisineName;
                    }
                    return false;
                });
            }
            
            if (hasCuisine) {
                matchingRecipes.push({ id: recipeId, ...recipe });
            }
        });
        
        // Update count
        if (countEl) {
            const countValue = countEl.querySelector('.count-value');
            if (countValue) countValue.textContent = matchingRecipes.length;
        }
        
        if (matchingRecipes.length === 0) {
            grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No recipes with this cuisine yet.</div>';
            return;
        }
        
        // Clear grid
        grid.innerHTML = '';
        
        // Add recipe cards using the same structure as main grid
        matchingRecipes.forEach(recipe => {
            const card = createCuisineRecipeCard(recipe.id, recipe);
            grid.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading cuisine recipes:', error);
        grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Error loading recipes.</div>';
    }
}

function createCuisineRecipeCard(recipeId, recipe) {
    // Use the same recipe card structure as the main grid
    const card = document.createElement("div");
    card.classList.add("recipe-card");

    // Use simple text representation for stars
    const rating = recipe.rating || 0;
    const filledStars = "★".repeat(rating);
    const emptyStars = "☆".repeat(5 - rating);
    
    // Check if recipe is in favorites
    const cuisines = recipe.cuisines || (recipe.cuisine ? [recipe.cuisine] : []);
    const isInFavorites = cuisines.some(c => 
        (typeof c === 'string' && c === "Favorites") || 
        (typeof c === 'object' && c.name === "Favorites")
    );
    const favoritesText = isInFavorites ? "Remove from Favorites" : "Add to Favorites";
    const favoritesIcon = isInFavorites ? "Images/star-black.png" : "Images/star2.png";

    card.innerHTML = `
        <div class="card-hover-controls">
            <button class="card-reposition-btn">Reposition</button>
            <button class="card-menu-btn">⋯</button>

            <div class="card-menu-dropdown hidden">
                <div class="card-menu-item" data-favorites-action="${isInFavorites ? 'remove' : 'add'}">
                    <img src="${favoritesIcon}" class="card-menu-icon">
                    ${favoritesText}
                </div>

                <div class="card-menu-item">
                    <img src="Images/duplicate.png" class="card-menu-icon">
                    Duplicate
                </div>

                <div class="card-menu-item delete">
                    <img src="Images/trash.png" class="card-menu-icon">
                    Delete
                </div>

                <div class="card-menu-divider"></div>

                <div class="card-menu-meta">
                    Last edited by You<br>
                    ${recipe.updatedAt ?
                        recipe.updatedAt.toDate().toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit', hour12: true
                        }) :
                        'Unknown'}
                </div>
            </div>
        </div>

        <div class="card-reposition-bar hidden">
            <button class="card-save-position">Save position</button>
            <button class="card-cancel-position">Cancel</button>
        </div>

        <div class="card-img-wrapper">
            ${
                safeImageSrc(recipe.imageUrl)
                    ? `<img src="${safeImageSrc(recipe.imageUrl)}" class="card-img" data-offset="${Number(recipe.imageOffsetY) || 0}" style="top: ${Number(recipe.imageOffsetY) || 0}px;">`
                    : `<div class="card-img placeholder"></div>`
            }
        </div>

        <div class="card-body">
            <div class="card-title-row">
                <img src="Images/fork-knife-logo.png" class="card-title-icon">
                <span class="card-title">${escapeHtml(recipe.title || "Untitled")}</span>
            </div>

            <div class="card-rating">${filledStars}${emptyStars}</div>
            <div class="card-time">${recipe.minutes || 0} mins</div>
        </div>
    `;

    // Add menu logic (same as main grid)
    const menuBtn = card.querySelector(".card-menu-btn");
    const menuDropdown = card.querySelector(".card-menu-dropdown");
    const repositionBtn = card.querySelector(".card-reposition-btn");
    const repositionBar = card.querySelector(".card-reposition-bar");
    const savePositionBtn = card.querySelector(".card-save-position");
    const cancelPositionBtn = card.querySelector(".card-cancel-position");
    const cardImg = card.querySelector(".card-img");

    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            menuDropdown.classList.toggle("hidden");
        });
    }

    // Handle menu items
    const menuItems = card.querySelectorAll(".card-menu-item");
    menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            menuDropdown.classList.add("hidden");
            
            if (item.classList.contains("delete")) {
                if (confirm("Delete this recipe?")) {
                    db.collection("recipes").doc(recipeId).delete().then(() => {
                        card.remove();
                        // Reload cuisine recipes to update count
                        const titleEl = document.getElementById('cuisine-detail-title');
                        const cuisineName = titleEl ? titleEl.textContent : '';
                        loadCuisineRecipes(currentCuisineId, cuisineName);
                    });
                }
            } else if (item.dataset.favoritesAction) {
                // Handle favorites toggle
                const action = item.dataset.favoritesAction;
                const currentCuisines = recipe.cuisines || (recipe.cuisine ? [recipe.cuisine] : []);
                let newCuisines = [...currentCuisines];
                
                if (action === 'add') {
                    newCuisines.push('Favorites');
                } else {
                    newCuisines = newCuisines.filter(c => 
                        (typeof c === 'string' && c !== 'Favorites') ||
                        (typeof c === 'object' && c.name !== 'Favorites')
                    );
                }
                
                db.collection("recipes").doc(recipeId).update({
                    cuisines: newCuisines
                }).then(() => {
                    // Reload cuisine recipes
                    const titleEl = document.getElementById('cuisine-detail-title');
                    const cuisineName = titleEl ? titleEl.textContent : '';
                    loadCuisineRecipes(currentCuisineId, cuisineName);
                });
            }
        });
    });

    // Handle reposition
    if (repositionBtn && repositionBar && cardImg) {
        repositionBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            repositionBar.classList.remove("hidden");
            // Add reposition logic here if needed
        });
    }

    if (savePositionBtn) {
        savePositionBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            repositionBar.classList.add("hidden");
            // Save position logic here if needed
        });
    }

    if (cancelPositionBtn) {
        cancelPositionBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            repositionBar.classList.add("hidden");
        });
    }

    // Add click handler to open recipe
    card.addEventListener('click', (e) => {
        // Don't open if clicking on controls
        if (e.target.closest('.card-hover-controls, .card-reposition-bar')) {
            return;
        }
        if (typeof openExistingRecipe === 'function') {
            openExistingRecipe(recipeId);
        }
    });
    
    return card;
}

// Close cuisine detail panel
function closeCuisineDetailPanel() {
    console.log('ðŸ”´ Closing cuisine detail panel');
    const panel = document.getElementById('cuisine-detail-panel');
    const overlay = document.querySelector('.side-panel-overlay');
    
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    
    // Clear current cuisine ID
    currentCuisineId = null;
}

// Handle overlay clicks for cuisine detail panel
console.log('🔵 Setting up overlay click handler...');
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('side-panel-overlay')) {
        const cuisinePanel = document.getElementById('cuisine-detail-panel');
        if (cuisinePanel && cuisinePanel.classList.contains('open')) {
            closeCuisineDetailPanel();
        }
    }
});

// Handle close button for cuisine detail panel (using same pattern as recipe panel)
document.addEventListener('click', (e) => {
    const cuisinePanel = document.getElementById('cuisine-detail-panel');
    if (!cuisinePanel || !cuisinePanel.classList.contains('open')) return;
    
    if (e.target.classList.contains('close-panel-btn') && 
        e.target.closest('#cuisine-detail-panel')) {
        closeCuisineDetailPanel();
    }
});

// Handle share button for cuisine panel
document.addEventListener('click', (e) => {
    if (e.target.id === 'share-cuisine-btn' || e.target.closest('#share-cuisine-btn')) {
        // For now, just show a message - can implement sharing cuisine later
        alert('Share cuisine feature coming soon!');
    }
});