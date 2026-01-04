// ================================
// INGREDIENTS - LOAD GROUPS
// ================================
// Start with base default groups
let defaultGroups = ['Fruits', 'Vegetables', 'Dairy', 'Carbs', 'Seeds', 'Other'];

// Load user's custom groups from Firestore
async function loadUserGroups() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        const doc = await db.collection('userSettings').doc(user.uid).get();
        console.log('Loading user groups - doc exists:', doc.exists);
        if (doc.exists && doc.data().ingredientGroups) {
            defaultGroups = doc.data().ingredientGroups;
            console.log('Loaded groups from Firestore:', defaultGroups);
        } else {
            // First time - save default groups
            console.log('First time - saving default groups:', defaultGroups);
            await db.collection('userSettings').doc(user.uid).set({
                ingredientGroups: defaultGroups
            }, { merge: true });
        }
    } catch (error) {
        console.error('Error loading user groups:', error);
    }
}

// Save groups to Firestore
async function saveUserGroups() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        console.log('Saving groups to Firestore:', defaultGroups);
        await db.collection('userSettings').doc(user.uid).set({
            ingredientGroups: defaultGroups
        }, { merge: true });
        console.log('Groups saved successfully');
    } catch (error) {
        console.error('Error saving user groups:', error);
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
        const snapshot = await db.collection('ingredients')
            .where('userId', '==', user.uid)
            .where('toBuy', '==', true)
            .get();

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
                    <span>${i.name || 'Untitled'}</span>
                </td>
                <td>${i.quantity || ''}</td>
                <td>${i.category || ''}</td>
                <td>${i.notes || ''}</td>
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
        
        // Fetch all ingredients for this user
        const snapshot = await db.collection('ingredients')
            .where('userId', '==', user.uid)
            .get();
        
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
            <span class="group-name">${name}</span>
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
                <tbody id="tbody-${name}">
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
                    
                    // Reload to show updated groups
                    await loadIngredientGroups();
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
            <span>${ingredient.name || 'Untitled'}</span>
        </td>
        <td class="to-buy-cell">
            <input type="checkbox" class="to-buy-checkbox-table" ${ingredient.toBuy ? 'checked' : ''} data-id="${ingredient.id}">
        </td>
        <td>${ingredient.quantity || ''}</td>
        <td>${ingredient.category || ''}</td>
        <td>${ingredient.notes || ''}</td>
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
                    const recipesSnapshot = await db.collection('recipes')
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

    // 🔴 STEP 3: CLEAR edit mode when opening NEW ingredient
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
            <span style="font-size: 20px; opacity: 0.6; margin-right: 8px;">⋮⋮</span>
            <span class="recipe-dropdown-item-name">${category}</span>
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

        // Load user's cuisines from Firebase
        const snapshot = await db.collection("cuisines")
            .where("userId", "==", user.uid)
            .get();

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
                    <span class="recipe-dropdown-item-name">${cuisine.name}</span>
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
            <span style="font-size: 20px; opacity: 0.6; margin-right: 8px;">⋮⋮</span>
            <img src="Images/fork-knife-logo.png" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${recipeName}</span>
            <div class="recipe-dropdown-item-add" style="border-color: #d32f2f; color: #d32f2f;">−</div>
        `;
    } else {
        item.innerHTML = `
            <img src="Images/fork-knife-logo.png" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${recipeName}</span>
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
            <span style="font-size: 20px; opacity: 0.6; margin-right: 8px;">⋮⋮</span>
            <img src="${ingredientIcon}" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${ingredientName}</span>
            <button class="ingredient-buy-list-btn" style="margin-right: 8px; padding: 4px 12px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: ${toBuy ? '#4285f4' : '#f0f0f0'}; color: ${toBuy ? '#fff' : '#333'}; cursor: pointer; white-space: nowrap;">${toBuy ? 'Remove from buy list' : 'Add to buy list'}</button>
            <div class="recipe-dropdown-item-add" style="border-color: #d32f2f; color: #d32f2f;">−</div>
        `;
    } else {
        item.innerHTML = `
            <img src="${ingredientIcon}" class="recipe-dropdown-item-icon">
            <span class="recipe-dropdown-item-name">${ingredientName}</span>
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

        // 🟢 EDIT EXISTING INGREDIENT
        if (editingId) {
            await db.collection('ingredients').doc(editingId).update(ingredientData);

            // cleanup edit state
            delete panel.dataset.editingId;
            delete panel.dataset.pendingImageUrl;
            delete panel.dataset.pendingImageOffsetY;
            selectedRecipes = [];

            return editingId;
        }

        // 🔵 CREATE NEW INGREDIENT
        const finalIngredientData = {
            ...ingredientData,
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
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
                const recipesSnapshot = await db.collection('recipes')
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