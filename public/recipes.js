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

    // Fetch all recipes and sort client-side
    db.collection("recipes")
        .where("userId", "==", user.uid)
        .get()
        .then(snapshot => {
            recipeGrid.innerHTML = "";

            if (snapshot.size === 0) {
                noRecipes.classList.remove("hidden");
                recipeGrid.classList.add("hidden");
                recipeGrid.classList.remove("loading");
                isLoadingGrid = false;
                return;
            } else {
                noRecipes.classList.add("hidden");
                recipeGrid.classList.remove("hidden");
            }

            // Convert to array for sorting
            const recipes = [];
            snapshot.forEach(doc => {
                recipes.push({ id: doc.id, ...doc.data() });
            });

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

            const filledStars = "★".repeat(r.rating || 0);
            const emptyStars = "☆".repeat(5 - (r.rating || 0));

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
                        r.imageUrl
                            ? `<img src="${r.imageUrl}" class="card-img" data-offset="${r.imageOffsetY || 0}" style="top: ${r.imageOffsetY || 0}px;">`
                            : `<div class="card-img placeholder"></div>`
                    }
                </div>

                <div class="card-body">
                    <div class="card-title-row">
                        <img src="Images/fork-knife-logo.png" class="card-title-icon">
                        <span class="card-title">${r.title || "Untitled"}</span>
                    </div>

                    <div class="card-rating">${filledStars}${emptyStars}</div>
                    <div class="card-time">${r.minutes || 0} mins</div>
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

            // ⭐ CRITICAL FIX: Add userId when creating
            const docRef = await db.collection("recipes").add({
                userId: user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            currentDraftId = docRef.id;

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
    try {
        const user = auth.currentUser;
        if (!user) return;

        // Get all recipes
        const snapshot = await db.collection("recipes")
            .where("userId", "==", user.uid)
            .get();
        
        // Count recipes per cuisine
        // Recipes can store either names (old format) or objects with id/name (new format)
        const cuisineCountsById = {}; // Count by cuisine ID
        const cuisineCountsByName = {}; // Count by name for backward compatibility
        
        snapshot.forEach(doc => {
            const data = doc.data();
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
        const favoritesRow = document.querySelector('[data-id="FAVORITES"]');
        if (favoritesRow) {
            const countElement = favoritesRow.querySelector('.cuisine-count');
            if (countElement) {
                countElement.textContent = cuisineCountsByName["Favorites"] || 0;
            }
        }

        // Update all other cuisine counts
        // For each cuisine row, count recipes that match its ID (if available) or name
        const allCuisineRows = document.querySelectorAll('.cuisine-row:not(.cuisine-row-special)');
        allCuisineRows.forEach(row => {
            const cuisineId = row.getAttribute('data-id');
            if (cuisineId && cuisineId !== 'FAVORITES') {
                // Get cuisine name from the input field
                const nameInput = row.querySelector('.cuisine-name-input');
                if (nameInput) {
                    const cuisineName = nameInput.value.trim();
                    const countElement = row.querySelector('.cuisine-count');
                    if (countElement) {
                        // Prefer counting by ID if available (new format), otherwise by name (backward compatibility)
                        let count = 0;
                        if (cuisineCountsById[cuisineId] !== undefined) {
                            count = cuisineCountsById[cuisineId];
                        } else {
                            count = cuisineCountsByName[cuisineName] || 0;
                        }
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

    await db.collection("recipes").doc(currentDraftId).set({
        userId: user ? user.uid : existing.userId,  // Preserve existing userId or set new one
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