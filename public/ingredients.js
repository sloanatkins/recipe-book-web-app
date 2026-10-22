// Recipes the current user is allowed to query: their own in the personal
// workspace, or the open teamspace's. The security rules reject a query over
// every recipe, so lookups like "which recipes use this ingredient" go through here.
function recipesInCurrentWorkspace() {
    const user = auth.currentUser;
    const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal' };
    if (workspaceFilter.type === 'teamspace') {
        return db.collection('recipes').where('teamspaceId', '==', workspaceFilter.teamspaceId);
    }
    return db.collection('recipes').where('userId', '==', user.uid);
}

// ================================
// INGREDIENT FILE UPLOAD - DEFINED EARLY FOR GLOBAL ACCESS
// ================================
function triggerIngredientUpload() {
    console.log('triggerIngredientUpload called');
    
    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'text/plain,image/png,image/jpeg,image/jpg,image/heic,application/pdf'; // Support text, images, and PDFs
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (e) => {
        console.log('File selected:', e.target.files[0]);
        const file = e.target.files[0];
        if (!file) return;
        
        await processIngredientFile(file);
        document.body.removeChild(fileInput);
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    console.log('File input clicked');
}

// ================================
// INGREDIENTS - LOAD GROUPS
// ================================
// Start with base default groups
const BASE_DEFAULT_GROUPS = ['Fruits', 'Vegetables', 'Dairy', 'Meats', 'Seasonings', 'Condiments', 'Baking', 'Beverages', 'Frozen', 'Canned', 'Grains', 'Other'];
let defaultGroups = [...BASE_DEFAULT_GROUPS];

// Load groups for current workspace from Firestore
async function loadUserGroups() {
    const user = auth.currentUser;
    if (!user) return;
    
    // Get workspace filter
    const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
    
    try {
        let doc;
        if (workspaceFilter.type === 'personal') {
            // Personal workspace - load from userSettings
            doc = await db.collection('userSettings').doc(user.uid).get();
            console.log('Loading personal groups - doc exists:', doc.exists);
        } else {
            // Teamspace - load from teamspaceSettings
            doc = await db.collection('teamspaceSettings').doc(workspaceFilter.teamspaceId).get();
            console.log('Loading teamspace groups - doc exists:', doc.exists);
        }
        
        if (doc.exists && doc.data().ingredientGroups) {
            defaultGroups = doc.data().ingredientGroups;
            console.log('Loaded groups from Firestore:', defaultGroups);
        } else {
            // First time - use base defaults and save them
            defaultGroups = [...BASE_DEFAULT_GROUPS];
            console.log('First time - saving default groups:', defaultGroups);
            
            if (workspaceFilter.type === 'personal') {
                await db.collection('userSettings').doc(user.uid).set({
                    ingredientGroups: defaultGroups
                }, { merge: true });
            } else {
                await db.collection('teamspaceSettings').doc(workspaceFilter.teamspaceId).set({
                    ingredientGroups: defaultGroups
                }, { merge: true });
            }
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        // Reset to defaults on error
        defaultGroups = [...BASE_DEFAULT_GROUPS];
    }
}

// Save groups to Firestore for current workspace
async function saveUserGroups() {
    const user = auth.currentUser;
    if (!user) return;
    
    // Get workspace filter
    const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
    
    try {
        console.log('Saving groups to Firestore:', defaultGroups);
        
        if (workspaceFilter.type === 'personal') {
            await db.collection('userSettings').doc(user.uid).set({
                ingredientGroups: defaultGroups
            }, { merge: true });
        } else {
            await db.collection('teamspaceSettings').doc(workspaceFilter.teamspaceId).set({
                ingredientGroups: defaultGroups
            }, { merge: true });
        }
        
        console.log('Groups saved successfully');
    } catch (error) {
        console.error('Error saving groups:', error);
    }
}

// Wrapper function with fade transition
async function loadShoppingIngredientsWithFade(sortBy = 'name', sortOrder = 'asc') {
    const tbody = document.getElementById('shopping-tbody');
    const table = tbody?.closest('table');
    const shoppingList = document.getElementById('shopping-list');
    if (!tbody || !table || !shoppingList) return;
    
    // Store current height to maintain layout (use table height to keep header stable)
    const currentHeight = table.offsetHeight;
    if (currentHeight > 0) {
        shoppingList.style.minHeight = currentHeight + 'px';
    }
    
    // Fade out only the tbody, not the entire table (keeps header stable)
    tbody.style.opacity = '0';
    tbody.style.transition = 'opacity 0.2s ease';
    
    // Wait for fade out to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Load ingredients (this will clear and rebuild the list)
    await loadShoppingIngredients(sortBy, sortOrder);
    
    // Remove min-height after content is loaded
    shoppingList.style.minHeight = '';
    
    // Force reflow
    void table.offsetHeight;
    
    // Fade back in
    requestAnimationFrame(() => {
        tbody.style.opacity = '';
    });
}

async function loadShoppingIngredients(sortBy = 'name', sortOrder = 'asc') {
    const tbody = document.getElementById('shopping-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const user = auth.currentUser;
    if (!user) return;

    try {
        // Get workspace filter
        const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
        console.log('ðŸ“¦ Loading shopping ingredients for workspace:', workspaceFilter);
        
        let query;
        if (workspaceFilter.type === 'personal') {
            query = db.collection('ingredients')
                .where('userId', '==', user.uid)
                .where('toBuy', '==', true);
        } else {
            query = db.collection('ingredients')
                .where('teamspaceId', '==', workspaceFilter.teamspaceId)
                .where('toBuy', '==', true);
        }
        
        const snapshot = await query.get();

        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; color:#999; padding:24px;">
                        No items to buy
                    </td>
                </tr>
            `;
            return;
        }

        // Convert to array and sort
        const items = [];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });

        // Sort the items
        items.sort((a, b) => {
            let compareResult = 0;
            
            if (sortBy === 'name') {
                compareResult = (a.name || 'Untitled').localeCompare(b.name || 'Untitled');
            } else if (sortBy === 'category') {
                compareResult = (a.category || 'Other').localeCompare(b.category || 'Other');
            } else if (sortBy === 'date') {
                const dateA = a.createdAt?.toMillis() || 0;
                const dateB = b.createdAt?.toMillis() || 0;
                compareResult = dateB - dateA; // Default newest first for dates
            }
            
            // Reverse if descending (except date which defaults to desc)
            if (sortBy !== 'date' && sortOrder === 'desc') {
                compareResult = -compareResult;
            } else if (sortBy === 'date' && sortOrder === 'asc') {
                compareResult = -compareResult;
            }
            
            return compareResult;
        });

        // Render sorted items
        items.forEach(i => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="ingredient-name-cell">
                    <img src="Images/fork-knife-logo.png" class="ingredient-icon">
                    <span>${escapeHtml(i.name || 'Untitled')}</span>
                </td>
                <td>${escapeHtml(i.quantity || '')}</td>
                <td>${escapeHtml(i.category || '')}</td>
                <td>${escapeHtml(i.notes || '')}</td>
            `;

            tbody.appendChild(row);
        });

    } catch (err) {
        console.error('Error loading shopping ingredients:', err);
    }
}

async function loadIngredientGroups() {
    const container = document.getElementById('ingredients-groups');
    if (!container) return;

    container.innerHTML = '';
    
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        // Load user's custom groups first
        await loadUserGroups();
        
        // Get workspace filter
        const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
        console.log('ðŸ“¦ Loading ingredient groups for workspace:', workspaceFilter);
        
        // Fetch all ingredients for this workspace
        let query;
        if (workspaceFilter.type === 'personal') {
            query = db.collection('ingredients').where('userId', '==', user.uid);
        } else {
            query = db.collection('ingredients').where('teamspaceId', '==', workspaceFilter.teamspaceId);
        }
        
        const snapshot = await query.get();
        
        // Group ingredients by category
        const ingredientsByGroup = {};
        defaultGroups.forEach(group => {
            ingredientsByGroup[group] = [];
        });
        
        snapshot.forEach(doc => {
            const ingredient = { id: doc.id, ...doc.data() };
            const category = ingredient.category || 'Other';
            if (ingredientsByGroup[category]) {
                ingredientsByGroup[category].push(ingredient);
            } else {
                ingredientsByGroup['Other'].push(ingredient);
            }
        });
        
        // Create group elements
        defaultGroups.forEach(groupName => {
            const ingredients = ingredientsByGroup[groupName];
            const groupEl = createIngredientGroup(groupName, ingredients);
            container.appendChild(groupEl);
        });
        
    } catch (error) {
        console.error('Error loading ingredients:', error);
    }
}

function createIngredientGroup(name, ingredients = []) {
    const group = document.createElement('div');
    group.classList.add('ingredient-group');
    group.dataset.groupName = name;
    group.setAttribute('draggable', name !== 'Other'); // Only draggable if not "Other"

    // Only show delete menu for groups that aren't "Other"
    const menuHTML = name === 'Other' 
        ? '' 
        : `<button class="group-menu-btn">⋯</button>
           <div class="group-menu hidden">
               <div class="group-menu-item delete-group">Delete group</div>
           </div>`;
    
    // Only show drag handle for groups that aren't "Other"
    const dragHandleHTML = name === 'Other'
        ? '<div class="group-drag-spacer"></div>'
        : `<div class="group-drag-handle">
               <img src="Images/dots.png">
           </div>`;

    group.innerHTML = `
        <div class="group-drop-indicator group-drop-indicator-top"></div>
        <div class="group-header">
            ${dragHandleHTML}
            <div class="group-arrow"></div>
            <span class="group-name">${escapeHtml(name)}</span>
            <div class="group-actions">
                ${menuHTML}
            </div>
        </div>
        <div class="group-content">
            <table class="ingredients-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>To buy</th>
                        <th>Quantity</th>
                        <th>Category</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody id="tbody-${escapeHtml(name)}">
                </tbody>
            </table>
        </div>
        <div class="group-drop-indicator group-drop-indicator-bottom"></div>
    `;

    const header = group.querySelector('.group-header');
    const content = group.querySelector('.group-content');
    const tbody = group.querySelector(`#tbody-${name}`);
    const menuBtn = group.querySelector('.group-menu-btn');
    const menu = group.querySelector('.group-menu');
    const deleteBtn = group.querySelector('.delete-group');

    header.addEventListener('click', () => {
        header.classList.toggle('open');
        content.classList.toggle('open');
    });

    // Only add menu functionality if menu exists (not "Other" group)
    if (menuBtn && menu && deleteBtn) {
        // Menu button - prevent header toggle
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all other group menus
            document.querySelectorAll('.group-menu').forEach(m => m.classList.add('hidden'));
            menu.classList.toggle('hidden');
        });

        // Delete group
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await macConfirm(`Delete the "${name}" group? All ingredients will be moved to "Other".`);
            if (confirmed) {
                try {
                    // Add fade out animation
                    group.style.transition = "opacity 0.2s ease, transform 0.2s ease";
                    group.style.opacity = "0";
                    group.style.transform = "translateX(-10px)";
                    
                    // Wait for animation to complete
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Move all ingredients in this group to "Other"
                    const snapshot = await db.collection('ingredients')
                        .where('userId', '==', auth.currentUser.uid)
                        .where('category', '==', name)
                        .get();
                    
                    const batch = db.batch();
                    snapshot.forEach(doc => {
                        batch.update(doc.ref, { category: 'Other' });
                    });
                    await batch.commit();
                    
                    // Remove from defaultGroups array
                    const index = defaultGroups.indexOf(name);
                    if (index > -1) {
                        defaultGroups.splice(index, 1);
                    }
                    
                    // Save updated groups to Firestore
                    await saveUserGroups();
                    
                    // Remove the group element from DOM
                    group.remove();
                    
                    // Update the "Other" group count if it exists
                    const otherGroup = document.querySelector('[data-group-name="Other"]');
                    if (otherGroup && snapshot.size > 0) {
                        const otherCount = otherGroup.querySelector('.group-count');
                        if (otherCount) {
                            const currentCount = parseInt(otherCount.textContent) || 0;
                            otherCount.textContent = currentCount + snapshot.size;
                        }
                    }
                } catch (error) {
                    console.error('Error deleting group:', error);
                    alert('Failed to delete group');
                }
            }
            menu.classList.add('hidden');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    }
    
    // Add ingredient rows
    ingredients.forEach(ingredient => {
        const row = createIngredientRow(ingredient);
        tbody.appendChild(row);
    });
    
    // Add "New Ingredient" row
    const addRow = document.createElement('tr');
    addRow.classList.add('add-ingredient-row');
    addRow.innerHTML = '<td colspan="5">+ New Ingredient</td>';
    addRow.addEventListener('click', () => {
        openIngredientPanel();
        // Pre-fill category
        document.getElementById('ingredient-category').value = name;
    });
    tbody.appendChild(addRow);

    // Add drag and drop functionality (only for non-Other groups)
    if (name !== 'Other') {
        setupGroupDragAndDrop(group);
    }

    return group;
}

// ================================
// GROUP DRAG AND DROP
// ================================
let draggedGroup = null;

function setupGroupDragAndDrop(group) {
    const header = group.querySelector('.group-header');
    const dragHandle = group.querySelector('.group-drag-handle');
    
    if (!dragHandle) return;
    
    // Prevent header click when dragging from handle
    dragHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    
    group.addEventListener('dragstart', (e) => {
        draggedGroup = group;
        group.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    
    group.addEventListener('dragend', () => {
        group.classList.remove('dragging');
        // Clear all indicators
        document.querySelectorAll('.group-drop-indicator').forEach(ind => {
            ind.style.display = 'none';
        });
        draggedGroup = null;
    });
    
    group.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (!draggedGroup || draggedGroup === group || group.dataset.groupName === 'Other') return;
    });
    
    group.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedGroup || draggedGroup === group || group.dataset.groupName === 'Other') return;
        
        // Clear all indicators
        document.querySelectorAll('.group-drop-indicator').forEach(ind => {
            ind.style.display = 'none';
        });
        
        const rect = group.getBoundingClientRect();
        const mouseY = e.clientY;
        const groupMiddle = rect.top + rect.height / 2;
        
        if (mouseY < groupMiddle) {
            // Show indicator above this group
            const topIndicator = group.querySelector('.group-drop-indicator-top');
            if (topIndicator) topIndicator.style.display = 'block';
        } else {
            // Show indicator below this group
            const bottomIndicator = group.querySelector('.group-drop-indicator-bottom');
            if (bottomIndicator) bottomIndicator.style.display = 'block';
        }
    });
    
    group.addEventListener('dragleave', (e) => {
        // Only clear if leaving the group entirely
        if (!group.contains(e.relatedTarget)) {
            const topIndicator = group.querySelector('.group-drop-indicator-top');
            const bottomIndicator = group.querySelector('.group-drop-indicator-bottom');
            if (topIndicator) topIndicator.style.display = 'none';
            if (bottomIndicator) bottomIndicator.style.display = 'none';
        }
    });
    
    group.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggedGroup || draggedGroup === group || group.dataset.groupName === 'Other') return;
        
        const rect = group.getBoundingClientRect();
        const mouseY = e.clientY;
        const groupMiddle = rect.top + rect.height / 2;
        
        const container = document.getElementById('ingredients-groups');
        
        if (mouseY < groupMiddle) {
            container.insertBefore(draggedGroup, group);
        } else {
            container.insertBefore(draggedGroup, group.nextSibling);
        }
        
        await saveGroupOrder();
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.ingredient-group:not(.dragging):not([data-group-name="Other"])')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveGroupOrder() {
    const container = document.getElementById('ingredients-groups');
    const groups = container.querySelectorAll('.ingredient-group');
    
    const newOrder = [];
    groups.forEach(group => {
        const name = group.dataset.groupName;
        if (name && name !== 'Other') {
            newOrder.push(name);
        }
    });
    
    // Always put "Other" at the end
    newOrder.push('Other');
    
    // Update defaultGroups array
    defaultGroups = newOrder;
    
    // Save to Firestore
    await saveUserGroups();
}

function createIngredientRow(ingredient) {
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td class="ingredient-name-cell">
            <img src="Images/fork-knife-logo.png" class="ingredient-icon">
            <span>${escapeHtml(ingredient.name || 'Untitled')}</span>
        </td>
        <td class="to-buy-cell">
            <input type="checkbox" class="to-buy-checkbox-table" ${ingredient.toBuy ? 'checked' : ''} data-id="${ingredient.id}">
        </td>
        <td>${escapeHtml(ingredient.quantity || '')}</td>
        <td>${escapeHtml(ingredient.category || '')}</td>
        <td>${escapeHtml(ingredient.notes || '')}</td>
        <td style="text-align: right; position: relative;">
            <button class="ingredient-menu-btn" data-id="${ingredient.id}">⋯</button>
            <div class="ingredient-menu hidden" id="menu-${ingredient.id}">
                <div class="ingredient-menu-item edit-ingredient" data-id="${ingredient.id}">Edit</div>
                <div class="ingredient-menu-item delete-ingredient" data-id="${ingredient.id}">Delete</div>
            </div>
        </td>
    `;
    
    // Handle checkbox changes
    const checkbox = row.querySelector('.to-buy-checkbox-table');
    checkbox.addEventListener('change', async (e) => {
        try {
            await db.collection('ingredients').doc(ingredient.id).update({
                toBuy: e.target.checked,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update the checkbox state without refreshing the entire view
            // The checkbox is already updated by the user interaction, so no need to refresh
        } catch (error) {
            console.error('Error updating toBuy:', error);
            // Revert checkbox on error
            e.target.checked = !e.target.checked;
        }
    });
    
    // Handle menu button click
    const menuBtn = row.querySelector('.ingredient-menu-btn');
    const menu = row.querySelector('.ingredient-menu');
    
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other menus
        document.querySelectorAll('.ingredient-menu').forEach(m => m.classList.add('hidden'));
        // Toggle this menu
        menu.classList.toggle('hidden');
    });
    
    // Handle delete click
    const deleteBtn = row.querySelector('.delete-ingredient');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.target.dataset.id;
        menu.classList.add('hidden');
        
        const confirmed = await macConfirm('Delete this ingredient?');
        if (!confirmed) return;
        
        try {
            // Fade out animation
            row.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateX(-10px)';
            
            setTimeout(async () => {
                try {
                    // Find all recipes that reference this ingredient
                    const recipesSnapshot = await recipesInCurrentWorkspace()
                        .where('relatedIngredients', 'array-contains', id)
                        .get();
                    
                    // Remove the ingredient ID from all recipes that reference it
                    const batch = db.batch();
                    recipesSnapshot.forEach(recipeDoc => {
                        const recipeData = recipeDoc.data();
                        const relatedIngredients = recipeData.relatedIngredients || [];
                        const updatedIngredients = relatedIngredients.filter(ingId => ingId !== id);
                        
                        batch.update(recipeDoc.ref, {
                            relatedIngredients: updatedIngredients,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    
                    // Commit recipe updates
                    if (!recipesSnapshot.empty) {
                        await batch.commit();
                    }
                    
                    // Delete the ingredient
                    await db.collection('ingredients').doc(id).delete();
                    row.remove();
                } catch (error) {
                    console.error('Error deleting ingredient:', error);
                    alert('Failed to delete ingredient');
                }
            }, 200);
        } catch (error) {
            console.error('Error deleting ingredient:', error);
            alert('Failed to delete ingredient');
        }
    });

    document.addEventListener("click", (e) => {
        if (e.target.classList.contains("edit-ingredient")) {
            const ingredientId = e.target.dataset.id;
            if (!ingredientId) return;

            openIngredientForEdit(ingredientId);
        }
    });

    
    return row;
}

// ================================
// NEW GROUP BUTTON
// ================================
function initNewGroupButton() {
    const newGroupBtn = document.getElementById('new-group-btn');
    const inputContainer = document.getElementById('new-group-input-container');
    const input = document.getElementById('new-group-input');
    const doneBtn = document.getElementById('new-group-done-btn');

    if (!newGroupBtn || !inputContainer || !input || !doneBtn) return;

    newGroupBtn.addEventListener('click', () => {
        newGroupBtn.classList.add('hidden');
        inputContainer.classList.remove('hidden');
        input.focus();
    });

    doneBtn.addEventListener('click', async () => {
        const groupName = input.value.trim();
        if (groupName) {
            const groupsContainer = document.getElementById('ingredients-groups');
            const newGroup = createIngredientGroup(groupName, []);
            
            // Insert at the top (before first child)
            if (groupsContainer.firstChild) {
                groupsContainer.insertBefore(newGroup, groupsContainer.firstChild);
            } else {
                groupsContainer.appendChild(newGroup);
            }
            
            // Add to defaultGroups array at the beginning
            defaultGroups.unshift(groupName);
            
            // Save the updated order
            await saveUserGroups();
        }
        input.value = '';
        inputContainer.classList.add('hidden');
        newGroupBtn.classList.remove('hidden');
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            doneBtn.click();
        }
    });
}

// ================================
// INGREDIENT SIDE PANEL
// ================================
function openIngredientPanel() {
    const panel = document.getElementById('ingredient-side-panel');
    const overlay = document.querySelector('.side-panel-overlay');

    // Ã°Å¸â€Â´ STEP 3: CLEAR edit mode when opening NEW ingredient
    delete panel.dataset.editingId;
    delete panel.dataset.pendingImageUrl;

    if (!panel || !overlay) {
        console.error('Panel or overlay not found');
        return;
    }

    // Clear inputs
    const nameInput = document.getElementById('ingredient-name');
    if (nameInput) nameInput.value = '';
    
    const categoryInput = document.getElementById('ingredient-category');
    if (categoryInput) categoryInput.value = '';
    
    const quantityInput = document.getElementById('ingredient-quantity');
    if (quantityInput) quantityInput.value = '';
    
    const notesInput = document.getElementById('ingredient-notes');
    if (notesInput) notesInput.value = '';
    
    const buyLabel = document.getElementById('ingredient-to-buy-label');
    if (buyLabel) buyLabel.checked = false;
    
    const buyValue = document.getElementById('ingredient-to-buy-value');
    if (buyValue) buyValue.checked = false;

    // Clear image preview
    const preview = document.getElementById('ingredient-image-preview');
    const imageSection = document.getElementById('ingredient-image-section');
    if (preview) {
        preview.src = '';
        preview.classList.remove('has-image');
    }
    if (imageSection) {
        imageSection.classList.remove('has-image');
        // Ensure placeholder is visible
        const placeholder = document.getElementById('ingredient-image-placeholder');
        if (placeholder) {
            placeholder.style.display = 'flex';
        }
        // Hide menu
        const imageMenu = document.getElementById('ingredient-image-menu');
        if (imageMenu) {
            imageMenu.classList.add('hidden');
        }
    }

    panel.classList.add('open');
    overlay.classList.add('active');
}


function closeIngredientPanel() {
    const panel = document.getElementById('ingredient-side-panel');
    const overlay = document.querySelector('.side-panel-overlay');
    
    // Close any open dropdowns first
    closeRecipeDropdown();
    const categoryDropdown = document.getElementById('category-dropdown');
    const recipeDropdownOverlay = document.getElementById('recipe-dropdown-overlay');
    if (categoryDropdown) categoryDropdown.classList.remove('active');
    if (recipeDropdownOverlay) {
        recipeDropdownOverlay.classList.remove('active');
        recipeDropdownOverlay.style.display = 'none';
        recipeDropdownOverlay.style.opacity = '';
    }

    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ================================
// INGREDIENT IMAGE UPLOAD
// ================================
function initIngredientImageUpload() {
    const uploadBtn = document.getElementById('ingredient-image-upload-btn');
    const fileInput = document.getElementById('ingredient-image-input');
    const preview = document.getElementById('ingredient-image-preview');
    const placeholder = document.getElementById('ingredient-image-placeholder');
    const imageSection = document.getElementById('ingredient-image-section');

    if (!uploadBtn || !fileInput || !preview || !placeholder || !imageSection) return;

    // Click on button or placeholder to upload
    uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    placeholder.addEventListener('click', (e) => {
        if (e.target === placeholder || e.target.closest('.ingredient-image-upload-btn')) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        // Validate file size (e.g., max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image file is too large. Please select an image smaller than 5MB.');
            return;
        }

        // Compress and convert to base64
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        
        img.onload = () => {
            // Clean up object URL
            URL.revokeObjectURL(objectUrl);
            
            // Create canvas for compression
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Calculate new dimensions (max 1200px on longest side)
            let width = img.width;
            let height = img.height;
            const maxSize = 1200;
            
            if (width > height && width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            } else if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to base64 with quality adjustment
            let quality = 0.7;
            let dataUrl = canvas.toDataURL('image/jpeg', quality);
            
            // If still too large, reduce quality further
            while (dataUrl.length > 900000 && quality > 0.1) {
                quality -= 0.1;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            
            // Display the image
            preview.src = dataUrl;
            preview.classList.add('has-image');
            imageSection.classList.add('has-image');
            
            // Show the menu (three dots)
            const imageMenu = document.getElementById('ingredient-image-menu');
            if (imageMenu) {
                imageMenu.classList.remove('hidden');
            }
            
            // Set up image positioning
            preview.style.position = 'absolute';
            preview.style.left = '50%';
            preview.style.transform = 'translateX(-50%)';
            preview.style.cursor = 'grab';
            preview.style.userSelect = 'none';
            const offsetY = parseFloat(preview.dataset.offset || 0);
            preview.style.top = offsetY + 'px';
            
            // Reset file input
            fileInput.value = '';
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            alert('Error loading image. Please try again.');
            fileInput.value = '';
        };
        
        img.src = objectUrl;
    });

    // Menu button click handler
    const menuBtn = document.getElementById('ingredient-image-menu-btn');
    const menuDropdown = document.getElementById('ingredient-image-menu-dropdown');
    const menuUpload = document.getElementById('ingredient-image-menu-upload');
    const menuReposition = document.getElementById('ingredient-image-menu-reposition');
    const menuRemove = document.getElementById('ingredient-image-menu-remove');

    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.toggle('hidden');
        });
    }

    // Upload option in menu
    if (menuUpload && fileInput) {
        menuUpload.addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.add('hidden');
            fileInput.click();
        });
    }

    // Reposition option in menu
    if (menuReposition) {
        menuReposition.addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.add('hidden');
            enterIngredientRepositionMode();
        });
    }

    // Remove option in menu
    if (menuRemove) {
        menuRemove.addEventListener('click', async (e) => {
            e.stopPropagation();
            menuDropdown.classList.add('hidden');
            
            // Remove image
            preview.src = '';
            preview.classList.remove('has-image');
            imageSection.classList.remove('has-image');
            const imageMenu = document.getElementById('ingredient-image-menu');
            if (imageMenu) {
                imageMenu.classList.add('hidden');
            }
            
            // Save to Firebase if editing an existing ingredient
            const panel = document.getElementById('ingredient-side-panel');
            const editingId = panel.dataset.editingId;
            
            if (editingId) {
                await db.collection('ingredients').doc(editingId).update({
                    imageUrl: null,
                    imageOffsetY: null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Clear pending image for new ingredient
                delete panel.dataset.pendingImageUrl;
            }
        });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (menuDropdown && !menuDropdown.contains(e.target) && e.target !== menuBtn) {
            menuDropdown.classList.add('hidden');
        }
    });
    
    // Initialize drag functionality
    initIngredientImageDrag();
    
    // Setup reposition buttons
    setupIngredientRepositionButtons();
}

// Close ingredient panel button

function updateIngredientRow(ingredient) {
    const row = document.querySelector(
        `.to-buy-checkbox-table[data-id="${ingredient.id}"]`
    )?.closest('tr');

    if (!row) return;

    row.querySelector('.ingredient-name-cell span').textContent =
        ingredient.name || 'Untitled';

    row.children[2].textContent = ingredient.quantity || '';
    row.children[3].textContent = ingredient.category || '';
    row.children[4].textContent = ingredient.notes || '';

    const checkbox = row.querySelector('.to-buy-checkbox-table');
    if (checkbox) checkbox.checked = !!ingredient.toBuy;
}



// ================================

// ================================
// INGREDIENT DROPDOWNS - CATEGORY & RECIPES
// ================================
let selectedRecipes = [];

// Category dropdown
document.addEventListener('click', (e) => {
    const categoryInput = document.getElementById('ingredient-category');
    const categoryRow = document.getElementById('category-row');
    
    if (e.target === categoryInput || categoryRow?.contains(e.target)) {
        const dropdown = document.getElementById('category-dropdown');
        const overlay = document.getElementById('recipe-dropdown-overlay');
        
        // Position dropdown
        const rect = categoryInput.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = '600px';
        
        // Load categories
        loadCategoriesForDropdown();
        
        // Show dropdown
        dropdown.classList.add('active');
        overlay.classList.add('active');
    }

    // Handle cuisine dropdown - removed, now handled by + button
});

function loadCategoriesForDropdown() {
    const container = document.getElementById('category-list-items');
    if (!container) return;
    
    container.innerHTML = '';
    
    const categories = defaultGroups; // Use the same groups from ingredients
    
    categories.forEach(category => {
        const item = document.createElement('div');
        item.classList.add('recipe-dropdown-item');
        item.dataset.categoryName = category.toLowerCase();
        
        item.innerHTML = `
            <span style="font-size: 20px; opacity: 0.6; margin-right: 8px;">â‹®â‹®</span>
            <span class="recipe-dropdown-item-name">${escapeHtml(category)}</span>
        `;
        
        item.addEventListener('click', () => {
            document.getElementById('ingredient-category').value = category;
            document.getElementById('category-dropdown').classList.remove('active');
            document.getElementById('recipe-dropdown-overlay').classList.remove('active');
        });
        
        container.appendChild(item);
    });
    
    // Add search functionality
    const searchInput = document.querySelector('#category-dropdown .recipe-dropdown-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = container.querySelectorAll('.recipe-dropdown-item');
            items.forEach(item => {
                const categoryName = item.dataset.categoryName;
                if (categoryName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        };
    }
}

// ================================
// LOAD CUISINES FOR DROPDOWN
// ================================
async function loadCuisinesForDropdown() {
    const container = document.getElementById('cuisine-list-items');
    if (!container) return;
    
    container.innerHTML = '';
    
    try {
        const user = auth.currentUser;
        if (!user) return;

        // Get currently selected cuisines
        const currentCuisines = getCurrentCuisines();
        
        // Always add "Favorites" first (if not already selected)
        if (!currentCuisines.includes("Favorites")) {
            const favoritesItem = document.createElement('div');
            favoritesItem.classList.add('recipe-dropdown-item');
            favoritesItem.innerHTML = `
                <img src="Images/flag-grey.png" class="recipe-dropdown-item-icon" style="width: 18px; height: 18px;">
                <span class="recipe-dropdown-item-name">Favorites</span>
            `;
            
            favoritesItem.addEventListener('click', async () => {
                closeCuisineDropdown();
                await addCuisineTag("Favorites");
            });
            
            container.appendChild(favoritesItem);
        }

        // Get workspace filter
        const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
        
        // Build query based on workspace type
        let cuisinesQuery;
        if (workspaceFilter.type === 'personal') {
            cuisinesQuery = db.collection("cuisines").where("userId", "==", user.uid);
        } else {
            cuisinesQuery = db.collection("cuisines").where("teamspaceId", "==", workspaceFilter.teamspaceId);
        }
        
        // Load user's cuisines from Firebase
        const snapshot = await cuisinesQuery.get();

        if (!snapshot.empty) {
            const cuisines = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                cuisines.push({ id: doc.id, name: data.name });
            });

            // Sort cuisines alphabetically by name
            cuisines.sort((a, b) => a.name.localeCompare(b.name));

            cuisines.forEach(cuisine => {
                // Skip if already selected (check by name for backward compatibility)
                const currentCuisineNames = currentCuisines.map(c => typeof c === 'string' ? c : c.name);
                if (currentCuisineNames.includes(cuisine.name)) {
                    return;
                }
                
                const item = document.createElement('div');
                item.classList.add('recipe-dropdown-item');
                
                item.innerHTML = `
                    <img src="Images/flag-grey.png" class="recipe-dropdown-item-icon" style="width: 18px; height: 18px;">
                    <span class="recipe-dropdown-item-name">${escapeHtml(cuisine.name)}</span>
                `;
                
                item.addEventListener('click', async () => {
                    closeCuisineDropdown();
                    // Store both ID and name for proper counting
                    await addCuisineTag({ id: cuisine.id, name: cuisine.name });
                });
                
                container.appendChild(item);
            });
        }

        // Add search functionality
        const searchInput = document.querySelector('#cuisine-dropdown .recipe-dropdown-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const items = container.querySelectorAll('.recipe-dropdown-item');
                items.forEach(item => {
                    const cuisineName = item.querySelector('.recipe-dropdown-item-name').textContent.toLowerCase();
                    if (cuisineName.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            };
        }
    } catch (error) {
        console.error('Error loading cuisines for dropdown:', error);
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: #d32f2f;">Error loading cuisines</div>';
    }
}

// Recipe dropdown
document.addEventListener('click', async (e) => {
    const addRecipesBtn = e.target.closest('#add-recipes-relation');
    
    if (addRecipesBtn) {
        const dropdown = document.getElementById('recipe-dropdown');
        const overlay = document.getElementById('recipe-dropdown-overlay');
        
        // Position dropdown near the button
        const rect = addRecipesBtn.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = '600px';
        
        // Load recipes
        await loadRecipesForDropdown();
        
        // Show overlay first
        overlay.style.display = 'block';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease';
        
        // Show dropdown with fade
        dropdown.style.display = 'block';
        dropdown.style.opacity = '0';
        dropdown.style.transition = 'opacity 0.2s ease';
        
        // Add active classes
        dropdown.classList.add('active');
        overlay.classList.add('active');
        
        // Force reflow
        void dropdown.offsetHeight;
        void overlay.offsetHeight;
        
        // Fade in
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            dropdown.style.opacity = '1';
        });
    }
});

// Close dropdown
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('recipe-dropdown');
    const ingredientDropdownForRecipe = document.getElementById('ingredient-dropdown-for-recipe');
    const categoryDropdown = document.getElementById('category-dropdown');
    const cuisineDropdown = document.getElementById('cuisine-dropdown');
    const overlay = document.getElementById('recipe-dropdown-overlay');
    
    // Don't close if clicking inside dropdown
    if (dropdown && dropdown.contains(e.target)) {
        return;
    }
    if (ingredientDropdownForRecipe && ingredientDropdownForRecipe.contains(e.target)) {
        return;
    }
    
    if (overlay && overlay.classList.contains('active')) {
        if (e.target === overlay) {
            closeCuisineDropdown();
            // Also close other dropdowns if needed
            if (dropdown && dropdown.classList.contains('active')) {
                closeRecipeDropdown();
            }
            if (ingredientDropdownForRecipe && ingredientDropdownForRecipe.classList.contains('active')) {
                closeIngredientDropdownForRecipe();
            }
            if (categoryDropdown && categoryDropdown.classList.contains('active')) {
                categoryDropdown.classList.remove('active');
                overlay.classList.remove('active');
                overlay.style.display = 'none';
                overlay.style.opacity = '';
            }
            if (cuisineDropdown && cuisineDropdown.classList.contains('active')) {
                closeCuisineDropdown();
            }
        }
    }
});

function closeRecipeDropdown() {
    const dropdown = document.getElementById('recipe-dropdown');
    const overlay = document.getElementById('recipe-dropdown-overlay');
    
    if (!dropdown || !overlay) return;
    
    // Fade out
    if (dropdown.classList.contains('active')) {
        dropdown.style.opacity = '0';
        overlay.style.opacity = '0';
        
        // Wait for fade to complete, then hide
        setTimeout(() => {
            dropdown.style.display = 'none';
            overlay.style.display = 'none';
            dropdown.classList.remove('active');
            overlay.classList.remove('active');
            // Reset transitions
            dropdown.style.opacity = '';
            overlay.style.opacity = '';
            dropdown.style.transition = '';
            overlay.style.transition = '';
        }, 200);
    }
}

function closeCuisineDropdown() {
    const dropdown = document.getElementById('cuisine-dropdown');
    const overlay = document.getElementById('recipe-dropdown-overlay');
    
    if (!dropdown || !overlay) return;
    
    // Fade out
    if (dropdown.classList.contains('active')) {
        dropdown.style.opacity = '0';
        overlay.style.opacity = '0';
        
        // Wait for fade to complete, then hide
        setTimeout(() => {
            dropdown.style.display = 'none';
            overlay.style.display = 'none';
            dropdown.classList.remove('active');
            overlay.classList.remove('active');
            // Reset transitions
            dropdown.style.opacity = '';
            overlay.style.opacity = '';
            dropdown.style.transition = '';
            overlay.style.transition = '';
        }, 200);
    }
}

async function loadRecipesForDropdown() {
    const container = document.getElementById('recipe-list-items');
    if (!container) return;
    
    container.innerHTML = '';
    
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        const snapshot = await db.collection('recipes')
            .where('userId', '==', user.uid)
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">No recipes yet</div>';
            return;
        }
        
        // Sort recipes by name in JavaScript
        const recipeDocs = snapshot.docs.sort((a, b) => {
            const nameA = (a.data().title || 'Untitled').toLowerCase();
            const nameB = (b.data().title || 'Untitled').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        // Show selected recipes at top if any
        if (selectedRecipes.length > 0) {
            const selectedSection = document.createElement('div');
            selectedSection.style.borderBottom = '1px solid #e0e0e0';
            selectedSection.style.paddingBottom = '8px';
            selectedSection.style.marginBottom = '8px';
            selectedSection.innerHTML = `<div class="recipe-dropdown-section-title">${selectedRecipes.length} selected</div>`;
            
            selectedRecipes.forEach(recipeId => {
                const recipeDoc = recipeDocs.find(d => d.id === recipeId);
                if (recipeDoc) {
                    const recipe = recipeDoc.data();
                    const item = createRecipeDropdownItem(recipeDoc.id, recipe.title || 'Untitled', true);
                    selectedSection.appendChild(item);
                }
            });
            
            container.appendChild(selectedSection);
            
            const moreSection = document.createElement('div');
            moreSection.innerHTML = '<div class="recipe-dropdown-section-title">Select more</div>';
            container.appendChild(moreSection);
        }
        
        // Show unselected recipes
        recipeDocs.forEach(doc => {
            if (!selectedRecipes.includes(doc.id)) {
                const recipe = doc.data();
                const item = createRecipeDropdownItem(doc.id, recipe.title || 'Untitled', false);
                container.appendChild(item);
            }
        });
        
        // Add search functionality
        const searchInput = document.querySelector('#recipe-dropdown .recipe-dropdown-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const items = container.querySelectorAll('.recipe-dropdown-item');
                items.forEach(item => {
                    const recipeName = item.querySelector('.recipe-dropdown-item-name').textContent.toLowerCase();
                    if (recipeName.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            };
        }
        
    } catch (error) {
        console.error('Error loading recipes:', error);
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: #d32f2f;">Error loading recipes</div>';
    }
}

function createRecipeDropdownItem(recipeId, recipeName, isSelected) {
    const item = document.createElement('div');
    item.classList.add('recipe-dropdown-item');
    item.dataset.recipeId = recipeId;
    
    if (isSelected) {
        item.innerHTML = `
            <span style="font-size: 20px; opacity: 0.6; margin-right: 8px;">â‹®â‹®</span>
            <img src="Images/fork-knife-logo.png" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${escapeHtml(recipeName)}</span>
            <div class="recipe-dropdown-item-add" style="border-color: #d32f2f; color: #d32f2f;">Ã¢Ë†â€™</div>
        `;
    } else {
        item.innerHTML = `
            <img src="Images/fork-knife-logo.png" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${escapeHtml(recipeName)}</span>
            <div class="recipe-dropdown-item-add">+</div>
        `;
    }
    
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSelected) {
            // Remove from selection
            selectedRecipes = selectedRecipes.filter(id => id !== recipeId);
        } else {
            // Add to selection
            selectedRecipes.push(recipeId);
        }
        updateRecipeRelationDisplay();
        loadRecipesForDropdown(); // Refresh the list
        // Don't close dropdown - allow multiple selections
    });
    
    return item;
}

function updateRecipeRelationDisplay() {
    const textEl = document.getElementById('recipes-relation-text');
    const container = document.getElementById('selected-recipes-container');
    
    if (selectedRecipes.length === 0) {
        textEl.textContent = 'Add Recipes';
        container.style.display = 'none';
    } else {
        textEl.textContent = `${selectedRecipes.length} Recipes`;
        container.style.display = 'block';
    }
}

// ================================
// RECIPE INGREDIENT RELATIONS
// ================================
let selectedIngredientsForRecipe = [];

// Ingredient dropdown for recipes
document.addEventListener('click', async (e) => {
    const addIngredientsBtn = e.target.closest('#add-ingredients-relation');
    
    if (addIngredientsBtn) {
        const dropdown = document.getElementById('ingredient-dropdown-for-recipe');
        const overlay = document.getElementById('recipe-dropdown-overlay');
        
        // Ensure dropdown starts completely hidden
        dropdown.style.display = 'none';
        overlay.style.display = 'none';
        dropdown.style.opacity = '0';
        overlay.style.opacity = '0';
        
        // Position dropdown near the button
        const rect = addIngredientsBtn.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = '600px';
        
        // Load ingredients first (this clears and rebuilds content)
        await loadIngredientsForRecipeDropdown();
        
        // Show overlay first (still hidden visually)
        overlay.style.display = 'block';
        overlay.style.transition = 'opacity 0.2s ease';
        
        // Show dropdown (still hidden visually)
        dropdown.style.display = 'block';
        dropdown.style.transition = 'opacity 0.2s ease';
        
        // Add active classes
        dropdown.classList.add('active');
        overlay.classList.add('active');
        
        // Force reflow to ensure display is set
        void dropdown.offsetHeight;
        void overlay.offsetHeight;
        
        // Fade in
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            dropdown.style.opacity = '1';
        });
    }
});

async function loadIngredientsForRecipeDropdown() {
    const container = document.getElementById('ingredient-list-items-for-recipe');
    if (!container) return;
    
    // Check if there's existing content to fade out
    const hasExistingContent = container.children.length > 0;
    const isCurrentlyVisible = container.style.opacity !== '0' && window.getComputedStyle(container).opacity !== '0';
    
    if (hasExistingContent && isCurrentlyVisible) {
        // Store current height to prevent layout shift
        const currentHeight = container.offsetHeight;
        container.style.minHeight = `${currentHeight}px`;
        
        // Fade out
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.2s ease';
        
        // Wait for fade out to complete
        await new Promise(resolve => setTimeout(resolve, 200));
    } else {
        // No existing content or already hidden, ensure it's hidden
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.2s ease';
    }
    
    container.innerHTML = '';
    
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        const snapshot = await db.collection('ingredients')
            .where('userId', '==', user.uid)
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = '<div style="padding: 16px; text-align: center; color: #999;">No ingredients yet</div>';
            container.style.minHeight = '';
            container.style.opacity = '';
            container.style.transition = '';
            return;
        }
        
        // Sort ingredients by name
        const ingredientDocs = snapshot.docs.sort((a, b) => {
            const nameA = (a.data().name || '').toLowerCase();
            const nameB = (b.data().name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        // Show selected ingredients at top if any
        if (selectedIngredientsForRecipe.length > 0) {
            const selectedSection = document.createElement('div');
            selectedSection.style.borderBottom = '1px solid #e0e0e0';
            selectedSection.style.paddingBottom = '8px';
            selectedSection.style.marginBottom = '8px';
            selectedSection.innerHTML = `<div class="recipe-dropdown-section-title">${selectedIngredientsForRecipe.length} selected</div>`;
            
            selectedIngredientsForRecipe.forEach(ingredientId => {
                const ingredientDoc = ingredientDocs.find(d => d.id === ingredientId);
                if (ingredientDoc) {
                    const ingredient = ingredientDoc.data();
                    const item = createIngredientDropdownItem(ingredientDoc.id, ingredient.name || 'Untitled', true, ingredient.toBuy || false);
                    selectedSection.appendChild(item);
                }
            });
            
            container.appendChild(selectedSection);
            
            const moreSection = document.createElement('div');
            moreSection.innerHTML = '<div class="recipe-dropdown-section-title">Select more</div>';
            container.appendChild(moreSection);
        }
        
        // Show unselected ingredients
        ingredientDocs.forEach(doc => {
            if (!selectedIngredientsForRecipe.includes(doc.id)) {
                const ingredient = doc.data();
                const item = createIngredientDropdownItem(doc.id, ingredient.name || 'Untitled', false, false);
                container.appendChild(item);
            }
        });
        
        // Add search functionality
        const searchInput = document.querySelector('#ingredient-dropdown-for-recipe .recipe-dropdown-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const items = container.querySelectorAll('.recipe-dropdown-item');
                items.forEach(item => {
                    const ingredientName = item.querySelector('.recipe-dropdown-item-name').textContent.toLowerCase();
                    if (ingredientName.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            };
        }
        
        // Remove min-height after content is loaded
        container.style.minHeight = '';
        
        // Force reflow
        void container.offsetHeight;
        
        // Fade back in
        requestAnimationFrame(() => {
            container.style.opacity = '';
        });
        
    } catch (error) {
        console.error('Error loading ingredients:', error);
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: #d32f2f;">Error loading ingredients</div>';
        container.style.minHeight = '';
        container.style.opacity = '';
        container.style.transition = '';
    }
}

function createIngredientDropdownItem(ingredientId, ingredientName, isSelected, toBuy = false) {
    const item = document.createElement('div');
    item.classList.add('recipe-dropdown-item');
    item.dataset.ingredientId = ingredientId;
    
    // Use a different icon for ingredients - check if there's an ingredient icon, otherwise use a generic one
    const ingredientIcon = 'Images/fork-knife-logo.png'; // You can change this to a specific ingredient icon if you have one
    
    if (isSelected) {
        item.innerHTML = `
            <span style="font-size: 20px; opacity: 0.6; margin-right: 8px;">â‹®â‹®</span>
            <img src="${safeImageSrc(ingredientIcon, 'Images/apple.png')}" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${escapeHtml(ingredientName)}</span>
            <button class="ingredient-buy-list-btn" style="margin-right: 8px; padding: 4px 12px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: ${toBuy ? '#4285f4' : '#f0f0f0'}; color: ${toBuy ? '#fff' : '#333'}; cursor: pointer; white-space: nowrap;">${toBuy ? 'Remove from buy list' : 'Add to buy list'}</button>
            <div class="recipe-dropdown-item-add" style="border-color: #d32f2f; color: #d32f2f;">Ã¢Ë†â€™</div>
        `;
    } else {
        item.innerHTML = `
            <img src="${safeImageSrc(ingredientIcon, 'Images/apple.png')}" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${escapeHtml(ingredientName)}</span>
            <div class="recipe-dropdown-item-add">+</div>
        `;
    }
    
    // Handle buy list button click (only for selected items)
    if (isSelected) {
        const buyListBtn = item.querySelector('.ingredient-buy-list-btn');
        if (buyListBtn) {
            // Store the current state in a data attribute so we can track it across clicks
            buyListBtn.dataset.toBuy = toBuy ? 'true' : 'false';
            
            buyListBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Get current state from data attribute
                const currentToBuy = buyListBtn.dataset.toBuy === 'true';
                const newToBuyValue = !currentToBuy;
                
                try {
                    await db.collection('ingredients').doc(ingredientId).update({
                        toBuy: newToBuyValue,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Update the data attribute with the new state
                    buyListBtn.dataset.toBuy = newToBuyValue ? 'true' : 'false';
                    
                    // Update the button state locally without refreshing the entire section
                    buyListBtn.textContent = newToBuyValue ? 'Remove from buy list' : 'Add to buy list';
                    buyListBtn.style.background = newToBuyValue ? '#4285f4' : '#f0f0f0';
                    buyListBtn.style.color = newToBuyValue ? '#fff' : '#333';
                } catch (error) {
                    console.error('Error updating toBuy:', error);
                }
            });
        }
    }
    
    item.addEventListener('click', (e) => {
        // Don't trigger selection/deselection if clicking the buy list button
        if (e.target.classList.contains('ingredient-buy-list-btn')) {
            return;
        }
        e.stopPropagation();
        if (isSelected) {
            // Remove from selection
            selectedIngredientsForRecipe = selectedIngredientsForRecipe.filter(id => id !== ingredientId);
        } else {
            // Add to selection
            selectedIngredientsForRecipe.push(ingredientId);
        }
        updateIngredientRelationDisplay();
        loadIngredientsForRecipeDropdown(); // Refresh the list
        // Don't close dropdown - allow multiple selections
    });
    
    return item;
}

function updateIngredientRelationDisplay() {
    const textEl = document.getElementById('ingredients-relation-text');
    const container = document.getElementById('selected-ingredients-container');
    
    if (selectedIngredientsForRecipe.length === 0) {
        textEl.textContent = 'Add Ingredients';
        container.style.display = 'none';
    } else {
        textEl.textContent = `${selectedIngredientsForRecipe.length} Ingredients`;
        container.style.display = 'none'; // Don't display selected ingredients in panel
    }
}

// Refresh all ingredient views across the website
async function refreshAllIngredientViews() {
    // Check which view is currently active
    const shoppingView = document.getElementById('shopping-header');
    const allView = document.getElementById('all-ingredients-view');
    
    const isShoppingViewActive = shoppingView && !shoppingView.classList.contains('hidden-view');
    const isAllViewActive = allView && !allView.classList.contains('hidden-view');
    
    // Refresh shopping list if it's currently visible
    if (isShoppingViewActive) {
        // Get current sort settings
        const shoppingSortDropdown = document.getElementById('shopping-sort-dropdown');
        let currentSort = 'name';
        let currentSortOrder = 'asc';
        
        if (shoppingSortDropdown) {
            const activeItem = shoppingSortDropdown.querySelector('.sort-dropdown-item.active');
            if (activeItem) {
                currentSort = activeItem.dataset.sort || 'name';
            }
            
            const sortOrderDropdown = document.getElementById('sort-order-dropdown');
            if (sortOrderDropdown) {
                const activeOrder = sortOrderDropdown.querySelector('.sort-order-option.active');
                if (activeOrder) {
                    currentSortOrder = activeOrder.dataset.order || 'asc';
                }
            }
        }
        
        await loadShoppingIngredientsWithFade(currentSort, currentSortOrder);
    }
    
    // Refresh ingredient groups if they're currently visible
    if (isAllViewActive) {
        await loadIngredientGroups();
    }
}

function closeIngredientDropdownForRecipe() {
    const dropdown = document.getElementById('ingredient-dropdown-for-recipe');
    const overlay = document.getElementById('recipe-dropdown-overlay');
    
    if (!dropdown || !overlay) return;
    
    // Fade out
    if (dropdown.classList.contains('active')) {
        dropdown.style.opacity = '0';
        overlay.style.opacity = '0';
        
        // Wait for fade to complete, then hide
        setTimeout(() => {
            dropdown.style.display = 'none';
            overlay.style.display = 'none';
            dropdown.classList.remove('active');
            overlay.classList.remove('active');
            // Reset transitions
            dropdown.style.opacity = '';
            overlay.style.opacity = '';
            dropdown.style.transition = '';
            overlay.style.transition = '';
        }, 200);
    }
}

// ================================
// INGREDIENT IMAGE REPOSITIONING
// ================================
let ingredientSavedTop = 0;

function enterIngredientRepositionMode() {
    const preview = document.getElementById('ingredient-image-preview');
    const imageSection = document.getElementById('ingredient-image-section');
    const repositionBar = document.getElementById('ingredient-image-reposition-bar');
    const imageMenu = document.getElementById('ingredient-image-menu');
    
    if (!preview || !preview.classList.contains('has-image')) return;
    
    // Set position relative on container
    imageSection.style.position = 'relative';
    
    // Add repositioning class - THIS IS CRITICAL
    imageSection.classList.add('is-repositioning');
    
    // Show reposition bar
    repositionBar.classList.remove('hidden');
    
    // Hide menu
    if (imageMenu) imageMenu.classList.add('hidden');
    
    // Set up image positioning
    preview.style.position = 'absolute';
    preview.style.left = '50%';
    preview.style.transform = 'translateX(-50%)';
    preview.style.cursor = 'grab';
    preview.style.userSelect = 'none';
    
    // Get saved offset or default to 0
    const panel = document.getElementById('ingredient-side-panel');
    ingredientSavedTop = parseFloat(preview.dataset.offset || 0);
    preview.style.top = ingredientSavedTop + 'px';
}

// Initialize drag functionality whenever an image is loaded
function initIngredientImageDrag() {
    const preview = document.getElementById('ingredient-image-preview');
    const imageSection = document.getElementById('ingredient-image-section');
    
    if (!preview || !imageSection) return;
    
    let dragging = false;
    let startY = 0;
    let originalTop = 0;
    
    function clamp(y) {
        const imgH = preview.offsetHeight;
        const sectionH = imageSection.offsetHeight;
        const min = sectionH - imgH;
        
        if (y > 0) return 0;
        if (y < min) return min;
        return y;
    }
    
    preview.addEventListener('mousedown', (e) => {
        // Only drag if we have an image AND are in reposition mode
        if (!preview.classList.contains('has-image')) return;
        if (!imageSection.classList.contains('is-repositioning')) return;
        if (e.target.closest('.ingredient-image-menu')) return;
        if (e.target.closest('.ingredient-image-reposition-bar')) return;
        
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        startY = e.clientY;
        originalTop = parseFloat(preview.style.top || preview.dataset.offset || 0);
        preview.style.cursor = 'grabbing';
        
        function move(ev) {
            if (!dragging) return;
            ev.preventDefault();
            const dy = ev.clientY - startY;
            let newTop = clamp(originalTop + dy);
            preview.style.top = newTop + 'px';
        }
        
        function stop() {
            if (dragging) {
                dragging = false;
                preview.style.cursor = 'grab';
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', stop);
            }
        }
        
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', stop);
    });
}

function exitIngredientRepositionMode(apply) {
    const preview = document.getElementById('ingredient-image-preview');
    const imageSection = document.getElementById('ingredient-image-section');
    const repositionBar = document.getElementById('ingredient-image-reposition-bar');
    const imageMenu = document.getElementById('ingredient-image-menu');
    
    imageSection.classList.remove('is-repositioning');
    repositionBar.classList.add('hidden');
    if (imageMenu) imageMenu.classList.remove('hidden');
    
    const panel = document.getElementById('ingredient-side-panel');
    const editingId = panel.dataset.editingId;
    
    if (apply) {
        const newOffset = parseFloat(preview.style.top);
        preview.dataset.offset = newOffset;
        
        // Save to Firebase
        if (editingId) {
            db.collection('ingredients').doc(editingId).update({
                imageOffsetY: newOffset,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(err => {
                console.error('Error saving image position:', err);
            });
        } else {
            // For new ingredients, store temporarily
            panel.dataset.pendingImageOffsetY = newOffset;
        }
    } else {
        // Revert to saved position
        preview.style.top = ingredientSavedTop + 'px';
    }
    
    // Reset cursor
    if (preview) {
        preview.style.cursor = '';
    }
}

// Setup save and cancel buttons
function setupIngredientRepositionButtons() {
    const saveBtn = document.getElementById('ingredient-image-save-position');
    const cancelBtn = document.getElementById('ingredient-image-cancel-position');
    
    if (saveBtn) {
        saveBtn.onclick = async (e) => {
            e.stopPropagation();
            exitIngredientRepositionMode(true);
        };
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = (e) => {
            e.stopPropagation();
            exitIngredientRepositionMode(false);
        };
    }
}


// ================================
// SAVE INGREDIENT TO FIREBASE
// ================================
async function saveIngredient() {
    try {
        const user = auth.currentUser;
        if (!user) return null;

        const panel = document.getElementById('ingredient-side-panel');
        const editingId = panel.dataset.editingId || null;

        const name = document.getElementById('ingredient-name').value.trim();
        const category = document.getElementById('ingredient-category').value.trim();
        const quantity = document.getElementById('ingredient-quantity').value.trim();
        const notes = document.getElementById('ingredient-notes').value.trim();
        const toBuy = document.getElementById('ingredient-to-buy-value').checked;

        if (!name) return null;

        const ingredientData = {
            name,
            category: category || 'Other',
            quantity: quantity || null,
            notes: notes || null,
            toBuy,
            recipes: selectedRecipes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Read image directly from preview (like recipes do)
        const preview = document.getElementById('ingredient-image-preview');
        if (preview && preview.classList.contains('has-image') && preview.src) {
            ingredientData.imageUrl = preview.src;
            ingredientData.imageOffsetY = parseFloat(preview.dataset.offset || 0);
        }

        // Ã°Å¸Å¸Â¢ EDIT EXISTING INGREDIENT
        if (editingId) {
            await db.collection('ingredients').doc(editingId).update(ingredientData);

            // cleanup edit state
            delete panel.dataset.editingId;
            delete panel.dataset.pendingImageUrl;
            delete panel.dataset.pendingImageOffsetY;
            selectedRecipes = [];

            return editingId;
        }


        // ðŸ”µ CREATE NEW INGREDIENT
        // Get workspace filter
        const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
        
        const finalIngredientData = {
            ...ingredientData,
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add teamspaceId if in a teamspace
        if (workspaceFilter.type === 'teamspace') {
            finalIngredientData.teamspaceId = workspaceFilter.teamspaceId;
        } else {
            finalIngredientData.teamspaceId = null;
        }
        
        // Clean up temporary data
        delete panel.dataset.pendingImageUrl;
        delete panel.dataset.pendingImageOffsetY;
        
        const docRef = await db.collection('ingredients').add(finalIngredientData);

        selectedRecipes = [];
        return docRef.id;

    } catch (error) {
        console.error('Error saving ingredient:', error);
        return null;
    }
}


// Add ingredient to table without reloading everything
function addIngredientToTable(ingredient) {
    const category = ingredient.category || 'Other';
    const tbody = document.getElementById(`tbody-${category}`);
    
    if (!tbody) {
        console.error('Table not found for category:', category);
        return;
    }
    
    // Find the "+ New Ingredient" row
    const addRow = tbody.querySelector('.add-ingredient-row');
    
    // Create new ingredient row
    const newRow = createIngredientRow(ingredient);
    
    // Set initial state for fade-in animation
    newRow.style.opacity = '0';
    newRow.style.transform = 'translateX(-10px)';
    newRow.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    
    // Insert before the "+ New Ingredient" row
    if (addRow) {
        tbody.insertBefore(newRow, addRow);
    } else {
        tbody.appendChild(newRow);
    }
    
    // Trigger fade-in animation
    setTimeout(() => {
        newRow.style.opacity = '1';
        newRow.style.transform = 'translateX(0)';
    }, 10);
}

// Close ingredient menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.ingredient-menu').forEach(menu => {
        menu.classList.add('hidden');
    });
});

function openIngredientForEdit(ingredientId) {
    // Open the side panel
    const panel = document.getElementById("ingredient-side-panel");
    panel.classList.add("open");

    // Fetch ingredient data
    db.collection("ingredients")
        .doc(ingredientId)
        .get()
        .then(doc => {
            if (!doc.exists) return;

            const data = doc.data();

            // Load image if it exists
            const preview = document.getElementById('ingredient-image-preview');
            const imageSection = document.getElementById('ingredient-image-section');
            const imageMenu = document.getElementById('ingredient-image-menu');
            if (data.imageUrl && preview && imageSection) {
                preview.src = data.imageUrl;
                preview.classList.add('has-image');
                imageSection.classList.add('has-image');
                if (imageMenu) {
                    imageMenu.classList.remove('hidden');
                }
                
                // Set up image positioning with saved offset
                preview.style.position = 'absolute';
                preview.style.left = '50%';
                preview.style.transform = 'translateX(-50%)';
                preview.style.cursor = 'grab';
                preview.style.userSelect = 'none';
                const offsetY = data.imageOffsetY || 0;
                preview.dataset.offset = offsetY;
                preview.style.top = offsetY + 'px';
            } else if (preview && imageSection) {
                preview.src = '';
                preview.classList.remove('has-image');
                imageSection.classList.remove('has-image');
                if (imageMenu) {
                    imageMenu.classList.add('hidden');
                }
                // Reset positioning
                preview.style.position = '';
                preview.style.left = '';
                preview.style.transform = '';
                preview.style.top = '';
                preview.dataset.offset = '';
            }

            // Populate fields
            document.getElementById("ingredient-name").value = data.name || "";
            document.getElementById("ingredient-category").value = data.category || "";
            document.getElementById("ingredient-quantity").value = data.quantity || "";
            document.getElementById("ingredient-notes").value = data.notes || "";
            document.getElementById("ingredient-to-buy-value").checked = !!data.toBuy;

            // Store currently editing ID
            panel.dataset.editingId = ingredientId;
        });
}

document.addEventListener("click", (e) => {
    // EDIT ingredient
    if (e.target.classList.contains("edit-ingredient")) {
        const ingredientId = e.target.dataset.id;
        if (!ingredientId) return;

        // Close the menu
        const menu = e.target.closest(".ingredient-menu");
        if (menu) {
            menu.classList.add("hidden");
        }

        // Open the side panel for editing
        openIngredientForEdit(ingredientId);
    }

    // DELETE ingredient - handled in createIngredientRow, but keep this as fallback
    if (e.target.classList.contains("delete-ingredient")) {
        const ingredientId = e.target.dataset.id;
        if (!ingredientId) return;

        // Close the menu
        const menu = e.target.closest(".ingredient-menu");
        if (menu) {
            menu.classList.add("hidden");
        }

        // Find the row
        const row = e.target.closest('tr');
        if (!row) return;

        deleteIngredient(ingredientId, row);
    }
});

// Delete ingredient with fade animation
async function deleteIngredient(ingredientId, row) {
    const confirmed = await macConfirm('Delete this ingredient?');
    if (!confirmed) return;
    
    try {
        // Fade out animation
        row.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        row.style.opacity = '0';
        row.style.transform = 'translateX(-10px)';
        
        setTimeout(async () => {
            try {
                // Find all recipes that reference this ingredient
                const recipesSnapshot = await recipesInCurrentWorkspace()
                    .where('relatedIngredients', 'array-contains', ingredientId)
                    .get();
                
                // Remove the ingredient ID from all recipes that reference it
                const batch = db.batch();
                recipesSnapshot.forEach(recipeDoc => {
                    const recipeData = recipeDoc.data();
                    const relatedIngredients = recipeData.relatedIngredients || [];
                    const updatedIngredients = relatedIngredients.filter(id => id !== ingredientId);
                    
                    batch.update(recipeDoc.ref, {
                        relatedIngredients: updatedIngredients,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                // Commit recipe updates
                if (!recipesSnapshot.empty) {
                    await batch.commit();
                }
                
                // Delete the ingredient
                await db.collection('ingredients').doc(ingredientId).delete();
                row.remove();
            } catch (error) {
                console.error('Error deleting ingredient:', error);
                alert('Failed to delete ingredient');
            }
        }, 200);
    } catch (error) {
        console.error('Error deleting ingredient:', error);
        alert('Failed to delete ingredient');
    }
}


// ================================
// INGREDIENT FILE UPLOAD
// ================================
function triggerIngredientUpload() {
    console.log('triggerIngredientUpload called');
    
    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'text/plain,image/png,image/jpeg,image/jpg,image/heic,application/pdf'; // Support text, images, and PDFs
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (e) => {
        console.log('File selected:', e.target.files[0]);
        const file = e.target.files[0];
        if (!file) return;
        
        await processIngredientFile(file);
        document.body.removeChild(fileInput);
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    console.log('File input clicked');
}

async function processIngredientFile(file) {
    // Show loading overlay
    showUploadLoadingOverlay();
    
    try {
        let extractedText = '';
        
        // Handle different file types
        if (file.type === 'text/plain') {
            extractedText = await readTextFile(file);
        } else if (file.type === 'application/pdf') {
            extractedText = await extractTextFromPDF(file);
        } else if (file.type.startsWith('image/')) {
            extractedText = await extractTextFromImage(file);
        }
        
        if (!extractedText) {
            hideUploadLoadingOverlay();
            alert('Could not extract text from file. Please try a different file.');
            return;
        }
        
        // Use AI to parse ingredients
        const ingredients = await parseIngredientsWithAI(extractedText);
        
        if (!ingredients || ingredients.length === 0) {
            hideUploadLoadingOverlay();
            alert('No ingredients found in the file. Please try a different file.');
            return;
        }
        
        // Save ingredients to Firebase
        await saveExtractedIngredients(ingredients);
        
        // Hide loading and show success
        hideUploadLoadingOverlay();
        showUploadSuccessMessage(`Successfully added ${ingredients.length} ingredient${ingredients.length > 1 ? 's' : ''}!`);
        
        // Refresh the ingredient view
        await refreshAllIngredientViews();
        
    } catch (error) {
        console.error('Error processing file:', error);
        hideUploadLoadingOverlay();
        alert('Error processing file. Please try again.');
    }
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function extractTextFromPDF(file) {
    console.log('Extracting text from PDF...');
    
    try {
        // Read file as array buffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        console.log(`PDF loaded: ${pdf.numPages} pages`);
        
        let fullText = '';
        
        // Extract text from each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Group text items by vertical position to detect lines
            const textByLine = {};
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]); // Y position
                if (!textByLine[y]) {
                    textByLine[y] = [];
                }
                textByLine[y].push(item.str);
            });
            
            // Sort by Y position (top to bottom) and join
            const sortedY = Object.keys(textByLine).sort((a, b) => b - a); // Descending (top to bottom)
            for (const y of sortedY) {
                const lineText = textByLine[y].join(' ').trim();
                if (lineText) {
                    fullText += lineText + '\n';
                }
            }
        }
        
        console.log('PDF text extraction completed');
        console.log('Extracted text preview:', fullText.substring(0, 200));
        return fullText;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        alert('Error reading PDF. Please try a different file.');
        return null;
    }
}

async function extractTextFromImage(file) {
    console.log('Extracting text from image using OCR...');
    
    try {
        let imageToProcess = file;
        
        // Convert HEIC to JPEG if needed
        if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
            console.log('Converting HEIC to JPEG...');
            try {
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.9
                });
                imageToProcess = new File([convertedBlob], file.name.replace(/\.heic$/i, '.jpg'), {
                    type: 'image/jpeg'
                });
                console.log('HEIC conversion completed');
            } catch (heicError) {
                console.error('Error converting HEIC:', heicError);
                alert('Error converting HEIC image. Please try a different format (PNG or JPEG).');
                return null;
            }
        }
        
        // Use Tesseract.js for OCR
        const result = await Tesseract.recognize(
            imageToProcess,
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            }
        );
        
        console.log('OCR completed successfully');
        return result.data.text;
    } catch (error) {
        console.error('Error extracting text from image:', error);
        alert('Error reading image. Please try a different file.');
        return null;
    }
}

async function parseIngredientsWithAI(text) {
    console.log('Parsing ingredients from text...');
    console.log('Raw text:', text.substring(0, 200) + '...');
    
    // First, try to intelligently split the text
    // PDFs often don't have proper line breaks, so we need to look for patterns
    let lines = [];
    
    // Split on newlines first
    let rawLines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // If we only got 1-2 lines but the text is long, it's probably a PDF with no line breaks
    // Try to split on common delimiters
    if (rawLines.length < 3 && text.length > 100) {
        console.log('Detected single-line text, attempting smart splitting...');
        // Try splitting on " - " which is common in lists
        const dashSplit = text.split(/\s-\s+/).map(s => s.trim()).filter(s => s.length > 0);
        if (dashSplit.length > 2) {
            rawLines = dashSplit;
            console.log(`Split into ${dashSplit.length} parts using dashes`);
        }
    }
    
    // Filter out headers and junk
    lines = rawLines.filter(line => {
        const lower = line.toLowerCase().trim();
        // Skip common headers - be more aggressive, allow spaces/words
        if (lower.match(/^(shopping|grocery|to.?do).*(list|items?)$/i)) {
            console.log(`Filtered out header: "${line}"`);
            return false;
        }
        if (lower.match(/^(shopping|grocery|list|ingredient|recipe|item|needed|buy|todo|to.?do)s?:?$/i)) {
            console.log(`Filtered out header: "${line}"`);
            return false;
        }
        // Skip lines that are just separators
        if (lower.match(/^[=#\-_*]+$/)) return false;
        // Skip very short lines (likely not ingredients)
        if (line.length < 2) return false;
        return true;
    });
    
    console.log(`Processing ${lines.length} lines...`);
    
    const ingredients = [];
    
    for (const line of lines) {
        // Remove leading list markers: bullets (â€¢), dashes (-), numbers (1., 2.), asterisks (*)
        let cleanLine = line.replace(/^[\sâ€¢\-*\d.)]+\s*/, '').trim();
        if (!cleanLine) continue;
        
        // Try to parse quantity and name
        const ingredient = parseIngredientLine(cleanLine);
        if (ingredient && ingredient.name) {
            // Additional validation - skip if name is too generic or looks like a header
            const nameLower = ingredient.name.toLowerCase();
            if (nameLower.match(/^(shopping|grocery|list|ingredient|recipe|item|needed|buy|todo|to.?do)s?$/i)) {
                console.log(`Skipped header-like ingredient: "${ingredient.name}"`);
                continue;
            }
            
            // Skip if the name is suspiciously long (probably captured multiple items)
            if (ingredient.name.length > 100) {
                console.log(`Skipping suspiciously long ingredient: ${ingredient.name.substring(0, 50)}...`);
                continue;
            }
            
            ingredients.push(ingredient);
            console.log(`âœ“ Parsed: "${ingredient.name}" qty: "${ingredient.quantity || 'none'}" notes: "${ingredient.notes || 'none'}"`);
        }
    }
    
    console.log(`Final result: ${ingredients.length} ingredients`);
    return ingredients;
}

function parseIngredientLine(line) {
    // Expected formats:
    // "Strawberries"
    // "Vegetables (1)"
    // "Steak (2) organic"
    // "Soda (1) fanta"
    // Also support traditional: "2 cups flour"
    
    let name = '';
    let quantity = '';
    let notes = '';
    
    // First, extract everything in parentheses as potential quantity
    const parenMatch = line.match(/^([^(]+)\(([^)]+)\)(.*)$/);
    
    if (parenMatch) {
        // Format: "ingredient (quantity) notes"
        name = parenMatch[1].trim();
        quantity = parenMatch[2].trim();
        notes = parenMatch[3].trim() || null;
    } else {
        // No parentheses - check if it starts with a number (traditional format)
        // "2 cups flour"
        const quantityMatch = line.match(/^([\d./]+\s*(?:cup|cups|lb|lbs|pound|pounds|oz|ounce|ounces|tsp|teaspoon|teaspoons|tbsp|tablespoon|tablespoons|g|kg|ml|l|can|cans|clove|cloves|medium|large|small)?s?)\s+(.+)$/i);
        
        if (quantityMatch) {
            quantity = quantityMatch[1].trim();
            name = quantityMatch[2].trim();
        } else {
            // No quantity at all, entire line is the name
            name = line.trim();
        }
    }
    
    // Clean up the name
    name = name.replace(/\s+/g, ' ').trim();
    
    // Skip if name is too short or looks invalid
    if (name.length < 2) return null;
    
    return {
        name: name,
        quantity: quantity || null,
        notes: notes || null
    };
}

async function saveExtractedIngredients(ingredients) {
    const user = auth.currentUser;
    if (!user) return;
    
    const batch = db.batch();
    
    for (const ingredient of ingredients) {
        // Auto-categorize based on ingredient name
        const category = categorizeIngredient(ingredient.name);
        
        const ingredientData = {
            name: ingredient.name,
            category: category,
            quantity: ingredient.quantity || null,
            notes: ingredient.notes || null,
            toBuy: true, // Default to adding to shopping list
            recipes: [],
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = db.collection('ingredients').doc();
        batch.set(docRef, ingredientData);
    }
    
    await batch.commit();
}

function categorizeIngredient(name) {
    const nameLower = name.toLowerCase();
    
    // Comprehensive keyword mappings for all possible categories
    const categoryKeywords = {
        'Fruits': [
            'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'strawberry', 'strawberries',
            'blueberry', 'blueberries', 'raspberry', 'raspberries', 'grape', 'grapes', 'lemon', 'lemons',
            'lime', 'limes', 'cherry', 'cherries', 'peach', 'peaches', 'pear', 'pears', 'plum', 'plums',
            'mango', 'mangos', 'pineapple', 'watermelon', 'melon', 'cantaloupe', 'kiwi', 'papaya',
            'avocado', 'avocados', 'coconut', 'berry', 'berries', 'fruit', 'grapefruit', 'tangerine',
            'nectarine', 'apricot', 'fig', 'date', 'dates', 'raisin', 'raisins', 'cranberry', 'cranberries'
        ],
        'Vegetables': [
            'carrot', 'carrots', 'broccoli', 'cauliflower', 'spinach', 'kale', 'lettuce', 'cabbage',
            'tomato', 'tomatoes', 'cucumber', 'cucumbers', 'bell pepper', 'onion', 'onions',
            'garlic', 'potato', 'potatoes', 'sweet potato', 'celery', 'zucchini', 'squash', 'pumpkin',
            'eggplant', 'mushroom', 'mushrooms', 'corn', 'peas', 'green beans', 'asparagus', 'artichoke',
            'beet', 'beets', 'radish', 'turnip', 'parsnip', 'leek', 'scallion', 'shallot', 'basil', 'cilantro',
            'parsley', 'arugula', 'bok choy', 'brussels sprouts', 'vegetable', 'veggie', 'jalapeno',
            'poblano', 'serrano', 'habanero', 'chili', 'green onion', 'spring onion'
        ],
        'Dairy': [
            'milk', 'cream', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'goat cheese',
            'yogurt', 'sour cream', 'cottage cheese', 'ricotta', 'cream cheese', 'whipped cream', 'half and half',
            'buttermilk', 'evaporated milk', 'condensed milk', 'dairy', 'swiss', 'provolone', 'brie',
            'blue cheese', 'gorgonzola', 'monterey jack', 'colby', 'american cheese', 'string cheese',
            'greek yogurt', 'heavy cream', 'light cream', 'clotted cream'
        ],
        'Meats': [  // Handles both "Meat" and "Meats"
            'chicken', 'beef', 'pork', 'turkey', 'lamb', 'veal', 'duck', 'steak', 'ground beef',
            'ground turkey', 'bacon', 'sausage', 'ham', 'salami', 'prosciutto', 'pepperoni',
            'chicken breast', 'chicken thigh', 'drumstick', 'wings', 'meat', 'poultry',
            'ribeye', 'sirloin', 'tenderloin', 'brisket', 'ribs', 'pork chop', 'chorizo',
            'bratwurst', 'hot dog', 'frankfurter', 'pastrami', 'corned beef', 'venison',
            'goat', 'rabbit', 'quail', 'pheasant', 'goose', 'canadian bacon'
        ],
        'Meat': [  // Alias for Meats
            'chicken', 'beef', 'pork', 'turkey', 'lamb', 'veal', 'duck', 'steak', 'ground beef',
            'ground turkey', 'bacon', 'sausage', 'ham', 'salami', 'prosciutto', 'pepperoni',
            'chicken breast', 'chicken thigh', 'drumstick', 'wings', 'meat', 'poultry',
            'ribeye', 'sirloin', 'tenderloin', 'brisket', 'ribs', 'pork chop', 'chorizo',
            'bratwurst', 'hot dog', 'frankfurter', 'pastrami', 'corned beef', 'venison',
            'goat', 'rabbit', 'quail', 'pheasant', 'goose', 'canadian bacon'
        ],
        'Seafood': [  // Separate category - only used if user creates it
            'fish', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'shrimp', 'prawns', 'crab',
            'lobster', 'scallops', 'mussels', 'clams', 'oysters', 'squid', 'octopus', 'seafood',
            'catfish', 'trout', 'bass', 'snapper', 'mackerel', 'sardines', 'anchovies',
            'swordfish', 'mahi mahi', 'grouper', 'flounder', 'sole', 'haddock', 'perch',
            'crayfish', 'calamari', 'caviar', 'roe', 'imitation crab', 'surimi'
        ],
        'Seasonings': [
            'salt', 'pepper', 'spice', 'spices', 'seasoning', 'cumin', 'paprika', 'oregano', 'thyme',
            'rosemary', 'sage', 'cinnamon', 'nutmeg', 'ginger', 'turmeric', 'curry', 'chili powder',
            'cayenne', 'garlic powder', 'onion powder', 'bay leaf', 'vanilla', 'extract', 'herbs',
            'dill', 'tarragon', 'marjoram', 'cardamom', 'cloves', 'allspice', 'anise', 'fennel',
            'coriander', 'mustard seed', 'celery seed', 'caraway', 'saffron', 'white pepper',
            'black pepper', 'red pepper flakes', 'italian seasoning', 'poultry seasoning',
            'cajun seasoning', 'taco seasoning', 'everything bagel seasoning', 'msg', 'bouillon'
        ],
        'Oils': [  // Separate category - only used if user creates it
            'oil', 'olive oil', 'vegetable oil', 'canola oil', 'coconut oil', 'sesame oil',
            'avocado oil', 'peanut oil', 'sunflower oil', 'grapeseed oil', 'walnut oil',
            'almond oil', 'flaxseed oil', 'safflower oil', 'corn oil', 'palm oil',
            'extra virgin olive oil', 'light olive oil', 'cooking spray', 'pam', 'butter spray'
        ],
        'Condiments': [
            'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'relish', 'pickle', 'pickles',
            'soy sauce', 'vinegar', 'hot sauce', 'bbq sauce', 'worcestershire', 'sriracha',
            'ranch', 'dressing', 'salsa', 'condiment', 'tartar sauce', 'cocktail sauce',
            'fish sauce', 'hoisin', 'oyster sauce', 'teriyaki', 'marinara', 'alfredo',
            'pesto', 'hummus', 'tahini', 'guacamole', 'chimichurri', 'aioli', 'remoulade',
            'balsamic', 'apple cider vinegar', 'rice vinegar', 'red wine vinegar', 'white vinegar',
            'dijon', 'yellow mustard', 'honey mustard', 'spicy mustard', 'tabasco', 'buffalo sauce'
        ],
        'Baking': [
            'sugar', 'brown sugar', 'powdered sugar', 'baking soda', 'baking powder', 'yeast',
            'cornstarch', 'cocoa', 'chocolate chips', 'honey', 'maple syrup', 'molasses', 'agave',
            'confectioners sugar', 'icing sugar', 'granulated sugar', 'cane sugar', 'turbinado',
            'demerara', 'coconut sugar', 'stevia', 'splenda', 'cake flour', 'bread flour',
            'all-purpose flour', 'whole wheat flour', 'almond flour', 'coconut flour',
            'gelatin', 'agar', 'pectin', 'cream of tartar', 'vanilla bean', 'chocolate bar',
            'cocoa powder', 'white chocolate', 'dark chocolate', 'semi-sweet', 'butterscotch',
            'caramel', 'sprinkles', 'food coloring', 'fondant', 'marzipan', 'flour'
        ],
        'Beverages': [
            'water', 'coffee', 'tea', 'juice', 'soda', 'pop', 'beer', 'wine', 'liquor', 'vodka',
            'whiskey', 'rum', 'gin', 'tequila', 'champagne', 'cider', 'lemonade', 'iced tea',
            'green tea', 'black tea', 'herbal tea', 'kombucha', 'sports drink', 'energy drink',
            'coconut water', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'beverage',
            'drink', 'drinks', 'espresso', 'cappuccino', 'latte', 'smoothie'
        ],
        'Drinks': [  // Alias for Beverages
            'water', 'coffee', 'tea', 'juice', 'soda', 'pop', 'beer', 'wine', 'liquor', 'vodka',
            'whiskey', 'rum', 'gin', 'tequila', 'champagne', 'cider', 'lemonade', 'iced tea',
            'green tea', 'black tea', 'herbal tea', 'kombucha', 'sports drink', 'energy drink',
            'coconut water', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'beverage',
            'drink', 'drinks', 'espresso', 'cappuccino', 'latte', 'smoothie'
        ],
        'Frozen': [
            'frozen', 'ice cream', 'sorbet', 'gelato', 'popsicle', 'frozen pizza', 'frozen vegetables',
            'frozen fruit', 'frozen dinner', 'tv dinner', 'frozen yogurt', 'ice', 'ice cubes',
            'frozen peas', 'frozen corn', 'frozen berries', 'frozen chicken', 'frozen shrimp'
        ],
        'Canned': [
            'canned', 'can', 'jar', 'jarred', 'canned beans', 'canned tomatoes', 'canned soup',
            'canned tuna', 'canned corn', 'canned peas', 'preserved', 'packaged', 'canned chicken',
            'canned vegetables', 'canned fruit', 'canned olives', 'pickled', 'jarred sauce'
        ],
        'Grains': [
            'grain', 'grains', 'wheat', 'barley', 'rye', 'millet', 'amaranth', 'buckwheat',
            'spelt', 'kamut', 'teff', 'sorghum', 'wild rice', 'brown rice', 'white rice',
            'jasmine rice', 'basmati rice', 'arborio rice', 'bread', 'pasta', 'rice', 'noodles', 
            'spaghetti', 'penne', 'rigatoni', 'linguine', 'fettuccine', 'flour', 'tortilla', 
            'tortillas', 'bagel', 'bagels', 'roll', 'rolls', 'baguette', 'pita', 'quinoa', 
            'couscous', 'oats', 'oatmeal', 'cereal', 'crackers', 'bun', 'buns', 'croissant', 
            'muffin', 'pancake', 'waffle', 'macaroni', 'lasagna', 'ravioli', 'angel hair', 
            'orzo', 'fusilli', 'farfalle', 'rotini', 'vermicelli', 'ramen', 'udon', 'soba', 
            'bulgur', 'farro', 'polenta', 'grits', 'cornmeal'
        ],
        'Carbs': [  // Separate category - only used if user creates it
            'bread', 'pasta', 'rice', 'noodles', 'spaghetti', 'penne', 'rigatoni', 'linguine', 'fettuccine',
            'flour', 'tortilla', 'tortillas', 'bagel', 'bagels', 'roll', 'rolls', 'baguette', 'pita',
            'quinoa', 'couscous', 'oats', 'oatmeal', 'cereal', 'crackers', 'chips', 'pretzels',
            'bun', 'buns', 'croissant', 'muffin', 'pancake', 'waffle', 'macaroni', 'lasagna', 'ravioli',
            'angel hair', 'orzo', 'fusilli', 'farfalle', 'rotini', 'vermicelli', 'ramen', 'udon',
            'soba', 'bulgur', 'farro', 'polenta', 'grits', 'cornmeal'
        ],
        'Seeds': [  // Separate category - only used if user creates it
            'seeds', 'sunflower seeds', 'pumpkin seeds', 'chia seeds', 'flax seeds', 'sesame seeds',
            'poppy seeds', 'hemp seeds', 'nuts', 'almonds', 'walnuts', 'pecans', 'cashews', 'peanuts',
            'pistachios', 'hazelnuts', 'macadamia', 'pine nuts', 'peanut butter', 'almond butter',
            'brazil nuts', 'chestnuts', 'tahini'
        ],
        'Nuts': [  // Separate category - only used if user creates it
            'nuts', 'almonds', 'walnuts', 'pecans', 'cashews', 'peanuts', 'pistachios', 
            'hazelnuts', 'macadamia', 'pine nuts', 'peanut butter', 'almond butter',
            'brazil nuts', 'chestnuts', 'tahini', 'nutella'
        ],
        'Legumes': [  // Separate category - only used if user creates it
            'beans', 'lentils', 'chickpeas', 'black beans', 'kidney beans', 'pinto beans',
            'navy beans', 'lima beans', 'cannellini', 'garbanzo', 'green lentils', 'red lentils',
            'split peas', 'black-eyed peas', 'edamame', 'soybeans', 'tofu', 'tempeh', 'legume'
        ],
        'Snacks': [  // Separate category - only used if user creates it
            'chips', 'popcorn', 'pretzels', 'crackers', 'cookies', 'candy', 'chocolate bar',
            'granola bar', 'protein bar', 'trail mix', 'jerky', 'snack', 'goldfish',
            'cheez-its', 'doritos', 'lays', 'pringles', 'oreos'
        ],
        'Fruit': [  // Singular alias for Fruits
            'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'strawberry', 'strawberries',
            'blueberry', 'blueberries', 'raspberry', 'raspberries', 'grape', 'grapes', 'lemon', 'lemons',
            'lime', 'limes', 'cherry', 'cherries', 'peach', 'peaches', 'pear', 'pears', 'plum', 'plums',
            'mango', 'mangos', 'pineapple', 'watermelon', 'melon', 'cantaloupe', 'kiwi', 'papaya',
            'avocado', 'avocados', 'coconut', 'berry', 'berries', 'fruit', 'grapefruit', 'tangerine',
            'nectarine', 'apricot', 'fig', 'date', 'dates', 'raisin', 'raisins', 'cranberry', 'cranberries'
        ],
        'Veggies': [  // Informal alias for Vegetables
            'carrot', 'carrots', 'broccoli', 'cauliflower', 'spinach', 'kale', 'lettuce', 'cabbage',
            'tomato', 'tomatoes', 'cucumber', 'cucumbers', 'bell pepper', 'onion', 'onions',
            'garlic', 'potato', 'potatoes', 'sweet potato', 'celery', 'zucchini', 'squash', 'pumpkin',
            'eggplant', 'mushroom', 'mushrooms', 'corn', 'peas', 'green beans', 'asparagus', 'artichoke',
            'beet', 'beets', 'radish', 'turnip', 'parsnip', 'leek', 'scallion', 'shallot', 'basil', 'cilantro',
            'parsley', 'arugula', 'bok choy', 'brussels sprouts', 'vegetable', 'veggie', 'jalapeno',
            'poblano', 'serrano', 'habanero', 'chili', 'green onion', 'spring onion'
        ],
        'Vegetable': [  // Singular alias for Vegetables
            'carrot', 'carrots', 'broccoli', 'cauliflower', 'spinach', 'kale', 'lettuce', 'cabbage',
            'tomato', 'tomatoes', 'cucumber', 'cucumbers', 'bell pepper', 'onion', 'onions',
            'garlic', 'potato', 'potatoes', 'sweet potato', 'celery', 'zucchini', 'squash', 'pumpkin',
            'eggplant', 'mushroom', 'mushrooms', 'corn', 'peas', 'green beans', 'asparagus', 'artichoke',
            'beet', 'beets', 'radish', 'turnip', 'parsnip', 'leek', 'scallion', 'shallot', 'basil', 'cilantro',
            'parsley', 'arugula', 'bok choy', 'brussels sprouts', 'vegetable', 'veggie', 'jalapeno',
            'poblano', 'serrano', 'habanero', 'chili', 'green onion', 'spring onion'
        ],
        'Protein': [  // Synonym for Meats (includes seafood)
            'chicken', 'beef', 'pork', 'turkey', 'lamb', 'veal', 'duck', 'steak', 'ground beef',
            'ground turkey', 'bacon', 'sausage', 'ham', 'salami', 'prosciutto', 'pepperoni',
            'chicken breast', 'chicken thigh', 'drumstick', 'wings', 'meat', 'poultry',
            'ribeye', 'sirloin', 'tenderloin', 'brisket', 'ribs', 'pork chop', 'chorizo',
            'bratwurst', 'hot dog', 'frankfurter', 'pastrami', 'corned beef', 'venison',
            'goat', 'rabbit', 'quail', 'pheasant', 'goose', 'canadian bacon',
            'fish', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'shrimp', 'prawns', 'crab',
            'lobster', 'scallops', 'mussels', 'clams', 'oysters', 'squid', 'octopus', 'seafood',
            'catfish', 'trout', 'bass', 'snapper', 'mackerel', 'sardines', 'anchovies',
            'swordfish', 'mahi mahi', 'grouper', 'flounder', 'sole', 'haddock', 'perch',
            'crayfish', 'calamari', 'caviar', 'roe', 'imitation crab', 'surimi'
        ],
        'Proteins': [  // Plural of Protein
            'chicken', 'beef', 'pork', 'turkey', 'lamb', 'veal', 'duck', 'steak', 'ground beef',
            'ground turkey', 'bacon', 'sausage', 'ham', 'salami', 'prosciutto', 'pepperoni',
            'chicken breast', 'chicken thigh', 'drumstick', 'wings', 'meat', 'poultry',
            'ribeye', 'sirloin', 'tenderloin', 'brisket', 'ribs', 'pork chop', 'chorizo',
            'bratwurst', 'hot dog', 'frankfurter', 'pastrami', 'corned beef', 'venison',
            'goat', 'rabbit', 'quail', 'pheasant', 'goose', 'canadian bacon',
            'fish', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'shrimp', 'prawns', 'crab',
            'lobster', 'scallops', 'mussels', 'clams', 'oysters', 'squid', 'octopus', 'seafood',
            'catfish', 'trout', 'bass', 'snapper', 'mackerel', 'sardines', 'anchovies',
            'swordfish', 'mahi mahi', 'grouper', 'flounder', 'sole', 'haddock', 'perch',
            'crayfish', 'calamari', 'caviar', 'roe', 'imitation crab', 'surimi'
        ],
        'Seasoning': [  // Singular alias for Seasonings
            'salt', 'pepper', 'spice', 'spices', 'seasoning', 'cumin', 'paprika', 'oregano', 'thyme',
            'rosemary', 'sage', 'cinnamon', 'nutmeg', 'ginger', 'turmeric', 'curry', 'chili powder',
            'cayenne', 'garlic powder', 'onion powder', 'bay leaf', 'vanilla', 'extract', 'herbs',
            'dill', 'tarragon', 'marjoram', 'cardamom', 'cloves', 'allspice', 'anise', 'fennel',
            'coriander', 'mustard seed', 'celery seed', 'caraway', 'saffron', 'white pepper',
            'black pepper', 'red pepper flakes', 'italian seasoning', 'poultry seasoning',
            'cajun seasoning', 'taco seasoning', 'everything bagel seasoning', 'msg', 'bouillon'
        ],
        'Spices': [  // Synonym for Seasonings
            'salt', 'pepper', 'spice', 'spices', 'seasoning', 'cumin', 'paprika', 'oregano', 'thyme',
            'rosemary', 'sage', 'cinnamon', 'nutmeg', 'ginger', 'turmeric', 'curry', 'chili powder',
            'cayenne', 'garlic powder', 'onion powder', 'bay leaf', 'vanilla', 'extract', 'herbs',
            'dill', 'tarragon', 'marjoram', 'cardamom', 'cloves', 'allspice', 'anise', 'fennel',
            'coriander', 'mustard seed', 'celery seed', 'caraway', 'saffron', 'white pepper',
            'black pepper', 'red pepper flakes', 'italian seasoning', 'poultry seasoning',
            'cajun seasoning', 'taco seasoning', 'everything bagel seasoning', 'msg', 'bouillon'
        ],
        'Herbs': [  // Synonym for Seasonings
            'salt', 'pepper', 'spice', 'spices', 'seasoning', 'cumin', 'paprika', 'oregano', 'thyme',
            'rosemary', 'sage', 'cinnamon', 'nutmeg', 'ginger', 'turmeric', 'curry', 'chili powder',
            'cayenne', 'garlic powder', 'onion powder', 'bay leaf', 'vanilla', 'extract', 'herbs',
            'dill', 'tarragon', 'marjoram', 'cardamom', 'cloves', 'allspice', 'anise', 'fennel',
            'coriander', 'mustard seed', 'celery seed', 'caraway', 'saffron', 'white pepper',
            'black pepper', 'red pepper flakes', 'italian seasoning', 'poultry seasoning',
            'cajun seasoning', 'taco seasoning', 'everything bagel seasoning', 'msg', 'bouillon'
        ],
        'Oil': [  // Singular alias for Oils
            'oil', 'olive oil', 'vegetable oil', 'canola oil', 'coconut oil', 'sesame oil',
            'avocado oil', 'peanut oil', 'sunflower oil', 'grapeseed oil', 'walnut oil',
            'almond oil', 'flaxseed oil', 'safflower oil', 'corn oil', 'palm oil',
            'extra virgin olive oil', 'light olive oil', 'cooking spray', 'pam', 'butter spray'
        ],
        'Condiment': [  // Singular alias for Condiments
            'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'relish', 'pickle', 'pickles',
            'soy sauce', 'vinegar', 'hot sauce', 'bbq sauce', 'worcestershire', 'sriracha',
            'ranch', 'dressing', 'salsa', 'condiment', 'tartar sauce', 'cocktail sauce',
            'fish sauce', 'hoisin', 'oyster sauce', 'teriyaki', 'marinara', 'alfredo',
            'pesto', 'hummus', 'tahini', 'guacamole', 'chimichurri', 'aioli', 'remoulade',
            'balsamic', 'apple cider vinegar', 'rice vinegar', 'red wine vinegar', 'white vinegar',
            'dijon', 'yellow mustard', 'honey mustard', 'spicy mustard', 'tabasco', 'buffalo sauce'
        ],
        'Sauces': [  // Synonym for Condiments
            'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'relish', 'pickle', 'pickles',
            'soy sauce', 'vinegar', 'hot sauce', 'bbq sauce', 'worcestershire', 'sriracha',
            'ranch', 'dressing', 'salsa', 'condiment', 'tartar sauce', 'cocktail sauce',
            'fish sauce', 'hoisin', 'oyster sauce', 'teriyaki', 'marinara', 'alfredo',
            'pesto', 'hummus', 'tahini', 'guacamole', 'chimichurri', 'aioli', 'remoulade',
            'balsamic', 'apple cider vinegar', 'rice vinegar', 'red wine vinegar', 'white vinegar',
            'dijon', 'yellow mustard', 'honey mustard', 'spicy mustard', 'tabasco', 'buffalo sauce'
        ],
        'Beverage': [  // Singular alias for Beverages
            'water', 'coffee', 'tea', 'juice', 'soda', 'pop', 'beer', 'wine', 'liquor', 'vodka',
            'whiskey', 'rum', 'gin', 'tequila', 'champagne', 'cider', 'lemonade', 'iced tea',
            'green tea', 'black tea', 'herbal tea', 'kombucha', 'sports drink', 'energy drink',
            'coconut water', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'beverage',
            'drink', 'drinks', 'espresso', 'cappuccino', 'latte', 'smoothie'
        ],
        'Drink': [  // Singular for Drinks
            'water', 'coffee', 'tea', 'juice', 'soda', 'pop', 'beer', 'wine', 'liquor', 'vodka',
            'whiskey', 'rum', 'gin', 'tequila', 'champagne', 'cider', 'lemonade', 'iced tea',
            'green tea', 'black tea', 'herbal tea', 'kombucha', 'sports drink', 'energy drink',
            'coconut water', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'beverage',
            'drink', 'drinks', 'espresso', 'cappuccino', 'latte', 'smoothie'
        ],
        'Grain': [  // Singular alias for Grains
            'grain', 'grains', 'wheat', 'barley', 'rye', 'millet', 'amaranth', 'buckwheat',
            'spelt', 'kamut', 'teff', 'sorghum', 'wild rice', 'brown rice', 'white rice',
            'jasmine rice', 'basmati rice', 'arborio rice', 'bread', 'pasta', 'rice', 'noodles', 
            'spaghetti', 'penne', 'rigatoni', 'linguine', 'fettuccine', 'flour', 'tortilla', 
            'tortillas', 'bagel', 'bagels', 'roll', 'rolls', 'baguette', 'pita', 'quinoa', 
            'couscous', 'oats', 'oatmeal', 'cereal', 'crackers', 'bun', 'buns', 'croissant', 
            'muffin', 'pancake', 'waffle', 'macaroni', 'lasagna', 'ravioli', 'angel hair', 
            'orzo', 'fusilli', 'farfalle', 'rotini', 'vermicelli', 'ramen', 'udon', 'soba', 
            'bulgur', 'farro', 'polenta', 'grits', 'cornmeal'
        ],
        'Beans': [  // Synonym for Legumes
            'beans', 'lentils', 'chickpeas', 'black beans', 'kidney beans', 'pinto beans',
            'navy beans', 'lima beans', 'cannellini', 'garbanzo', 'green lentils', 'red lentils',
            'split peas', 'black-eyed peas', 'edamame', 'soybeans', 'tofu', 'tempeh', 'legume'
        ],
        'Snack': [  // Singular alias for Snacks
            'chips', 'popcorn', 'pretzels', 'crackers', 'cookies', 'candy', 'chocolate bar',
            'granola bar', 'protein bar', 'trail mix', 'jerky', 'snack', 'goldfish',
            'cheez-its', 'doritos', 'lays', 'pringles', 'oreos'
        ],

    };
    
    // Get user's actual groups (defaultGroups is available globally)
    const userGroups = defaultGroups || ['Fruits', 'Vegetables', 'Dairy', 'Carbs', 'Seeds', 'Other'];
    
    // Find the best matching category that exists in user's groups
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        // Check if this category exists in user's groups (case-insensitive)
        const categoryExists = userGroups.some(g => g.toLowerCase() === category.toLowerCase());
        
        if (categoryExists) {
            // Check if ingredient matches any keyword for this category
            for (const keyword of keywords) {
                if (nameLower.includes(keyword)) {
                    // Return the exact category name as it appears in user's groups
                    return userGroups.find(g => g.toLowerCase() === category.toLowerCase());
                }
            }
        }
    }
    
    // Default to Other if no match found
    return 'Other';
}

function showUploadLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'upload-loading-overlay';
    overlay.id = 'upload-loading-overlay';
    overlay.innerHTML = `
        <div class="upload-loading-content">
            <div class="upload-spinner"></div>
            <p>Processing ingredients...</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

function hideUploadLoadingOverlay() {
    const overlay = document.getElementById('upload-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function showUploadSuccessMessage(message) {
    const successMsg = document.createElement('div');
    successMsg.className = 'upload-success-message';
    successMsg.textContent = message;
    document.body.appendChild(successMsg);
    
    // Fade in
    setTimeout(() => {
        successMsg.style.opacity = '1';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        successMsg.style.opacity = '0';
        setTimeout(() => {
            successMsg.remove();
        }, 300);
    }, 3000);
}
// Log when upload functions are defined
console.log('Upload functions module loaded');
console.log('triggerIngredientUpload defined?', typeof triggerIngredientUpload === 'function');


// ================================
// INGREDIENT SEARCH FUNCTIONALITY
// ================================

// Setup search listener when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('ingredients-search-input');
    const clearBtn = document.getElementById('ingredients-search-clear');
    
    if (searchInput && clearBtn) {
        // Search as user types
        searchInput.addEventListener('input', function(e) {
            const value = e.target.value;
            filterIngredientsBySearch(value);
            
            // Show/hide clear button
            if (value.trim()) {
                clearBtn.style.display = 'block';
            } else {
                clearBtn.style.display = 'none';
            }
        });
        
        // Clear button click
        clearBtn.addEventListener('click', function() {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            filterIngredientsBySearch(''); // Clear filter
            searchInput.focus(); // Keep focus on search
        });
        
        console.log('Ingredient search listener added');
    }
});

function filterIngredientsBySearch(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    // Get all ingredient groups
    const groups = document.querySelectorAll('#ingredients-section .group-section');
    
    if (!term) {
        // No search term - show all groups and ingredients
        groups.forEach(group => {
            group.style.display = '';
            const rows = group.querySelectorAll('.ingredient-row');
            rows.forEach(row => row.style.display = '');
        });
        return;
    }
    
    // Search through each group
    groups.forEach(group => {
        const rows = group.querySelectorAll('.ingredient-row');
        let hasVisibleIngredients = false;
        
        // Filter rows within this group
        rows.forEach(row => {
            const nameCell = row.querySelector('.ingredient-name');
            const quantityCell = row.querySelector('.ingredient-quantity');
            const notesCell = row.querySelector('.ingredient-notes');
            
            if (nameCell) {
                const name = nameCell.textContent.toLowerCase();
                const quantity = quantityCell ? quantityCell.textContent.toLowerCase() : '';
                const notes = notesCell ? notesCell.textContent.toLowerCase() : '';
                
                // Check if search term matches name, quantity, or notes
                const matches = name.includes(term) || quantity.includes(term) || notes.includes(term);
                
                if (matches) {
                    row.style.display = '';
                    hasVisibleIngredients = true;
                } else {
                    row.style.display = 'none';
                }
            }
        });
        
        // Show/hide entire group based on matches
        if (hasVisibleIngredients) {
            group.style.display = '';
            // Auto-expand group if it has matches and is collapsed
            const groupHeader = group.querySelector('.group-header');
            const groupContent = group.querySelector('.group-content');
            if (groupHeader && groupContent) {
                groupHeader.classList.add('expanded');
                groupContent.style.display = 'block';
            }
        } else {
            group.style.display = 'none';
        }
    });
    
    console.log(`Filtered ingredients by: "${term}"`);
}