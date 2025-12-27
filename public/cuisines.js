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
        
        const docRef = await db.collection("cuisines").add({
            userId: user.uid,
            name: "Cuisine",
            count: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

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

// Ensure there's always an indicator at the end of the list for dropping
function ensureTrailingIndicator(list) {
    const lastChild = list.lastChild;
    
    // If the last child is not an indicator, add one
    if (!lastChild || !lastChild.classList?.contains('cuisine-drop-indicator')) {
        const trailingIndicator = document.createElement("div");
        trailingIndicator.classList.add("cuisine-drop-indicator");
        list.appendChild(trailingIndicator);
    }
}

// Helper function to create and add a cuisine row
function addCuisineRow(list, id, data, animate = false, isSpecial = false) {
    const indicator = document.createElement("div");
    indicator.classList.add("cuisine-drop-indicator");

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
                        return `<div class="cuisine-row-icon-svg" data-cuisine-id="${id}" style="${cursorStyle} display: inline-flex; align-items: center; justify-content: center;">${iconObj.svg.replace('<svg', '<svg width="22" height="22" style="stroke: #333; fill: none;"')}</div>`;
                    }
                } catch (e) {
                    // Not JSON, check if emoji or image
                    if (!data.iconUrl.startsWith('data:') && !data.iconUrl.startsWith('Images/') && !data.iconUrl.startsWith('http')) {
                        return `<span class="cuisine-row-icon-emoji" data-cuisine-id="${id}" style="${cursorStyle}">${data.iconUrl}</span>`;
                    } else {
                        return `<img src="${data.iconUrl}" class="cuisine-row-icon" data-cuisine-id="${id}" style="${cursorStyle}">`;
                    }
                }
            })()}
            <input class="cuisine-name-input" value="${data.name}" ${isSpecial ? 'readonly' : 'readonly'}>
        </div>

        ${isSpecial ? '' : '<div class="cuisine-edit-btn"><img src="Images/edit.png" class="edit-icon"></div>'}
    `;

    // Insert logic: special rows go at the top, regular rows go after special rows
    if (isSpecial) {
        // Insert special rows at the very top
        if (list.firstChild) {
            list.insertBefore(row, list.firstChild);
            list.insertBefore(indicator, row);
        } else {
            list.appendChild(indicator);
            list.appendChild(row);
        }
    } else {
        // Find the first non-special row (after Favorites)
        const firstRegularRow = list.querySelector('.cuisine-row:not(.cuisine-row-special)');
        if (firstRegularRow) {
            list.insertBefore(row, firstRegularRow);
            list.insertBefore(indicator, row);
        } else {
            // No regular rows yet, append to end
            list.appendChild(indicator);
            list.appendChild(row);
        }
    }

    // Ensure there's always a trailing indicator at the end
    ensureTrailingIndicator(list);

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

            row.style.transition = "opacity 0.2s ease, transform 0.2s ease";
            row.style.opacity = "0";
            row.style.transform = "translateX(-10px)";
            
            setTimeout(async () => {
                await db.collection("cuisines").doc(id).delete();
                indicator.remove();
                row.remove();
            }, 200);
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

// ================================
// CUISINES - LOAD LIST
// ================================
// Wrapper function with fade transition
async function loadCuisinesWithFade(sortBy = 'name', sortOrder = 'asc') {
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

async function loadCuisines(sortBy = 'name', sortOrder = 'asc') {
    const list = document.getElementById("cuisines-list");
    if (!list) return;

    const user = auth.currentUser;
    if (!user) {
        console.error("No user logged in");
        return;
    }

    list.innerHTML = "";

    try {
        // Always add "Favorites" first as a special cuisine
        // Calculate the count of recipes with cuisine = "Favorites"
        const favoritesSnapshot = await db.collection("recipes")
            .where("userId", "==", user.uid)
            .where("cuisine", "==", "Favorites")
            .get();
        
        const favoritesCount = favoritesSnapshot.size;
        const favoritesData = { name: "Favorites", count: favoritesCount, iconUrl: "Images/star-black.png" };
        addCuisineRow(list, "FAVORITES", favoritesData, false, true);

        const snapshot = await db.collection("cuisines")
            .where("userId", "==", user.uid)
            .get();

        if (snapshot.empty) {
            ensureTrailingIndicator(list);
            enableDragAndDrop();
            return;
        }

        // Convert to array and calculate counts if needed
        const items = [];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });

        // If sorting by count, calculate counts for each cuisine
        if (sortBy === 'count') {
            const recipesSnapshot = await db.collection("recipes")
                .where("userId", "==", user.uid)
                .get();
            
            // Count by ID (new format) and by name (backward compatibility)
            const cuisineCountsById = {};
            const cuisineCountsByName = {};
            
            recipesSnapshot.forEach(doc => {
                const recipeData = doc.data();
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
        }

        // Sort the items
        items.sort((a, b) => {
            let compareResult = 0;
            
            if (sortBy === 'name') {
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
            }
            
            return compareResult;
        });

        // Render sorted items (Favorites is already added)
        items.forEach(item => {
            addCuisineRow(list, item.id, item, false); // false = no animation on initial load
        });

        ensureTrailingIndicator(list);
        enableDragAndDrop();
        
        // Update all cuisine counts after loading
        await updateAllCuisineCounts();
    } catch (error) {
        console.error("Error loading cuisines:", error);
    }
}


let dragSrcEl = null;

function enableDragAndDrop() {
    const rows = document.querySelectorAll(".cuisine-row");
    const list = document.getElementById("cuisines-list");
    
    // Guard: if no cuisines list exists, exit early
    if (!list) {
        console.log('No cuisines list found, skipping drag and drop init');
        return;
    }
    
    console.log('enableDragAndDrop called, found rows:', rows.length);
    
    // Add dragover to the list itself for top/bottom zones
    if (list && !list.dataset.listDragInit) {
        list.dataset.listDragInit = 'true';
        
        list.addEventListener("dragover", (e) => {
            e.preventDefault();
            
            const listRect = list.getBoundingClientRect();
            const mouseY = e.clientY;
            const firstRow = list.querySelector('.cuisine-row');
            const lastRow = list.querySelector('.cuisine-row:last-of-type');
            
            // Top zone - above first row (only allow if first row is not Favorites)
            if (firstRow) {
                const isFirstRowFavorites = firstRow.getAttribute('data-id') === 'FAVORITES';
                const firstRowRect = firstRow.getBoundingClientRect();
                if (mouseY < firstRowRect.top && !isFirstRowFavorites) {
                    document.querySelectorAll(".cuisine-drop-indicator")
                        .forEach(ind => ind.style.display = "none");
                    const firstIndicator = firstRow.previousElementSibling;
                    if (firstIndicator?.classList.contains("cuisine-drop-indicator")) {
                        firstIndicator.style.display = "block";
                    }
                }
            }
            
            // Bottom zone - below last row
            if (lastRow) {
                const lastRowRect = lastRow.getBoundingClientRect();
                if (mouseY > lastRowRect.bottom) {
                    document.querySelectorAll(".cuisine-drop-indicator")
                        .forEach(ind => ind.style.display = "none");
                    const lastIndicator = list.lastElementChild;
                    if (lastIndicator?.classList.contains("cuisine-drop-indicator")) {
                        lastIndicator.style.display = "block";
                    }
                }
            }
        });
    }

    rows.forEach(row => {
        // Skip special rows (like Favorites) - they are not draggable
        if (row.classList.contains('cuisine-row-special')) {
            return;
        }
        
        // Make sure draggable attribute is set
        row.setAttribute('draggable', 'true');
        
        // Skip if already initialized (prevents duplicate listeners without cloning)
        if (row.dataset.dragInit) return;
        row.dataset.dragInit = 'true';
        
        row.addEventListener("dragstart", (e) => {
            console.log('Drag started on:', row.getAttribute('data-id'));
            dragSrcEl = row;
            row.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            
            // Create drag preview of entire row
            const clone = row.cloneNode(true);
            clone.style.position = "absolute";
            clone.style.top = "-9999px";
            clone.style.width = row.offsetWidth + "px";
            document.body.appendChild(clone);
            e.dataTransfer.setDragImage(clone, 0, 0);
            setTimeout(() => clone.remove(), 0);
        });

        row.addEventListener("dragend", () => {
            row.classList.remove("dragging");
            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");
        });

        row.addEventListener("dragenter", (e) => {
            if (row === dragSrcEl) return;
            e.preventDefault();
        });

        row.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (row === dragSrcEl) return;

            // Prevent dropping above Favorites
            const rowId = row.getAttribute('data-id');
            if (rowId === 'FAVORITES') {
                // Only allow dropping after Favorites, not before
                const indicator = row.nextElementSibling;
                if (indicator?.classList.contains("cuisine-drop-indicator")) {
                    indicator.style.display = "block";
                }
                row.dataset.dropPosition = "after";
                return;
            }

            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");

            const rect = row.getBoundingClientRect();
            const mouseY = e.clientY;
            const rowMiddle = rect.top + (rect.height / 2);

            // Check if trying to drop before Favorites
            const previousRow = row.previousElementSibling?.previousElementSibling;
            if (previousRow && previousRow.getAttribute('data-id') === 'FAVORITES' && mouseY < rowMiddle) {
                // Don't allow dropping before Favorites
                const indicator = row.nextElementSibling;
                if (indicator?.classList.contains("cuisine-drop-indicator")) {
                    indicator.style.display = "block";
                }
                row.dataset.dropPosition = "after";
                return;
            }

            if (mouseY < rowMiddle) {
                const indicator = row.previousElementSibling;
                if (indicator?.classList.contains("cuisine-drop-indicator")) {
                    indicator.style.display = "block";
                }
                row.dataset.dropPosition = "before";
            } else {
                const indicator = row.nextElementSibling;
                if (indicator?.classList.contains("cuisine-drop-indicator")) {
                    indicator.style.display = "block";
                }
                row.dataset.dropPosition = "after";
            }
        });

        row.addEventListener("drop", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (row === dragSrcEl) return;

            const dropPosition = row.dataset.dropPosition || "after";
            const list = document.getElementById("cuisines-list");
            
            // Prevent dropping before Favorites
            const targetRowId = row.getAttribute('data-id');
            if (targetRowId === 'FAVORITES' && dropPosition === "before") {
                return; // Don't allow dropping before Favorites
            }
            
            // Check if previous row is Favorites and we're trying to drop before
            const previousRow = row.previousElementSibling?.previousElementSibling;
            if (previousRow && previousRow.getAttribute('data-id') === 'FAVORITES' && dropPosition === "before") {
                return; // Don't allow dropping before Favorites
            }
            
            const draggedIndicator = dragSrcEl.previousElementSibling;
            if (draggedIndicator?.classList.contains("cuisine-drop-indicator")) {
                draggedIndicator.remove();
            }
            dragSrcEl.remove();

            const targetRow = list.querySelector(`[data-id="${row.getAttribute('data-id')}"]`);
            
            if (dropPosition === "before") {
                if (draggedIndicator) list.insertBefore(draggedIndicator, targetRow);
                list.insertBefore(dragSrcEl, targetRow);
            } else {
                const nextIndicator = targetRow.nextElementSibling;
                const nextRow = nextIndicator?.nextElementSibling;
                
                if (nextRow) {
                    if (draggedIndicator) list.insertBefore(draggedIndicator, nextRow);
                    list.insertBefore(dragSrcEl, nextRow);
                } else {
                    if (draggedIndicator) list.appendChild(draggedIndicator);
                    list.appendChild(dragSrcEl);
                }
            }

            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");

            delete row.dataset.dropPosition;

            // Add blue highlight animation
            dragSrcEl.classList.add('just-dropped');
            setTimeout(() => {
                dragSrcEl.classList.remove('just-dropped');
            }, 600);

            // Save the new order (no need to re-enable drag and drop)
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
    { emoji: '🍕', name: 'pizza' },
    { emoji: '🍔', name: 'hamburger burger' },
    { emoji: '🍟', name: 'fries french fries' },
    { emoji: '🌭', name: 'hot dog' },
    { emoji: '🍿', name: 'popcorn' },
    { emoji: '🧂', name: 'salt' },
    { emoji: '🥓', name: 'bacon' },
    { emoji: '🥚', name: 'egg' },
    { emoji: '🍳', name: 'fried egg cooking' },
    { emoji: '🥞', name: 'pancakes' },
    { emoji: '🧇', name: 'waffle' },
    { emoji: '🥨', name: 'pretzel' },
    { emoji: '🥯', name: 'bagel' },
    { emoji: '🥖', name: 'baguette bread' },
    { emoji: '🧀', name: 'cheese' },
    { emoji: '🥗', name: 'salad' },
    { emoji: '🥙', name: 'stuffed flatbread' },
    { emoji: '🥪', name: 'sandwich' },
    { emoji: '🌮', name: 'taco' },
    { emoji: '🌯', name: 'burrito' },
    { emoji: '🥫', name: 'canned food' },
    { emoji: '🍝', name: 'spaghetti pasta' },
    { emoji: '🍜', name: 'steaming bowl ramen' },
    { emoji: '🍲', name: 'pot food stew' },
    { emoji: '🍛', name: 'curry rice' },
    { emoji: '🍣', name: 'sushi' },
    { emoji: '🍱', name: 'bento box' },
    { emoji: '🥟', name: 'dumpling' },
    { emoji: '🦪', name: 'oyster' },
    { emoji: '🍤', name: 'fried shrimp' },
    { emoji: '🍙', name: 'rice ball' },
    { emoji: '🍚', name: 'cooked rice' },
    { emoji: '🍘', name: 'rice cracker' },
    { emoji: '🍥', name: 'fish cake' },
    { emoji: '🥠', name: 'fortune cookie' },
    { emoji: '🥮', name: 'moon cake' },
    { emoji: '🍢', name: 'oden' },
    { emoji: '🍡', name: 'dango' },
    { emoji: '🍧', name: 'shaved ice' },
    { emoji: '🍨', name: 'ice cream' },
    { emoji: '🍦', name: 'soft ice cream' },
    { emoji: '🥧', name: 'pie' },
    { emoji: '🧁', name: 'cupcake' },
    { emoji: '🍰', name: 'shortcake cake' },
    { emoji: '🎂', name: 'birthday cake' },
    { emoji: '🍮', name: 'custard pudding' },
    { emoji: '🍭', name: 'lollipop' },
    { emoji: '🍬', name: 'candy' },
    { emoji: '🍫', name: 'chocolate bar' },
    { emoji: '🍩', name: 'doughnut donut' },
    { emoji: '🍪', name: 'cookie' },
    { emoji: '🌰', name: 'chestnut' },
    { emoji: '🥜', name: 'peanuts' },
    { emoji: '🍯', name: 'honey pot' },
    { emoji: '🥛', name: 'glass of milk' },
    { emoji: '🍼', name: 'baby bottle' },
    { emoji: '🫖', name: 'teapot' },
    { emoji: '☕', name: 'hot beverage coffee' },
    { emoji: '🍵', name: 'teacup tea' },
    { emoji: '🧃', name: 'beverage box' },
    { emoji: '🥤', name: 'cup with straw' },
    { emoji: '🧋', name: 'bubble tea' },
    { emoji: '🍶', name: 'sake' },
    { emoji: '🍺', name: 'beer mug' },
    { emoji: '🍻', name: 'clinking beer mugs' },
    { emoji: '🥂', name: 'clinking glasses' },
    { emoji: '🍷', name: 'wine glass' },
    { emoji: '🥃', name: 'tumbler glass' },
    { emoji: '🍸', name: 'cocktail glass' },
    { emoji: '🍹', name: 'tropical drink' },
    { emoji: '🧉', name: 'mate' },
    { emoji: '🍾', name: 'bottle with popping cork champagne' },
    { emoji: '🧊', name: 'ice' },
    { emoji: '🥄', name: 'spoon' },
    { emoji: '🍴', name: 'fork and knife' },
    { emoji: '🍽️', name: 'fork and knife with plate' },
    { emoji: '🥢', name: 'chopsticks' },
    { emoji: '🥣', name: 'bowl with spoon' },
    { emoji: '🥡', name: 'takeout box' },
    { emoji: '🍇', name: 'grapes' },
    { emoji: '🍈', name: 'melon' },
    { emoji: '🍉', name: 'watermelon' },
    { emoji: '🍊', name: 'tangerine orange' },
    { emoji: '🍋', name: 'lemon' },
    { emoji: '🍌', name: 'banana' },
    { emoji: '🍍', name: 'pineapple' },
    { emoji: '🥭', name: 'mango' },
    { emoji: '🍎', name: 'red apple' },
    { emoji: '🍏', name: 'green apple' },
    { emoji: '🍐', name: 'pear' },
    { emoji: '🍑', name: 'peach' },
    { emoji: '🍒', name: 'cherries' },
    { emoji: '🍓', name: 'strawberry' },
    { emoji: '🥝', name: 'kiwi fruit' },
    { emoji: '🍅', name: 'tomato' },
    { emoji: '🥥', name: 'coconut' },
    { emoji: '🥑', name: 'avocado' },
    { emoji: '🍆', name: 'eggplant' },
    { emoji: '🥔', name: 'potato' },
    { emoji: '🥕', name: 'carrot' },
    { emoji: '🌽', name: 'corn' },
    { emoji: '🌶️', name: 'hot pepper' },
    { emoji: '🥒', name: 'cucumber' },
    { emoji: '🥬', name: 'leafy greens' },
    { emoji: '🥦', name: 'broccoli' },
    '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥯', '🍳', '🥞', '🧇', '🥓',
    '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯',
    '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤',
    '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧',
    '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜',
    '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻',
    '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'
];

// Food-related icons from Flaticon - located in Images/Icons/
// Save icons as PNG files for consistent sizing
const iconOptions = [
    { name: 'bowl', image: 'Images/Icons/bowl.png' },
    { name: 'bread', image: 'Images/Icons/bread.png' },
    { name: 'cake', image: 'Images/Icons/cake.png' },
    { name: 'candycane', image: 'Images/Icons/candycane.png' },
    { name: 'carrot', image: 'Images/Icons/carrot.png' },
    { name: 'champagne', image: 'Images/Icons/champagne.png' },
    { name: 'cheese', image: 'Images/Icons/cheese.png' },
    { name: 'coffee', image: 'Images/Icons/coffee.png' },
    { name: 'cookie', image: 'Images/Icons/cookie.png' },
    { name: 'croissant', image: 'Images/Icons/croissant.png' },
    { name: 'donut', image: 'Images/Icons/donut.png' },
    { name: 'drumstick', image: 'Images/Icons/drumstick.png' },
    { name: 'egg', image: 'Images/Icons/egg.png' },
    { name: 'fish', image: 'Images/Icons/fish.png' },
    { name: 'hamburger', image: 'Images/Icons/hamburger.png' },
    { name: 'hotdog', image: 'Images/Icons/hotdog.png' },
    { name: 'icecream', image: 'Images/Icons/icecream.png' },
    { name: 'jar', image: 'Images/Icons/jar.png' },
    { name: 'lemon', image: 'Images/Icons/lemon.png' },
    { name: 'lolipop', image: 'Images/Icons/lolipop.png' },
    { name: 'martini', image: 'Images/Icons/martini.png' },
    { name: 'mug', image: 'Images/Icons/mug.png' },
    { name: 'noodles', image: 'Images/Icons/noodles.png' },
    { name: 'pancakes', image: 'Images/Icons/pancakes.png' },
    { name: 'pepper', image: 'Images/Icons/pepper.png' },
    { name: 'pie', image: 'Images/Icons/pie.png' },
    { name: 'pizza', image: 'Images/Icons/pizza.png' },
    { name: 'popcorn', image: 'Images/Icons/popcorn.png' },
    { name: 'pretzel', image: 'Images/Icons/pretzel.png' },
    { name: 'salad', image: 'Images/Icons/salad.png' },
    { name: 'sandwich', image: 'Images/Icons/sandwich.png' },
    { name: 'shrimp', image: 'Images/Icons/shrimp.png' },
    { name: 'soup', image: 'Images/Icons/soup.png' },
    { name: 'steak', image: 'Images/Icons/steak.png' },
    { name: 'sushi', image: 'Images/Icons/suhsi.png' },
    { name: 'taco', image: 'Images/Icons/taco.png' },
    { name: 'turkey', image: 'Images/Icons/turkey.png' },
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