// ================================
// LOAD RECIPES (GRID) - FIXED WITH userId FILTER
// ================================
let isLoadingGrid = false;

// Wrapper function with fade transition
function loadRecipesWithFade() {
    const recipeGrid = document.getElementById("recipe-grid");
    if (!recipeGrid) return;
    
    // Store current height to maintain layout
    const currentHeight = recipeGrid.offsetHeight;
    if (currentHeight > 0) {
        recipeGrid.style.minHeight = currentHeight + 'px';
    }
    
    // Fade out
    recipeGrid.style.opacity = '0';
    recipeGrid.style.transition = 'opacity 0.2s ease';
    
    // Wait for fade out, then load recipes
    setTimeout(() => {
        // Load recipes (this will clear and rebuild the grid)
        loadRecipes();
        
        // Wait for recipes to load, then fade back in
        const checkLoaded = setInterval(() => {
            if (!isLoadingGrid) {
                clearInterval(checkLoaded);
                
                // Remove min-height after content is loaded
                recipeGrid.style.minHeight = '';
                
                // Force reflow
                void recipeGrid.offsetHeight;
                
                // Fade back in
                requestAnimationFrame(() => {
                    recipeGrid.style.opacity = '';
                });
            }
        }, 50);
    }, 200);
}

function loadRecipes() {
    if (isLoadingGrid) return;
    isLoadingGrid = true;

    const user = auth.currentUser;
    if (!user) {
        console.error("No user logged in");
        isLoadingGrid = false;
        return;
    }

    const recipeGrid = document.getElementById("recipe-grid");
    const noRecipes = document.getElementById("no-recipes");
    
    // Show loading state immediately
    if (recipeGrid) {
        recipeGrid.classList.add("loading");
        recipeGrid.style.opacity = "0";
    }

    // Get workspace filter
    const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
    console.log('ðŸ“¦ Loading recipes for workspace:', workspaceFilter);

    // Build query based on workspace type
    let query;
    if (workspaceFilter.type === 'personal') {
        // Personal workspace: user's own recipes
        query = db.collection("recipes").where("userId", "==", user.uid);
    } else {
        // Teamspace: recipes belonging to this teamspace
        query = db.collection("recipes").where("teamspaceId", "==", workspaceFilter.teamspaceId);
    }

    // Fetch recipes
    query.get()
        .then(snapshot => {
            recipeGrid.innerHTML = "";
            
            // Filter out teamspace recipes for personal workspace (legacy support)
            let docs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // For personal workspace, exclude recipes that belong to a teamspace
                if (workspaceFilter.type === 'personal') {
                    if (!data.teamspaceId) {
                        docs.push({ id: doc.id, ...data });
                    }
                } else {
                    docs.push({ id: doc.id, ...data });
                }
            });

            if (docs.length === 0 && workspaceFilter.type === 'personal') {
                // New user with no recipes - create defaults
                createDefaultRecipes(user.uid).then(() => {
                    // Reload recipes after creating defaults
                    isLoadingGrid = false;
                    loadRecipes();
                });
                return;
            } else if (docs.length === 0 && workspaceFilter.type === 'teamspace') {
                // New teamspace with no recipes - create defaults
                createDefaultRecipesForTeamspace(workspaceFilter.teamspaceId, user.uid).then(() => {
                    // Reload recipes after creating defaults
                    isLoadingGrid = false;
                    loadRecipes();
                });
                return;
            } else if (docs.length === 0) {
                noRecipes.classList.remove("hidden");
                recipeGrid.classList.add("hidden");
                isLoadingGrid = false;
                recipeGrid.classList.remove("loading");
                recipeGrid.style.opacity = "";
                return;
            } else {
                noRecipes.classList.add("hidden");
                recipeGrid.classList.remove("hidden");
            }

            // Convert to array for sorting
            const recipes = docs;

            // Apply filters first
            let filteredRecipes = recipes;
            
            // Rating filter
            if (currentRatingFilter !== null) {
                filteredRecipes = filteredRecipes.filter(r => (r.rating || 0) === currentRatingFilter);
            }
            
            // Cook time filter
            if (currentCooktimeFilter) {
                filteredRecipes = filteredRecipes.filter(r => {
                    const minutes = r.minutes || 0;
                    
                    if (currentCooktimeFilter === '0-15') {
                        return minutes <= 15;
                    } else if (currentCooktimeFilter === '15-30') {
                        return minutes > 15 && minutes <= 30;
                    } else if (currentCooktimeFilter === '30-60') {
                        return minutes > 30 && minutes <= 60;
                    } else if (currentCooktimeFilter === '60-180') {
                        return minutes > 60 && minutes <= 180;
                    } else if (currentCooktimeFilter === '180+') {
                        return minutes > 180;
                    }
                    return true;
                });
            }

            // Sort recipes
            filteredRecipes.sort((a, b) => {
                let compareResult = 0;

                if (currentSort === "name") {
                    compareResult = (a.title || "Untitled").localeCompare(b.title || "Untitled");
                } else if (currentSort === "rating") {
                    compareResult = (b.rating || 0) - (a.rating || 0);
                } else if (currentSort === "cooktime") {
                    compareResult = (a.minutes || 0) - (b.minutes || 0);
                } else if (currentSort === "date" || currentSort === "createdAt") {
                    const dateA = a.createdAt?.toMillis() || 0;
                    const dateB = b.createdAt?.toMillis() || 0;
                    compareResult = dateB - dateA;
                }

                // Apply sort order
                if (currentSort === "rating" || currentSort === "date" || currentSort === "createdAt") {
                    if (currentRecipeSortOrder === "asc") compareResult = -compareResult;
                } else {
                    if (currentRecipeSortOrder === "desc") compareResult = -compareResult;
                }

                return compareResult;
            });

            // Check if any recipes match the filter criteria
            if (filteredRecipes.length === 0) {
                noRecipes.classList.remove("hidden");
                recipeGrid.classList.add("hidden");
                isLoadingGrid = false;
                return;
            } else {
                noRecipes.classList.add("hidden");
                recipeGrid.classList.remove("hidden");
            }

            // Render sorted recipes
            filteredRecipes.forEach(r => {
                const id = r.id;

            const card = document.createElement("div");
            card.classList.add("recipe-card");

            // Use simple text representation instead of Unicode stars
            const rating = r.rating || 0;
            const filledStars = "★".repeat(rating);
            const emptyStars = "☆".repeat(5 - rating);
            
            // Debug: log what we're creating
            console.log('Rating:', rating, 'Stars:', filledStars + emptyStars);

            // Check if recipe is in favorites
            const cuisines = r.cuisines || (r.cuisine ? [r.cuisine] : []);
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

                        <div class="card-menu-item copy-to">
                            <img src="Images/duplicate.png" class="card-menu-icon">
                            Copy to…
                        </div>

                        <div class="card-menu-item delete">
                            <img src="Images/trash.png" class="card-menu-icon">
                            Delete
                        </div>

                        <div class="card-menu-divider"></div>

                        <div class="card-menu-meta">
                            Last edited by You<br>
                            ${r.updatedAt ?
                                r.updatedAt.toDate().toLocaleDateString('en-US', {
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
                        safeImageSrc(r.imageUrl)
                            ? `<img src="${safeImageSrc(r.imageUrl)}" class="card-img" data-offset="${Number(r.imageOffsetY) || 0}" style="top: ${Number(r.imageOffsetY) || 0}px;">`
                            : `<div class="card-img placeholder"></div>`
                    }
                </div>

                <div class="card-body">
                    <div class="card-title-row">
                        <img src="Images/fork-knife-logo.png" class="card-title-icon">
                        <span class="card-title">${escapeHtml(r.title || "Untitled")}</span>
                    </div>

                    <div class="card-rating">${filledStars}${emptyStars}</div>
                    <div class="card-time">${Number(r.minutes) || 0} mins</div>
                </div>
            `;

            // menu logic
            const menuBtn = card.querySelector(".card-menu-btn");
            const dropdown = card.querySelector(".card-menu-dropdown");

            menuBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                dropdown.classList.toggle("hidden");
            });

            // Find the "Add to Favorites" / "Remove from Favorites" button (first menu item)
            const menuItems = card.querySelectorAll(".card-menu-item");
            if (menuItems.length > 0) {
                const favoritesMenuItem = menuItems[0]; // First item is favorites action
                favoritesMenuItem.addEventListener("click", async function (e) {
                    e.stopPropagation();
                    dropdown.classList.add("hidden");
                    const action = favoritesMenuItem.dataset.favoritesAction;
                    if (action === 'remove') {
                        await removeFromFavorites(id);
                    } else {
                        await addToFavorites(id);
                    }
                });
            }

            // Find the duplicate button (second menu item)
            if (menuItems.length >= 2) {
                const duplicateMenuItem = menuItems[1]; // Second item is Duplicate
                duplicateMenuItem.addEventListener("click", async function (e) {
                    e.stopPropagation();
                    dropdown.classList.add("hidden");
                    await duplicateRecipe(id);
                });
            }

            // Copy to another workspace (personal <-> teamspace)
            const copyToBtn = card.querySelector(".card-menu-item.copy-to");
            copyToBtn.addEventListener("click", async function (e) {
                e.stopPropagation();
                dropdown.classList.add("hidden");
                await copyRecipeToWorkspace(id);
            });

            const deleteBtn = card.querySelector(".card-menu-item.delete");
            deleteBtn.addEventListener("click", async function (e) {
                e.stopPropagation();
                dropdown.classList.add("hidden");

                const confirmed = await macConfirm("Delete this recipe? This cannot be undone.");
                if (!confirmed) return;

                // Check if recipe is in Favorites before deleting
                const recipeDoc = await db.collection("recipes").doc(id).get();
                const recipeData = recipeDoc.data();
                const cuisines = recipeData.cuisines || (recipeData.cuisine ? [recipeData.cuisine] : []);
                const wasInFavorites = cuisines.includes("Favorites");

                await db.collection("recipes").doc(id).delete();
                
                // Update all cuisine counts
                await updateAllCuisineCounts();
                
                loadRecipes();
            });

            card.addEventListener("click", function (e) {
                // Don't open recipe panel if in reposition mode
                if (card.classList.contains("is-repositioning")) {
                    e.stopPropagation();
                    return;
                }
                openExistingRecipe(id);
            });

            recipeGrid.appendChild(card);

            setupCardRepositioning(card, id, r);
        });

        // Remove loading state and fade in
        recipeGrid.classList.remove("loading");
        
        // Force reflow to ensure cards are rendered
        void recipeGrid.offsetHeight;
        
        // Fade in the grid (CSS will handle the transition)
        requestAnimationFrame(() => {
            recipeGrid.style.opacity = "";
        });

        isLoadingGrid = false;

    }).catch(err => {
        console.error("Error loading recipes:", err);
        recipeGrid.classList.remove("loading");
        recipeGrid.style.opacity = "1";
        isLoadingGrid = false;
    });
}



// ================================
// CARD REPOSITIONING
// ================================
function setupCardRepositioning(card, id, r) {
    const img = card.querySelector(".card-img");
    if (!img || img.classList.contains('placeholder')) return;

    const repositionBtn = card.querySelector(".card-reposition-btn");
    const saveBar = card.querySelector(".card-reposition-bar");
    const saveBtn = card.querySelector(".card-save-position");
    const cancelBtn = card.querySelector(".card-cancel-position");

    img.style.position = "absolute";
    img.style.left = "50%";
    img.style.transform = "translateX(-50%)";

    let dragging = false;
    let startY = 0;
    let originalTop = parseFloat(img.dataset.offset || 0);

    img.style.top = originalTop + "px";

    function clamp(y) {
        const imgH = img.offsetHeight;
        const wrapH = img.parentElement.offsetHeight;
        const min = wrapH - imgH;

        if (y > 0) return 0;
        if (y < min) return min;
        return y;
    }

    repositionBtn.addEventListener("click", e => {
        e.stopPropagation();
        card.classList.add("is-repositioning");
        saveBar.classList.remove("hidden");

        repositionBtn.style.display = "none";
        card.querySelector(".card-menu-btn").style.display = "none";

        card.onclick = ev => ev.stopPropagation();
    });

    img.addEventListener("mousedown", e => {
        if (!card.classList.contains("is-repositioning")) return;

        e.preventDefault();
        e.stopPropagation(); // Prevent card click from firing
        dragging = true;
        startY = e.clientY;
        originalTop = parseFloat(img.style.top || 0);
        img.style.cursor = "grabbing";

        function move(ev) {
            if (!dragging) return;
            ev.preventDefault(); // Prevent any default behavior during drag
            const dy = ev.clientY - startY;
            let newTop = clamp(originalTop + dy);
            img.style.top = newTop + "px";
        }

        function stop() {
            dragging = false;
            img.style.cursor = "grab";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        }

        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    });

    cancelBtn.addEventListener("click", e => {
        e.stopPropagation();
        card.classList.remove("is-repositioning");
        saveBar.classList.add("hidden");

        img.style.top = (r.imageOffsetY || 0) + "px";

        repositionBtn.style.display = "inline-block";
        card.querySelector(".card-menu-btn").style.display = "inline-block";

        card.onclick = () => openExistingRecipe(id);
    });

    saveBtn.addEventListener("click", e => {
        e.stopPropagation();
        card.classList.remove("is-repositioning");
        saveBar.classList.add("hidden");

        const newOffset = parseFloat(img.style.top);
        img.dataset.offset = newOffset;

        db.collection("recipes").doc(id).update({ imageOffsetY: newOffset });

        repositionBtn.style.display = "inline-block";
        card.querySelector(".card-menu-btn").style.display = "inline-block";

        card.onclick = () => openExistingRecipe(id);
    });
}


// ================================
// CLOSE PANEL
// ================================
document.addEventListener("click", async (e) => {
    if (
        e.target.classList.contains("close-panel-btn") ||
        e.target.classList.contains("side-panel-close") ||
        e.target.id === "close-side-panel"
    ) {
        // Check if this is the ingredient panel close button
        if (e.target.id === "close-ingredient-panel") {
            const panel = document.getElementById('ingredient-side-panel');
            const wasEditing = !!panel.dataset.editingId;

            const savedId = await saveIngredient();
            closeIngredientPanel();

            if (!savedId) return;

            const doc = await db.collection('ingredients').doc(savedId).get();
            if (!doc.exists) return;

            const ingredient = { id: doc.id, ...doc.data() };

            if (wasEditing) {
                updateIngredientRow(ingredient);
            } else {
                addIngredientToTable(ingredient);
            }

            return;
        }
        
        // Otherwise close recipe panel
        await finalizeRecipeSave();

        currentDraftId = null;

        const panel = document.getElementById("recipe-side-panel");
        const overlay = document.querySelector(".side-panel-overlay");

        if (panel) panel.classList.remove("open");
        if (overlay) overlay.classList.remove("active");

        // Update banner share button visibility (hide it when panel closes)
        if (typeof updateBannerShareButton === 'function') {
            updateBannerShareButton();
        }

        loadRecipes();
        
        // Update all cuisine counts after saving recipe
        await updateAllCuisineCounts();
    }
});


// ================================
// EXPAND PANEL FULLSCREEN
// ================================
document.addEventListener("click", (e) => {
    const expandBtn = e.target.closest(".expand-panel-btn");
    if (expandBtn) {
        const panel = expandBtn.closest(".side-panel") || document.querySelector(".side-panel");
        if (panel) {
            panel.classList.toggle("fullscreen");
        }
    }
});


// ================================
// AUTOSAVE - FIXED WITH userId
// ================================
let isCreatingDoc = false;

async function autoSave(field, value) {
    if (isLoadingRecipe) return;

    if (!currentDraftId) {
        if (isCreatingDoc) return;
        isCreatingDoc = true;

        try {
            const user = auth.currentUser;
            if (!user) {
                console.error("No user logged in");
                isCreatingDoc = false;
                return;
            }

            // Ã¢Â­Â CRITICAL FIX: Add userId when creating
            const docRef = await db.collection("recipes").add({
                userId: user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            currentDraftId = docRef.id;
            
            // Update banner share button visibility when recipe is created
            if (typeof updateBannerShareButton === 'function') {
                updateBannerShareButton();
            }

        } catch (err) {
            console.error("Error creating recipe:", err);
            isCreatingDoc = false;
            return;
        }

        isCreatingDoc = false;
    }

    await db.collection("recipes").doc(currentDraftId).update({
        [field]: value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ================================
// ADD TO FAVORITES
// ================================
async function addToFavorites(recipeId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error("No user logged in");
            return;
        }

        // Get current recipe to preserve existing cuisines
        const recipeDoc = await db.collection("recipes").doc(recipeId).get();
        const recipeData = recipeDoc.data();
        const currentCuisines = recipeData.cuisines || (recipeData.cuisine ? [recipeData.cuisine] : []);
        
        // Check if Favorites is already present (handle both string and object formats)
        const hasFavorites = currentCuisines.some(c => 
            (typeof c === 'string' && c === "Favorites") || 
            (typeof c === 'object' && c.name === "Favorites")
        );
        
        // Add Favorites if not already present (as string for special case)
        if (!hasFavorites) {
            currentCuisines.push("Favorites");
        }
        
        // Extract name for backward compatibility field
        const firstCuisineName = currentCuisines.length > 0 
            ? (typeof currentCuisines[0] === 'string' ? currentCuisines[0] : currentCuisines[0].name || "")
            : "";
        
        await db.collection("recipes").doc(recipeId).update({
            cuisines: currentCuisines,
            cuisine: firstCuisineName, // Keep for backward compatibility
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update all cuisine counts
        await updateAllCuisineCounts();

        // Reload recipes to reflect the change
        loadRecipes();
    } catch (error) {
        console.error("Error adding to favorites:", error);
        alert("Error adding recipe to favorites. Please try again.");
    }
}

// ================================
// REMOVE FROM FAVORITES
// ================================
async function removeFromFavorites(recipeId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error("No user logged in");
            return;
        }

        // Get current recipe to preserve existing cuisines
        const recipeDoc = await db.collection("recipes").doc(recipeId).get();
        const recipeData = recipeDoc.data();
        const currentCuisines = recipeData.cuisines || (recipeData.cuisine ? [recipeData.cuisine] : []);
        
        // Remove Favorites (handle both string and object formats)
        const filteredCuisines = currentCuisines.filter(c => {
            if (typeof c === 'string') {
                return c !== "Favorites";
            } else if (typeof c === 'object') {
                return c.name !== "Favorites";
            }
            return true;
        });
        
        // Extract name for backward compatibility field
        const firstCuisineName = filteredCuisines.length > 0 
            ? (typeof filteredCuisines[0] === 'string' ? filteredCuisines[0] : filteredCuisines[0].name || "")
            : "";
        
        await db.collection("recipes").doc(recipeId).update({
            cuisines: filteredCuisines,
            cuisine: firstCuisineName, // Keep for backward compatibility
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update all cuisine counts
        await updateAllCuisineCounts();

        // Reload recipes to reflect the change
        loadRecipes();
    } catch (error) {
        console.error("Error removing from favorites:", error);
        alert("Error removing recipe from favorites. Please try again.");
    }
}

// ================================
// UPDATE ALL CUISINE COUNTS
// ================================
async function updateAllCuisineCounts() {
    console.log('🔄 updateAllCuisineCounts called');
    try {
        const user = auth.currentUser;
        if (!user) {
            console.log('❌ No user logged in');
            return;
        }

        // Get workspace filter with better error handling
        let workspaceFilter;
        try {
            workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : null;
        } catch (e) {
            console.log('⚠️ getWorkspaceFilter failed:', e);
            workspaceFilter = null;
        }
        
        // Default to personal workspace if no filter available
        if (!workspaceFilter || !workspaceFilter.type) {
            workspaceFilter = { type: 'personal', userId: user.uid };
        }
        
        console.log('📊 Workspace filter:', workspaceFilter);

        // Build query based on workspace type
        let recipesQuery;
        if (workspaceFilter.type === 'personal') {
            // Personal workspace: query user's recipes, will filter out teamspace ones below
            recipesQuery = db.collection("recipes").where("userId", "==", user.uid);
        } else {
            recipesQuery = db.collection("recipes").where("teamspaceId", "==", workspaceFilter.teamspaceId);
        }
        
        // Get all recipes
        const snapshot = await recipesQuery.get();
        
        // Count recipes per cuisine
        // Recipes can store either names (old format) or objects with id/name (new format)
        const cuisineCountsById = {}; // Count by cuisine ID
        const cuisineCountsByName = {}; // Count by name for backward compatibility
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Skip teamspace recipes when in personal workspace
            if (workspaceFilter.type === 'personal' && data.teamspaceId) {
                return;
            }
            
            const cuisines = data.cuisines || (data.cuisine ? [data.cuisine] : []);
            
            cuisines.forEach(cuisine => {
                if (cuisine) {
                    // Handle both old format (string name) and new format (object with id/name)
                    if (typeof cuisine === 'string') {
                        // Old format: just name
                        cuisineCountsByName[cuisine] = (cuisineCountsByName[cuisine] || 0) + 1;
                    } else if (cuisine.id) {
                        // New format: object with id and name
                        cuisineCountsById[cuisine.id] = (cuisineCountsById[cuisine.id] || 0) + 1;
                    } else if (cuisine.name) {
                        // Fallback: object with just name
                        cuisineCountsByName[cuisine.name] = (cuisineCountsByName[cuisine.name] || 0) + 1;
                    }
                }
            });
        });

        // Update Favorites count
        console.log('⭐ Favorites count:', cuisineCountsByName["Favorites"] || 0);
        let favoritesRow = document.querySelector('[data-id="FAVORITES"]');
        
        // If Favorites row not found, wait and retry
        if (!favoritesRow) {
            console.log('⚠️ Favorites row not found - waiting 500ms...');
            await new Promise(resolve => setTimeout(resolve, 500));
            favoritesRow = document.querySelector('[data-id="FAVORITES"]');
        }
        
        if (favoritesRow) {
            console.log('✅ Found Favorites row');
            const countElement = favoritesRow.querySelector('.cuisine-count');
            if (countElement) {
                const newCount = cuisineCountsByName["Favorites"] || 0;
                console.log('✍️ Setting Favorites count to:', newCount);
                countElement.textContent = newCount;
            } else {
                console.log('❌ No count element in Favorites row');
            }
        } else {
            console.log('❌ Favorites row still not found after waiting');
        }

        // Update all other cuisine counts
        // For each cuisine row, count recipes that match its ID (if available) or name
        let allCuisineRows = document.querySelectorAll('.cuisine-row:not(.cuisine-row-special)');
        console.log('🔍 Found', allCuisineRows.length, 'cuisine rows');
        console.log('📈 Counts by ID:', cuisineCountsById);
        console.log('📈 Counts by name:', cuisineCountsByName);
        
        // If no cuisine rows found, cuisines might not be loaded yet - wait and retry
        if (allCuisineRows.length === 0) {
            console.log('⚠️ No cuisine rows found - cuisines may not be loaded yet. Will retry in 500ms...');
            await new Promise(resolve => setTimeout(resolve, 500));
            allCuisineRows = document.querySelectorAll('.cuisine-row:not(.cuisine-row-special)');
            console.log('🔄 After waiting: Found', allCuisineRows.length, 'cuisine rows');
            
            // If still no rows, give up for now
            if (allCuisineRows.length === 0) {
                console.log('⚠️ Still no cuisine rows after waiting. Counts will update on next page load.');
                return;
            }
        }
        
        allCuisineRows.forEach(row => {
            const cuisineId = row.getAttribute('data-id');
            if (cuisineId && cuisineId !== 'FAVORITES') {
                // Get cuisine name from the input field
                const nameInput = row.querySelector('.cuisine-name-input');
                if (nameInput) {
                    const cuisineName = nameInput.value.trim();
                    const countElement = row.querySelector('.cuisine-count');
                    if (countElement) {
                        // Add both ID count (new format) and name count (old format) for total
                        let count = 0;
                        
                        // Add count by ID if exists (new recipe format)
                        if (cuisineCountsById[cuisineId] !== undefined) {
                            count += cuisineCountsById[cuisineId];
                        }
                        
                        // Also add count by name (old recipe format)
                        if (cuisineCountsByName[cuisineName] !== undefined) {
                            count += cuisineCountsByName[cuisineName];
                        }
                        
                        console.log(`📊 ${cuisineName}: ID count=${cuisineCountsById[cuisineId] || 0}, Name count=${cuisineCountsByName[cuisineName] || 0}, Total=${count}`);
                        countElement.textContent = count;
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error updating cuisine counts:", error);
    }
}

// ================================
// UPDATE FAVORITES COUNT (kept for backward compatibility)
// ================================
async function updateFavoritesCount() {
    await updateAllCuisineCounts();
}

// ================================
// DUPLICATE RECIPE
// ================================
async function duplicateRecipe(recipeId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error("No user logged in");
            return;
        }

        // Get the original recipe
        const originalDoc = await db.collection("recipes").doc(recipeId).get();
        if (!originalDoc.exists) {
            console.error("Recipe not found");
            return;
        }

        const originalData = originalDoc.data();
        
        // Create new recipe data with "Copy" appended to the name
        const newTitle = (originalData.title || "Untitled") + " Copy";
        
        // Handle cuisines (can be array or single string for backward compatibility)
        const originalCuisines = originalData.cuisines || (originalData.cuisine ? [originalData.cuisine] : []);
        
        // Extract name for backward compatibility field
        const firstCuisineName = originalCuisines.length > 0 
            ? (typeof originalCuisines[0] === 'string' ? originalCuisines[0] : originalCuisines[0].name || "")
            : "";
        
        const newRecipeData = {
            userId: user.uid,
            title: newTitle,
            cuisines: originalCuisines,
            cuisine: firstCuisineName, // Keep for backward compatibility
            minutes: originalData.minutes || 0,
            servings: originalData.servings || 0,
            ingredients: originalData.ingredients || "",
            instructions: originalData.instructions || "",
            rating: originalData.rating || 0,
            imageUrl: originalData.imageUrl || "",
            imageOffsetY: originalData.imageOffsetY || 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Create the new recipe
        await db.collection("recipes").add(newRecipeData);

        // Reload recipes to show the new duplicate
        loadRecipes();
        
        // Update all cuisine counts
        await updateAllCuisineCounts();
    } catch (error) {
        console.error("Error duplicating recipe:", error);
        alert("Error duplicating recipe. Please try again.");
    }
}

// ================================
// COPY RECIPE TO ANOTHER WORKSPACE
// ================================
// Makes an independent copy, so editing one never changes the other.

// Places I'm allowed to copy into: my personal book (unless I'm already in
// it) and every teamspace where I'm an owner or editor (viewers can't add)
async function getCopyDestinations() {
    const user = auth.currentUser;
    const current = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal' };
    const destinations = [];

    if (current.type === 'teamspace') {
        destinations.push({ type: 'personal', teamspaceId: null, name: 'My Recipe Book', icon: '🏠' });
    }

    const snapshot = await db.collection('teamspaces')
        .where('memberIds', 'array-contains', user.uid)
        .get();

    snapshot.forEach(doc => {
        const ts = doc.data();
        const role = ts.members?.[user.uid]?.role;
        const isCurrent = current.type === 'teamspace' && current.teamspaceId === doc.id;
        if (!isCurrent && (role === 'owner' || role === 'editor')) {
            destinations.push({ type: 'teamspace', teamspaceId: doc.id, name: ts.name || 'Teamspace', icon: '👥' });
        }
    });

    return destinations;
}

// Small picker in the same style as the app's confirm dialog.
// Resolves with the chosen destination, or null if cancelled.
function pickCopyDestination(recipeTitle, destinations) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'macos-confirm-overlay';

        const options = destinations.length > 0
            ? destinations.map((d, i) => `
                <button class="copy-dest-option" data-index="${i}">
                    <span class="copy-dest-icon">${d.icon}</span>
                    <span>${escapeHtml(d.name)}</span>
                </button>`).join('')
            : `<p class="copy-dest-empty">You're not an owner or editor in any teamspace yet. Create one in Settings, then come back.</p>`;

        overlay.innerHTML = `
            <div class="macos-confirm-box">
                <div class="macos-confirm-message">Copy "${escapeHtml(recipeTitle)}" to…</div>
                <div class="copy-dest-list">${options}</div>
                <div class="macos-confirm-buttons">
                    <button class="macos-btn macos-cancel">Cancel</button>
                </div>
            </div>
        `;

        const close = (choice) => {
            overlay.remove();
            resolve(choice);
        };

        overlay.querySelector('.macos-cancel').addEventListener('click', () => close(null));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
        overlay.querySelectorAll('.copy-dest-option').forEach(btn => {
            btn.addEventListener('click', () => close(destinations[Number(btn.dataset.index)]));
        });

        document.body.appendChild(overlay);
    });
}

async function copyRecipeToWorkspace(recipeId) {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const originalDoc = await db.collection('recipes').doc(recipeId).get();
        if (!originalDoc.exists) return;
        const original = originalDoc.data();

        const destinations = await getCopyDestinations();
        const destination = await pickCopyDestination(original.title || 'Untitled', destinations);
        if (!destination) return;

        // Cuisine IDs belong to the old workspace, so carry them over by name.
        // A teamspace cuisine with the same name will pick the recipe up in its count.
        const cuisines = (original.cuisines || (original.cuisine ? [original.cuisine] : []))
            .map(c => typeof c === 'string' ? c : c?.name)
            .filter(Boolean);

        await db.collection('recipes').add({
            userId: user.uid,
            teamspaceId: destination.teamspaceId,
            title: original.title || 'Untitled',
            cuisines: cuisines,
            cuisine: cuisines[0] || '',
            minutes: original.minutes || 0,
            servings: original.servings || 0,
            ingredients: original.ingredients || '',
            instructions: original.instructions || '',
            rating: original.rating || 0,
            imageUrl: original.imageUrl || '',
            imageOffsetY: original.imageOffsetY || 0,
            imagePosition: original.imagePosition || null,
            // Linked ingredients point at the old workspace's ingredients, so leave them out
            relatedIngredients: [],
            copiedFrom: recipeId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (typeof showSuccessMessage === 'function') {
            showSuccessMessage(`Copied to ${destination.name}`);
        }
    } catch (error) {
        console.error('Error copying recipe:', error);
        alert('Could not copy the recipe. Please try again.');
    }
}

// ================================
// CREATE DEFAULT RECIPES FOR NEW USERS
// ================================
async function createDefaultRecipes(userId) {
    const defaultRecipes = [
        {
            title: "Classic Chocolate Chip Cookies",
            cuisines: ["Dessert"],
            minutes: 25,
            servings: 24,
            ingredients: `2 1/4 cups all-purpose flour
1 tsp baking soda
1 tsp salt
1 cup (2 sticks) butter, softened
3/4 cup granulated sugar
3/4 cup packed brown sugar
2 large eggs
2 tsp vanilla extract
2 cups chocolate chips`,
            instructions: `1. Preheat oven to 375Â°F (190Â°C).

2. In a small bowl, combine flour, baking soda, and salt. Set aside.

3. In a large bowl, beat butter and both sugars until creamy. Add eggs and vanilla, beat well.

4. Gradually stir in flour mixture. Fold in chocolate chips.

5. Drop rounded tablespoons of dough onto ungreased baking sheets.

6. Bake 9-11 minutes or until golden brown. Cool on baking sheet for 2 minutes, then transfer to wire rack.`,
            rating: 5,
            imageUrl: "Images/chocolate-chip-cookies.jpeg",
            imageOffsetY: 0
        },
        {
            title: "Quick & Easy Pasta Aglio e Olio",
            cuisines: ["Italian", "Mains"],
            minutes: 20,
            servings: 4,
            ingredients: `1 lb spaghetti
1/2 cup olive oil
6-8 cloves garlic, thinly sliced
1/2 tsp red pepper flakes
1/4 cup fresh parsley, chopped
1/2 cup Parmesan cheese, grated
Salt and pepper to taste`,
            instructions: `1. Cook spaghetti according to package directions in salted water. Reserve 1 cup pasta water before draining.

2. While pasta cooks, heat olive oil in a large skillet over medium heat. Add sliced garlic and cook 2-3 minutes until golden (don't burn!).

3. Add red pepper flakes and cook 30 seconds.

4. Add drained pasta to the skillet with garlic oil. Toss to coat, adding reserved pasta water as needed to create a light sauce.

5. Remove from heat, add parsley and Parmesan. Season with salt and pepper.

6. Serve immediately with extra Parmesan on top.`,
            rating: 4,
            imageUrl: "Images/pasta-aglio.jpg",
            imageOffsetY: 0
        },
        {
            title: "Perfect Scrambled Eggs",
            cuisines: ["Breakfast"],
            minutes: 10,
            servings: 2,
            ingredients: `4 large eggs
2 tbsp butter
2 tbsp milk or cream
Salt and pepper to taste
Fresh chives or herbs (optional)`,
            instructions: `1. Crack eggs into a bowl. Add milk, salt, and pepper. Whisk until well combined and slightly frothy.

2. Heat a non-stick skillet over medium-low heat. Add butter and let it melt, coating the pan.

3. Pour in egg mixture. Let sit for 20 seconds without stirring.

4. Using a spatula, gently push eggs from edges to center, tilting pan to let uncooked egg flow to edges.

5. Continue this process until eggs are mostly set but still slightly creamy (they'll continue cooking off heat).

6. Remove from heat immediately. Garnish with fresh herbs if desired. Serve hot!`,
            rating: 5,
            imageUrl: "Images/scrambled-eggs.jpg",
            imageOffsetY: 0
        }
    ];
    
    const batch = db.batch();
    
    for (const recipe of defaultRecipes) {
        const docRef = db.collection('recipes').doc();
        batch.set(docRef, {
            title: recipe.title,
            cuisines: recipe.cuisines,
            minutes: recipe.minutes,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            rating: recipe.rating,
            imageUrl: recipe.imageUrl,
            imageOffsetY: recipe.imageOffsetY,
            userId: userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    try {
        await batch.commit();
        console.log('✓ Created default recipes for new user');
    } catch (error) {
        console.error('Error creating default recipes:', error);
    }
}

// ================================
// CREATE DEFAULT RECIPES FOR TEAMSPACES
// ================================
async function createDefaultRecipesForTeamspace(teamspaceId, createdBy) {
    const defaultRecipes = [
        {
            title: "Classic Chocolate Chip Cookies",
            cuisines: ["Dessert"],
            minutes: 25,
            servings: 24,
            ingredients: "2 1/4 cups all-purpose flour\n1 tsp baking soda\n1 tsp salt\n1 cup (2 sticks) butter, softened\n3/4 cup granulated sugar\n3/4 cup packed brown sugar\n2 large eggs\n2 tsp vanilla extract\n2 cups chocolate chips",
            instructions: "1. Preheat oven to 375F (190C).\n\n2. In a small bowl, combine flour, baking soda, and salt. Set aside.\n\n3. In a large bowl, beat butter and both sugars until creamy. Add eggs and vanilla, beat well.\n\n4. Gradually stir in flour mixture. Fold in chocolate chips.\n\n5. Drop rounded tablespoons of dough onto ungreased baking sheets.\n\n6. Bake 9-11 minutes or until golden brown. Cool on baking sheet for 2 minutes, then transfer to wire rack.",
            rating: 5,
            imageUrl: "Images/chocolate-chip-cookies.jpeg",
            imageOffsetY: 0
        },
        {
            title: "Quick & Easy Pasta Aglio e Olio",
            cuisines: ["Italian", "Mains"],
            minutes: 20,
            servings: 4,
            ingredients: "1 lb spaghetti\n1/2 cup olive oil\n6-8 cloves garlic, thinly sliced\n1/2 tsp red pepper flakes\n1/4 cup fresh parsley, chopped\n1/2 cup Parmesan cheese, grated\nSalt and pepper to taste",
            instructions: "1. Cook spaghetti according to package directions in salted water. Reserve 1 cup pasta water before draining.\n\n2. While pasta cooks, heat olive oil in a large skillet over medium heat. Add sliced garlic and cook 2-3 minutes until golden (don't burn!).\n\n3. Add red pepper flakes and cook 30 seconds.\n\n4. Add drained pasta to the skillet with garlic oil. Toss to coat, adding reserved pasta water as needed to create a light sauce.\n\n5. Remove from heat, add parsley and Parmesan. Season with salt and pepper.\n\n6. Serve immediately with extra Parmesan on top.",
            rating: 4,
            imageUrl: "Images/pasta-aglio.jpg",
            imageOffsetY: 0
        },
        {
            title: "Perfect Scrambled Eggs",
            cuisines: ["Breakfast"],
            minutes: 10,
            servings: 2,
            ingredients: "4 large eggs\n2 tbsp butter\n2 tbsp milk or cream\nSalt and pepper to taste\nFresh chives or herbs (optional)",
            instructions: "1. Crack eggs into a bowl. Add milk, salt, and pepper. Whisk until well combined and slightly frothy.\n\n2. Heat a non-stick skillet over medium-low heat. Add butter and let it melt, coating the pan.\n\n3. Pour in egg mixture. Let sit for 20 seconds without stirring.\n\n4. Using a spatula, gently push eggs from edges to center, tilting pan to let uncooked egg flow to edges.\n\n5. Continue this process until eggs are mostly set but still slightly creamy (they'll continue cooking off heat).\n\n6. Remove from heat immediately. Garnish with fresh herbs if desired. Serve hot!",
            rating: 5,
            imageUrl: "Images/scrambled-eggs.jpg",
            imageOffsetY: 0
        }
    ];
    
    const batch = db.batch();
    
    for (const recipe of defaultRecipes) {
        const docRef = db.collection('recipes').doc();
        batch.set(docRef, {
            title: recipe.title,
            cuisines: recipe.cuisines,
            minutes: recipe.minutes,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            rating: recipe.rating,
            imageUrl: recipe.imageUrl,
            imageOffsetY: recipe.imageOffsetY,
            teamspaceId: teamspaceId,
            createdBy: createdBy,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    try {
        await batch.commit();
        console.log('Created default recipes for teamspace');
    } catch (error) {
        console.error('Error creating default recipes for teamspace:', error);
    }
}

// Helper function to add default recipes to existing user (call from console)
window.addDefaultRecipesToMe = async function() {
    const user = auth.currentUser;
    if (!user) {
        console.error('No user logged in!');
        return;
    }
    
    console.log('Adding default recipes...');
    
    // Check what recipes already exist
    const existingSnapshot = await db.collection('recipes')
        .where('userId', '==', user.uid)
        .get();
    
    const existingTitles = new Set();
    existingSnapshot.forEach(doc => {
        existingTitles.add(doc.data().title);
    });
    
    console.log('Existing recipes:', existingTitles.size);
    
    const defaultRecipes = [
        {
            title: "Classic Chocolate Chip Cookies",
            cuisines: ["Dessert"],
            minutes: 25,
            servings: 24,
            ingredients: `2 1/4 cups all-purpose flour
1 tsp baking soda
1 tsp salt
1 cup (2 sticks) butter, softened
3/4 cup granulated sugar
3/4 cup packed brown sugar
2 large eggs
2 tsp vanilla extract
2 cups chocolate chips`,
            instructions: `1. Preheat oven to 375Â°F (190Â°C).

2. In a small bowl, combine flour, baking soda, and salt. Set aside.

3. In a large bowl, beat butter and both sugars until creamy. Add eggs and vanilla, beat well.

4. Gradually stir in flour mixture. Fold in chocolate chips.

5. Drop rounded tablespoons of dough onto ungreased baking sheets.

6. Bake 9-11 minutes or until golden brown. Cool on baking sheet for 2 minutes, then transfer to wire rack.`,
            rating: 5,
            imageUrl: "Images/chocolate-chip-cookies.jpeg"
        },
        {
            title: "Quick & Easy Pasta Aglio e Olio",
            cuisines: ["Italian", "Mains"],
            minutes: 20,
            servings: 4,
            ingredients: `1 lb spaghetti
1/2 cup olive oil
6-8 cloves garlic, thinly sliced
1/2 tsp red pepper flakes
1/4 cup fresh parsley, chopped
1/2 cup Parmesan cheese, grated
Salt and pepper to taste`,
            instructions: `1. Cook spaghetti according to package directions in salted water. Reserve 1 cup pasta water before draining.

2. While pasta cooks, heat olive oil in a large skillet over medium heat. Add sliced garlic and cook 2-3 minutes until golden (don't burn!).

3. Add red pepper flakes and cook 30 seconds.

4. Add drained pasta to the skillet with garlic oil. Toss to coat, adding reserved pasta water as needed to create a light sauce.

5. Remove from heat, add parsley and Parmesan. Season with salt and pepper.

6. Serve immediately with extra Parmesan on top.`,
            rating: 4,
            imageUrl: "Images/pasta-aglio.jpg"
        },
        {
            title: "Perfect Scrambled Eggs",
            cuisines: ["Breakfast"],
            minutes: 10,
            servings: 2,
            ingredients: `4 large eggs
2 tbsp butter
2 tbsp milk or cream
Salt and pepper to taste
Fresh chives or herbs (optional)`,
            instructions: `1. Crack eggs into a bowl. Add milk, salt, and pepper. Whisk until well combined and slightly frothy.

2. Heat a non-stick skillet over medium-low heat. Add butter and let it melt, coating the pan.

3. Pour in egg mixture. Let sit for 20 seconds without stirring.

4. Using a spatula, gently push eggs from edges to center, tilting pan to let uncooked egg flow to edges.

5. Continue this process until eggs are mostly set but still slightly creamy (they'll continue cooking off heat).

6. Remove from heat immediately. Garnish with fresh herbs if desired. Serve hot!`,
            rating: 5,
            imageUrl: "Images/scrambled-eggs.jpg"
        }
    ];
    
    const batch = db.batch();
    let addedCount = 0;
    
    for (const recipe of defaultRecipes) {
        if (existingTitles.has(recipe.title)) {
            console.log(`âŠ˜ Skipping "${recipe.title}" - already exists`);
            continue;
        }
        
        const docRef = db.collection('recipes').doc();
        batch.set(docRef, {
            title: recipe.title,
            cuisines: recipe.cuisines,
            minutes: recipe.minutes,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            rating: recipe.rating,
            imageUrl: recipe.imageUrl,
            imageOffsetY: 0,
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        addedCount++;
        console.log(`✓ Adding "${recipe.title}"`);
    }
    
    if (addedCount === 0) {
        console.log('âœ… All default recipes already exist!');
        return;
    }
    
    try {
        await batch.commit();
        console.log(`âœ… Added ${addedCount} recipes! Reloading...`);
        location.reload();
    } catch (error) {
        console.error('âŒ Error:', error);
    }
};

// ================================
// FINAL SAVE
// ================================
async function finalizeRecipeSave() {
    if (!currentDraftId) return;

    const doc = await db.collection("recipes").doc(currentDraftId).get();
    const existing = doc.data() || {};

    const title = document.getElementById("recipe-name").value.trim();
    const cuisines = getCurrentCuisines();
    const minutes = parseInt(document.getElementById("recipe-minutes").value) || 0;
    const servings = parseInt(document.getElementById("recipe-servings").value) || 0;
    const ingredients = document.getElementById("recipe-ingredients").value;
    const instructions = document.getElementById("recipe-instructions").value;
    const rating = document.querySelectorAll('.star-input.active').length;

    const preview = document.getElementById("cover-image-preview");
    const imageUrl = preview.classList.contains("has-image") ? preview.src : "";
    const imagePosition = { top: preview.style.top || "0px" };

    const user = auth.currentUser;
    
    // Get current workspace - if in a teamspace, save to that teamspace
    const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal' };
    const teamspaceId = workspaceFilter.type === 'teamspace' ? workspaceFilter.teamspaceId : null;

    // Keep whoever created the recipe as its owner. Saving someone else's
    // teamspace recipe used to overwrite userId with yours, which quietly
    // moved the recipe into your personal list.
    const ownerId = existing.userId !== undefined
        ? existing.userId
        : (teamspaceId ? null : (user ? user.uid : null));

    await db.collection("recipes").doc(currentDraftId).set({
        userId: ownerId,
        teamspaceId: existing.teamspaceId !== undefined ? existing.teamspaceId : teamspaceId, // Preserve existing or use current workspace
        createdAt: existing.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
        title,
        cuisines: cuisines,
        // Keep for backward compatibility - extract name if it's an object
        cuisine: cuisines.length > 0 ? (typeof cuisines[0] === 'string' ? cuisines[0] : cuisines[0].name || "") : "",
        minutes,
        servings,
        ingredients,
        instructions,
        rating,
        imageUrl,
        imagePosition,
        relatedIngredients: selectedIngredientsForRecipe, // Store related ingredient IDs
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}