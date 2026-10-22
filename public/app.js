// ================================================================
// RECIPE BOOK - MAIN APP
// ================================================================
// Core: Firebase, Auth, Navigation, Search, UI Components

// ================================
// FIREBASE REFERENCES
// ================================
document.body.classList.add('auth-checking');
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const provider = new firebase.auth.GoogleAuthProvider();

// Global variables
let currentUser = null;

// ================================
// WORKSPACE MANAGEMENT
// ================================
// Tracks which workspace is currently active
// null or 'personal' = personal workspace (user's own recipes)
// teamspace ID string = teamspace workspace (shared recipes)
let currentWorkspace = 'personal';
let currentWorkspaceName = 'My Recipe Book';

// Get the current workspace query filter for Firestore
function getWorkspaceFilter() {
    if (currentWorkspace === 'personal' || !currentWorkspace) {
        // Personal workspace: recipes owned by user with no teamspaceId
        return { type: 'personal', userId: currentUser?.uid };
    } else {
        // Teamspace: recipes that belong to this teamspace
        return { type: 'teamspace', teamspaceId: currentWorkspace };
    }
}

// Switch to a different workspace
async function switchWorkspace(workspaceType, workspaceId = null, workspaceName = null) {
    console.log(`🔄 Switching workspace to: ${workspaceType}`, workspaceId);
    
    if (workspaceType === 'personal') {
        currentWorkspace = 'personal';
        // Get the user's workspace name from Firestore
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            currentWorkspaceName = userDoc.exists && userDoc.data().workspaceName 
                ? userDoc.data().workspaceName 
                : 'My Recipe Book';
        } catch (e) {
            currentWorkspaceName = 'My Recipe Book';
        }
    } else if (workspaceType === 'teamspace' && workspaceId) {
        currentWorkspace = workspaceId;
        currentWorkspaceName = workspaceName || 'Teamspace';
    }
    
    // Update UI to show active workspace
    updateActiveWorkspaceUI();
    
    // Update the main title/header if needed
    updateWorkspaceHeader();
    
    // 🔑 Ensure defaults exist for this workspace
    await ensureDefaultCuisinesForWorkspace(
        getWorkspaceFilter(),
        currentUser.uid
    );

    // Reload all data for the new workspace
    await reloadWorkspaceData();

        
    // Close the sidebar
    closeWorkspaceSidebar();
    
    console.log(`✅ Switched to workspace: ${currentWorkspaceName}`);
}

// Update UI to highlight active workspace in sidebar
function updateActiveWorkspaceUI() {
    // Remove active class from all workspace items
    document.querySelectorAll('.workspace-item').forEach(item => {
        item.classList.remove('workspace-item-active');
    });
    
    // Add active class to current workspace
    if (currentWorkspace === 'personal') {
        const personalItem = document.getElementById('workspace-personal-item');
        if (personalItem) {
            personalItem.classList.add('workspace-item-active');
        }
    } else {
        // Find the teamspace item
        const teamspaceItems = document.querySelectorAll('#workspace-teamspaces .workspace-item');
        teamspaceItems.forEach(item => {
            if (item.getAttribute('data-teamspace-id') === currentWorkspace) {
                item.classList.add('workspace-item-active');
            }
        });
    }
}

// Update the main page header to show current workspace
function updateWorkspaceHeader() {
    // Update the recipes section title or add a workspace indicator
    const recipesTitle = document.querySelector('.recipes-title');
    if (recipesTitle) {
        // Could optionally show workspace name here
        // For now, we'll keep it as "Recipes"
    }
    
    // Show/hide a workspace indicator badge
    let workspaceBadge = document.getElementById('current-workspace-badge');
    if (!workspaceBadge) {
        // Create the badge if it doesn't exist
        const headerArea = document.querySelector('.right-content');
        if (headerArea) {
            workspaceBadge = document.createElement('div');
            workspaceBadge.id = 'current-workspace-badge';
            workspaceBadge.className = 'current-workspace-badge';
            headerArea.insertBefore(workspaceBadge, headerArea.firstChild);
        }
    }
    
    if (workspaceBadge) {
        const icon = currentWorkspace === 'personal' ? '🏠' : '👥';
        workspaceBadge.innerHTML = `${icon} ${escapeHtml(currentWorkspaceName)}`;
        workspaceBadge.style.display = 'block';
    }
}

// Reload all data for the current workspace
async function reloadWorkspaceData() {
    console.log('🔄 Reloading workspace data...');
    
    // Show loading state
    const recipeGrid = document.getElementById('recipe-grid');
    if (recipeGrid) {
        recipeGrid.style.opacity = '0.5';
    }
    
    try {
        // Reload recipes
        if (typeof loadRecipes === 'function') {
            loadRecipes();
        }
        
        // Reload cuisines
        if (typeof loadCuisines === 'function') {
            loadCuisines();
        }
        
        // Reload ingredients  
        if (typeof loadShoppingIngredients === 'function') {
            loadShoppingIngredients();
        }
    } catch (error) {
        console.error('Error reloading workspace data:', error);
    }
}

// Make workspace functions globally available
window.switchWorkspace = switchWorkspace;
window.currentWorkspace = currentWorkspace;
window.getWorkspaceFilter = getWorkspaceFilter;

// Short helper
const el = id => document.getElementById(id);

let currentDraftId = null;
let isLoadingRecipe = false;


// ================================
// NAVIGATION DROPDOWN
// ================================
function initNavigation() {
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');
    const rightContent = document.querySelector('.right-content');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function () {
            const wasHidden = navMenu.classList.contains('hidden');
            navMenu.classList.toggle('hidden');
            navToggle.classList.toggle('open');

            if (wasHidden) {
                setTimeout(() => {
                    const menuHeight = navMenu.offsetHeight;
                    const currentPadding = 175;
                    rightContent.style.paddingTop = (currentPadding + menuHeight + 12) + 'px';
                }, 10);
            } else {
                rightContent.style.paddingTop = '175px';
            }
        });

        navLinks.forEach(link => {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const targetId = this.getAttribute('href').substring(1);

                document.querySelectorAll('.section-title, .recipes-title, .ingredients-title')
                    .forEach(t => t.classList.remove('active-section'));

                const section = document.getElementById(targetId);

                if (section) {
                    const title = section.querySelector('.section-title, .recipes-title, .ingredients-title');
                    if (title) title.classList.add('active-section');

                    const offset = 120;
                    const position = section.getBoundingClientRect().top + window.scrollY - offset;

                    window.scrollTo({ top: position, behavior: 'smooth' });
                }
            });
        });

        document.addEventListener('click', function (e) {
            const isNavLink = e.target.closest('.nav-link');
            if (!isNavLink) {
                document.querySelectorAll('.section-title, .recipes-title, .ingredients-title')
                    .forEach(t => t.classList.remove('active-section'));
            }
        });
    }
}


// ================================
// NEW DROPDOWN MENUS
// ================================
function initDropdowns() {
    const recipesNewBtn = document.getElementById('recipes-new-btn');
    const recipesDropdown = document.getElementById('recipes-new-dropdown');
    const ingredientsNewBtn = document.getElementById('ingredients-new-btn');
    const ingredientsDropdown = document.getElementById('ingredients-new-dropdown');

    if (recipesNewBtn && recipesDropdown) {
        recipesNewBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            recipesDropdown.classList.toggle('hidden');
            if (ingredientsDropdown) ingredientsDropdown.classList.add('hidden');
        });
    }

    if (ingredientsNewBtn && ingredientsDropdown) {
        ingredientsNewBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            ingredientsDropdown.classList.toggle('hidden');
            if (recipesDropdown) recipesDropdown.classList.add('hidden');
        });
    }

    document.addEventListener('click', function (e) {
        const isDropdownBtn = e.target.closest('.sidebar-new-btn');
        const isDropdownMenu = e.target.closest('.new-dropdown-menu');

        if (!isDropdownBtn && !isDropdownMenu) {
            if (recipesDropdown) recipesDropdown.classList.add('hidden');
            if (ingredientsDropdown) ingredientsDropdown.classList.add('hidden');
        }
    });

    const dropdownItems = document.querySelectorAll('.new-dropdown-menu .dropdown-item');

    dropdownItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.stopPropagation();

            const action = this.textContent.trim();
            const wrapper = this.closest('.new-dropdown-wrapper');

            console.log('Dropdown item clicked:', action);
            console.log('Wrapper:', wrapper);

            const isRecipeBtn = wrapper.querySelector('#recipes-new-btn');
            const isIngredientBtn = wrapper.querySelector('#ingredients-new-btn');

            console.log('isRecipeBtn:', isRecipeBtn);
            console.log('isIngredientBtn:', isIngredientBtn);

            if (isRecipeBtn) {
                if (action === 'From Scratch') {
                    openSidePanel('recipe');
                } else if (action === 'Upload') {
                    console.log('Recipe Upload - triggering file input');
                    const fileInput = document.getElementById('recipe-file-input');
                    if (fileInput) {
                        fileInput.click();
                    } else {
                        console.error('recipe-file-input not found!');
                    }
                }
            } 
            else if (isIngredientBtn) {
                console.log('Ingredient path - action:', action);
                if (action === 'Upload') {
                    console.log('Upload clicked - triggering file upload');
                    
                    // Check if function is available
                    if (typeof triggerIngredientUpload === 'function') {
                        triggerIngredientUpload();
                    } else {
                        console.error('triggerIngredientUpload is not defined - ingredients.js may not be loaded yet');
                        
                        // Wait a bit and try again (in case scripts are still loading)
                        setTimeout(() => {
                            if (typeof triggerIngredientUpload === 'function') {
                                console.log('Function found on retry');
                                triggerIngredientUpload();
                            } else {
                                console.error('Function still not available after retry');
                                alert('Upload feature not loaded. Please hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)');
                            }
                        }, 100);
                    }
                }
                else if (action === 'From Scratch') {
                    console.log('From Scratch clicked - opening panel');
                    openIngredientPanel();
                }
            } 
            else {
                // â­ THIS IS CUISINES â­
                if (action === 'From Scratch') {
                    createNewCuisine();
                }
            }

            this.closest('.new-dropdown-menu').classList.add('hidden');
        });
    });

    // --- Cuisines: simple NEW button ---
    const cuisinesNewBtn = document.getElementById('cuisines-new-btn');
    if (cuisinesNewBtn) {
        cuisinesNewBtn.addEventListener('click', () => {
            createNewCuisine();
        });
    }

    // --- Ingredients: filter buttons ---
    const shoppingBtn = document.getElementById('ingredients-shopping-btn');
    const allBtn = document.getElementById('ingredients-all-btn');
    
    if (shoppingBtn && allBtn) {
        shoppingBtn.addEventListener('click', () => {
            shoppingBtn.classList.add('active');
            allBtn.classList.remove('active');
            showShoppingView();
        });
        
        allBtn.addEventListener('click', () => {
            allBtn.classList.add('active');
            shoppingBtn.classList.remove('active');
            showAllIngredientsView();
        });
    }

    // --- Shopping: Sort dropdown ---
    const shoppingSettingsBtn = document.getElementById('shopping-settings-btn');
    const shoppingSortDropdown = document.getElementById('shopping-sort-dropdown');
    const sortOrderDropdown = document.getElementById('sort-order-dropdown');
    let currentSort = 'name';
    let currentSortOrder = 'asc'; // 'asc' or 'desc'

    if (shoppingSettingsBtn && shoppingSortDropdown) {
        shoppingSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            shoppingSortDropdown.classList.toggle('hidden');
            sortOrderDropdown.classList.add('hidden');
        });

        // Handle sort option clicks (Name, Category, Date Added)
        const sortItems = shoppingSortDropdown.querySelectorAll('.sort-dropdown-item');
        sortItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                // If clicking on the order button, don't trigger main click
                if (e.target.classList.contains('sort-order-btn')) return;
                
                e.stopPropagation();
                
                // Update active state
                sortItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Get sort type and reload (keep dropdown open)
                currentSort = item.dataset.sort;
                await loadShoppingIngredientsWithFade(currentSort, currentSortOrder);
                
                // Fade close dropdown after a short delay
                setTimeout(() => {
                    shoppingSortDropdown.style.transition = 'opacity 0.2s ease';
                    shoppingSortDropdown.style.opacity = '0';
                    setTimeout(() => {
                        shoppingSortDropdown.classList.add('hidden');
                        shoppingSortDropdown.style.opacity = '';
                        shoppingSortDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle sort order button clicks (âŒ„)
        const orderBtns = shoppingSortDropdown.querySelectorAll('.sort-order-btn');
        orderBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const field = btn.dataset.field;
                currentSort = field;
                
                // Update active state on main sort items
                sortItems.forEach(i => {
                    if (i.dataset.sort === field) {
                        sortItems.forEach(j => j.classList.remove('active'));
                        i.classList.add('active');
                    }
                });
                
                // Show order dropdown
                shoppingSortDropdown.classList.add('hidden');
                sortOrderDropdown.classList.remove('hidden');
                
                // Update active state in order dropdown
                const orderOptions = sortOrderDropdown.querySelectorAll('.sort-order-option');
                orderOptions.forEach(opt => {
                    if (opt.dataset.order === currentSortOrder) {
                        opt.classList.add('active');
                    } else {
                        opt.classList.remove('active');
                    }
                });
            });
        });

        // Handle order selection (Ascending/Descending)
        const orderOptions = sortOrderDropdown.querySelectorAll('.sort-order-option');
        orderOptions.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                currentSortOrder = option.dataset.order;
                
                // Update active state
                orderOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                // Reload with new order
                await loadShoppingIngredientsWithFade(currentSort, currentSortOrder);
                
                // Fade close dropdown
                setTimeout(() => {
                    sortOrderDropdown.style.transition = 'opacity 0.2s ease';
                    sortOrderDropdown.style.opacity = '0';
                    setTimeout(() => {
                        sortOrderDropdown.classList.add('hidden');
                        sortOrderDropdown.style.opacity = '';
                        sortOrderDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle delete sort
        const deleteSort = sortOrderDropdown.querySelector('.sort-order-delete');
        if (deleteSort) {
            deleteSort.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Reset to default
                currentSort = 'name';
                currentSortOrder = 'asc';
                
                // Reset active states
                sortItems.forEach(i => i.classList.remove('active'));
                const nameItem = shoppingSortDropdown.querySelector('[data-sort="name"]');
                if (nameItem) nameItem.classList.add('active');
                
                // Reload
                await loadShoppingIngredientsWithFade(currentSort, currentSortOrder);
                
                // Close dropdown
                sortOrderDropdown.classList.add('hidden');
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!shoppingSettingsBtn.contains(e.target) && 
                !shoppingSortDropdown.contains(e.target) &&
                !sortOrderDropdown.contains(e.target)) {
                shoppingSortDropdown.classList.add('hidden');
                sortOrderDropdown.classList.add('hidden');
            }
        });

        // Set initial active state
        const nameSort = shoppingSortDropdown.querySelector('[data-sort="name"]');
        if (nameSort) nameSort.classList.add('active');
    }

    // --- Cuisines: Sort dropdown ---
    const cuisinesSettingsBtn = document.getElementById('cuisines-settings-btn');
    const cuisinesSortDropdown = document.getElementById('cuisines-sort-dropdown');
    const cuisinesSortOrderDropdown = document.getElementById('cuisines-sort-order-dropdown');
    let cuisinesCurrentSort = 'name';
    let cuisinesCurrentSortOrder = 'asc'; // 'asc' or 'desc'

    if (cuisinesSettingsBtn && cuisinesSortDropdown) {
        cuisinesSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cuisinesSortDropdown.classList.toggle('hidden');
            cuisinesSortOrderDropdown.classList.add('hidden');
        });

        // Handle sort option clicks (Name, Date Created)
        const cuisinesSortItems = cuisinesSortDropdown.querySelectorAll('.sort-dropdown-item');
        cuisinesSortItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                // If clicking on the order button, don't trigger main click
                if (e.target.classList.contains('sort-order-btn')) return;
                
                e.stopPropagation();
                
                // Update active state
                cuisinesSortItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Get sort type and reload (keep dropdown open)
                cuisinesCurrentSort = item.dataset.sort;
                await loadCuisinesWithFade(cuisinesCurrentSort, cuisinesCurrentSortOrder);
                
                // Fade close dropdown after a short delay
                setTimeout(() => {
                    cuisinesSortDropdown.style.transition = 'opacity 0.2s ease';
                    cuisinesSortDropdown.style.opacity = '0';
                    setTimeout(() => {
                        cuisinesSortDropdown.classList.add('hidden');
                        cuisinesSortDropdown.style.opacity = '';
                        cuisinesSortDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle sort order button clicks (âŒ„)
        const cuisinesOrderBtns = cuisinesSortDropdown.querySelectorAll('.sort-order-btn');
        cuisinesOrderBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const field = btn.dataset.field;
                cuisinesCurrentSort = field;
                
                // Update active state on main sort items
                cuisinesSortItems.forEach(i => {
                    if (i.dataset.sort === field) {
                        cuisinesSortItems.forEach(j => j.classList.remove('active'));
                        i.classList.add('active');
                    }
                });
                
                // Show order dropdown
                cuisinesSortDropdown.classList.add('hidden');
                cuisinesSortOrderDropdown.classList.remove('hidden');
                
                // Update active state in order dropdown
                const cuisinesOrderOptions = cuisinesSortOrderDropdown.querySelectorAll('.sort-order-option');
                cuisinesOrderOptions.forEach(opt => {
                    if (opt.dataset.order === cuisinesCurrentSortOrder) {
                        opt.classList.add('active');
                    } else {
                        opt.classList.remove('active');
                    }
                });
            });
        });

        // Handle order selection (Ascending/Descending)
        const cuisinesOrderOptions = cuisinesSortOrderDropdown.querySelectorAll('.sort-order-option');
        cuisinesOrderOptions.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                cuisinesCurrentSortOrder = option.dataset.order;
                
                // Update active state
                cuisinesOrderOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                // Reload with new order
                await loadCuisinesWithFade(cuisinesCurrentSort, cuisinesCurrentSortOrder);
                
                // Fade close dropdown
                setTimeout(() => {
                    cuisinesSortOrderDropdown.style.transition = 'opacity 0.2s ease';
                    cuisinesSortOrderDropdown.style.opacity = '0';
                    setTimeout(() => {
                        cuisinesSortOrderDropdown.classList.add('hidden');
                        cuisinesSortOrderDropdown.style.opacity = '';
                        cuisinesSortOrderDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle delete sort
        const cuisinesDeleteSort = cuisinesSortOrderDropdown.querySelector('.sort-order-delete');
        if (cuisinesDeleteSort) {
            cuisinesDeleteSort.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Reset to default
                cuisinesCurrentSort = 'name';
                cuisinesCurrentSortOrder = 'asc';
                
                // Reset active states
                cuisinesSortItems.forEach(i => i.classList.remove('active'));
                const nameItem = cuisinesSortDropdown.querySelector('[data-sort="name"]');
                if (nameItem) nameItem.classList.add('active');
                
                // Reload
                await loadCuisinesWithFade(cuisinesCurrentSort, cuisinesCurrentSortOrder);
                
                // Close dropdown
                cuisinesSortOrderDropdown.classList.add('hidden');
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!cuisinesSettingsBtn.contains(e.target) && 
                !cuisinesSortDropdown.contains(e.target) &&
                !cuisinesSortOrderDropdown.contains(e.target)) {
                cuisinesSortDropdown.classList.add('hidden');
                cuisinesSortOrderDropdown.classList.add('hidden');
            }
        });

        // Set initial active state
        const cuisinesNameSort = cuisinesSortDropdown.querySelector('[data-sort="name"]');
        if (cuisinesNameSort) cuisinesNameSort.classList.add('active');
    }
}

// ================================
// ACTION BUTTONS
// ================================
function initActionButtons() {
    // New Recipe button
    const newRecipeBtn = document.getElementById('new-recipe-btn');
    if (newRecipeBtn) {
        newRecipeBtn.addEventListener('click', () => {
            openSidePanel('recipe');
        });
    }

    // New Ingredient button
    const newIngredientBtn = document.getElementById('new-ingredient-btn');
    if (newIngredientBtn) {
        newIngredientBtn.addEventListener('click', () => {
            openIngredientPanel();
        });
    }

    // Download Shopping List buttons
    const downloadShoppingListBtn = document.getElementById('download-shopping-list-action-btn');
    const downloadShoppingListBtn2 = document.getElementById('download-shopping-list-btn');
    
    if (downloadShoppingListBtn) {
        downloadShoppingListBtn.addEventListener('click', () => {
            openShoppingListModal();
        });
    }
    
    if (downloadShoppingListBtn2) {
        downloadShoppingListBtn2.addEventListener('click', () => {
            openShoppingListModal();
        });
    }
    
    // Shopping list modal handlers
    initShoppingListModal();
}

// ================================
// DOWNLOAD SHOPPING LIST
// ================================
let selectedBackground = 'simple';

function initShoppingListModal() {
    const modal = document.getElementById('shopping-list-modal');
    const overlay = document.getElementById('shopping-list-modal-overlay');
    const closeBtn = document.getElementById('shopping-list-modal-close');
    const confirmBtn = document.getElementById('shopping-list-confirm-download');
    const backgroundOptions = document.querySelectorAll('.background-option');
    
    // Select background
    backgroundOptions.forEach(option => {
        option.addEventListener('click', () => {
            backgroundOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedBackground = option.dataset.background;
        });
    });
    
    // Set default selection
    if (backgroundOptions.length > 0) {
        backgroundOptions[0].classList.add('selected');
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', closeShoppingListModal);
    }
    
    if (overlay) {
        overlay.addEventListener('click', closeShoppingListModal);
    }
    
    // Confirm download
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            await downloadShoppingListPDF();
            closeShoppingListModal();
        });
    }
}

function openShoppingListModal() {
    const modal = document.getElementById('shopping-list-modal');
    const overlay = document.getElementById('shopping-list-modal-overlay');
    
    if (!modal || !overlay) {
        console.error('Modal or overlay not found');
        return;
    }
    
    // Remove hidden class to show both
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function closeShoppingListModal() {
    const modal = document.getElementById('shopping-list-modal');
    const overlay = document.getElementById('shopping-list-modal-overlay');
    
    if (!modal || !overlay) return;
    
    // Hide both
    overlay.classList.add('hidden');
    modal.classList.add('hidden');
}

async function downloadShoppingListPDF() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const snapshot = await db.collection('ingredients')
            .where('userId', '==', user.uid)
            .where('toBuy', '==', true)
            .get();

        if (snapshot.empty) {
            await macAlert('No items in your shopping list.');
            return;
        }

        // Check if jsPDF is loaded
        if (!window.jspdf) {
            alert('PDF library not loaded. Please refresh the page and try again.');
            return;
        }

        // Load jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Page dimensions
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        // Load and draw background image
        await drawBackgroundImage(doc, selectedBackground, pageWidth, pageHeight);

        // Layout is background-specific
        if (selectedBackground === 'grey') {
            // Grey background layout
            // Date (top right, moved slightly right)
            const currentDate = new Date().toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
            doc.setFontSize(12);
            doc.setFont('times', 'normal');
            doc.setTextColor(80, 80, 80);
            const dateLabel = 'DATE';
            const dateLabelWidth = doc.getTextWidth(dateLabel);
            doc.text(dateLabel, pageWidth - margin - dateLabelWidth - 5, 42); // Moved 5mm more to the right
            const dateWidth = doc.getTextWidth(currentDate);
            doc.text(currentDate, pageWidth - margin - dateWidth - 5, 50);
        } else {
            // Default layout for other backgrounds - same DATE header as grey
            // Date (top right, moved slightly right)
            const currentDate = new Date().toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
            doc.setFontSize(12);
            doc.setFont('times', 'normal');
            doc.setTextColor(80, 80, 80);
            const dateLabel = 'DATE';
            const dateLabelWidth = doc.getTextWidth(dateLabel);
            doc.text(dateLabel, pageWidth - margin - dateLabelWidth - 5, 42); // Moved 5mm more to the right
            const dateWidth = doc.getTextWidth(currentDate);
            doc.text(currentDate, pageWidth - margin - dateWidth - 5, 50);
        }

        // Group items by category
        const itemsByCategory = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const category = data.category || 'Other';
            
            if (!itemsByCategory[category]) {
                itemsByCategory[category] = [];
            }
            
            itemsByCategory[category].push({
                name: data.name || 'Untitled',
                quantity: data.quantity || '',
                notes: data.notes || ''
            });
        });

        // Sort categories to match your defaultGroups order
        const sortedCategories = [];
        defaultGroups.forEach(group => {
            if (itemsByCategory[group]) {
                sortedCategories.push(group);
            }
        });

        // Add any remaining categories not in defaultGroups
        Object.keys(itemsByCategory).forEach(cat => {
            if (!sortedCategories.includes(cat)) {
                sortedCategories.push(cat);
            }
        });

        // Layout is background-specific
        if (selectedBackground === 'grey') {
            // Grey background: Grid layout with category boxes
            const startY = 70; // Moved down
            const boxMargin = 8;
            const boxesPerRow = 2;
            const boxWidth = (contentWidth - boxMargin) / boxesPerRow;
            const boxHeight = 65; // Increased height for more lines
            const categoryHeaderHeight = 8;
            const columnHeaderHeight = 6; // Height for column headers inside box
            const lineSpacing = 5.5;
            const linesPerBox = 10; // More lines per box
            
            // Column widths (Item takes more space, Quantity and Notes are smaller)
            const itemColWidth = boxWidth * 0.5; // 50% for Item
            const quantityColWidth = boxWidth * 0.25; // 25% for Quantity
            const notesColWidth = boxWidth * 0.25; // 25% for Notes
            const colPadding = 3; // Padding from edges
            
            // Helper function to draw a category box with specific items
            const drawCategoryBox = (category, items, boxX, boxY, boxHeight, isContinuation = false) => {
                // Set colors based on background - cream uses grey like text, others use lighter grey
                const isCream = selectedBackground === 'cream';
                const boxBorderR = isCream ? 70 : 180;
                const boxBorderG = isCream ? 70 : 180;
                const boxBorderB = isCream ? 70 : 180;
                const lineR = isCream ? 100 : 200;
                const lineG = isCream ? 100 : 200;
                const lineB = isCream ? 100 : 200;
                
                // Draw category box
                doc.setDrawColor(boxBorderR, boxBorderG, boxBorderB);
                doc.setLineWidth(0.5);
                doc.rect(boxX, boxY, boxWidth, boxHeight);
                
                // Category name (centered above box)
                doc.setFontSize(12);
                doc.setFont('times', 'bold');
                doc.setTextColor(70, 70, 70);
                const categoryName = isContinuation ? `${category.toUpperCase()} (cont.)` : category.toUpperCase();
                const categoryWidth = doc.getTextWidth(categoryName);
                doc.text(categoryName, boxX + (boxWidth - categoryWidth) / 2, boxY - 2);
                
                // Column headers inside box - positioned just below the top
                const headerY = boxY + 3;
                doc.setFontSize(9);
                doc.setFont('times', 'bold');
                doc.setTextColor(70, 70, 70);
                
                // Column headers - positioned closer to the line
                doc.text('Item', boxX + colPadding + 1, headerY + 5);
                doc.text('Quantity', boxX + colPadding + itemColWidth + 1, headerY + 5);
                doc.text('Notes', boxX + colPadding + itemColWidth + quantityColWidth + 1, headerY + 5);
                
                // Draw header line below headers
                doc.setDrawColor(lineR, lineG, lineB);
                doc.setLineWidth(0.3);
                doc.line(boxX + colPadding, headerY + 6, boxX + boxWidth - colPadding, headerY + 6);
                
                // Draw vertical lines separating columns - shorter to not touch top/bottom
                const verticalLinePadding = 2; // Padding from top and bottom
                doc.setDrawColor(boxBorderR, boxBorderG, boxBorderB);
                doc.line(boxX + colPadding + itemColWidth, boxY + verticalLinePadding, boxX + colPadding + itemColWidth, boxY + boxHeight - verticalLinePadding);
                doc.line(boxX + colPadding + itemColWidth + quantityColWidth, boxY + verticalLinePadding, boxX + colPadding + itemColWidth + quantityColWidth, boxY + boxHeight - verticalLinePadding);
                
                // Items inside box - start with more space after header
                doc.setFontSize(10);
                doc.setFont('times', 'normal');
                doc.setTextColor(70, 70, 70);
                let itemY = headerY + 12;
                
                items.forEach((item, index) => {
                    // Draw line for this row (before the item text)
                    const lineY = itemY + 1;
                    doc.setDrawColor(lineR, lineG, lineB);
                    doc.line(boxX + colPadding, lineY, boxX + boxWidth - colPadding, lineY);
                    
                    // Item name (left column) - left aligned, positioned just above the line
                    let itemName = item.name || '';
                    const maxItemWidth = itemColWidth - (colPadding * 2);
                    if (doc.getTextWidth(itemName) > maxItemWidth) {
                        while (doc.getTextWidth(itemName + '...') > maxItemWidth && itemName.length > 0) {
                            itemName = itemName.slice(0, -1);
                        }
                        itemName += '...';
                    }
                    doc.text(itemName, boxX + colPadding + 1, itemY);
                    
                    // Quantity (middle column) - left aligned with padding from column edge
                    const quantity = (item.quantity && item.quantity.trim() !== '') ? item.quantity : '';
                    const quantityX = boxX + colPadding + itemColWidth + 1;
                    doc.text(quantity, quantityX, itemY);
                    
                    // Notes (right column) - left aligned with padding from column edge
                    const notes = (item.notes && item.notes.trim() !== '') ? item.notes : '';
                    let notesText = notes;
                    const notesX = boxX + colPadding + itemColWidth + quantityColWidth + 1;
                    const maxNotesWidth = notesColWidth - (colPadding + 3);
                    if (doc.getTextWidth(notesText) > maxNotesWidth) {
                        while (doc.getTextWidth(notesText + '...') > maxNotesWidth && notesText.length > 0) {
                            notesText = notesText.slice(0, -1);
                        }
                        notesText += '...';
                    }
                    doc.text(notesText, notesX, itemY);
                    
                    itemY += lineSpacing;
                });
                
                // No need to draw bottom line - the box rectangle border already provides it
            };
            
            // Track Y position for each column
            let columnY = [startY, startY]; // [left column Y, right column Y]
            
            for (let categoryIndex = 0; categoryIndex < sortedCategories.length; categoryIndex++) {
                const category = sortedCategories[categoryIndex];
                let items = itemsByCategory[category];
                
                // Process all items for this category
                let isFirstBox = true;
                while (items.length > 0) {
                    // Choose column: use left column if it's shorter or equal, otherwise use right
                    let currentCol = (columnY[0] <= columnY[1]) ? 0 : 1;
                    let currentBoxY = columnY[currentCol];
                    let currentBoxX = margin + (currentCol * (boxWidth + boxMargin));
                    
                    // Check if we need a new page
                    const pageBottom = pageHeight - margin;
                    if (currentBoxY > pageBottom - 50) { // Not enough space for even a small box
                        doc.addPage();
                        await drawBackgroundImage(doc, selectedBackground, pageWidth, pageHeight);
                        // Redraw DATE on new page
                        const currentDate = new Date().toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                        });
                        doc.setFontSize(12);
                        doc.setFont('times', 'normal');
                        doc.setTextColor(80, 80, 80);
                        const dateLabel = 'DATE';
                        const dateLabelWidth = doc.getTextWidth(dateLabel);
                        doc.text(dateLabel, pageWidth - margin - dateLabelWidth - 5, 42);
                        const dateWidth = doc.getTextWidth(currentDate);
                        doc.text(currentDate, pageWidth - margin - dateWidth - 5, 50);
                        
                        // Reset both columns to start
                        columnY = [startY, startY];
                        currentCol = 0;
                        currentBoxY = startY;
                        currentBoxX = margin;
                    }
                    
                    // Calculate available height on page (leave some margin at bottom)
                    const minSpaceAtBottom = 20;
                    const availablePageHeight = pageBottom - currentBoxY - minSpaceAtBottom;
                    
                    // Calculate how many items we can fit in available space
                    const headerSpace = 15; // Space from box top to first item
                    const bottomPadding = 0;
                    const contentHeight = availablePageHeight - headerSpace - bottomPadding;
                    const maxItemsThatFit = Math.floor((contentHeight - 2) / lineSpacing);
                    
                    // Calculate how many items we want to show (all items if they fit, or max that fit)
                    const itemsToShowCount = Math.min(items.length, maxItemsThatFit);
                    const itemsToShow = items.slice(0, itemsToShowCount);
                    const remainingItems = items.slice(itemsToShowCount);
                    
                    // Calculate box height needed ONLY for the items we're showing
                    const neededHeight = headerSpace + (itemsToShowCount * lineSpacing) + bottomPadding;
                    const actualBoxHeight = Math.min(neededHeight, availablePageHeight);
                    
                    // Draw box with the specific items
                    drawCategoryBox(category, itemsToShow, currentBoxX, currentBoxY, actualBoxHeight, !isFirstBox);
                    
                    // Update column Y position (add box height + small margin)
                    columnY[currentCol] = currentBoxY + actualBoxHeight + boxMargin;
                    
                    items = remainingItems;
                        isFirstBox = false;
                    
                    // If we have remaining items but can't fit them, we'll continue in the loop
                    // The next iteration will check available space again
                }
            }
        } else {
            // Same layout as grey background: Grid layout with category boxes
            const startY = 70; // Moved down
            const boxMargin = 8;
            const boxesPerRow = 2;
            const boxWidth = (contentWidth - boxMargin) / boxesPerRow;
            const boxHeight = 65; // Increased height for more lines
            const categoryHeaderHeight = 8;
            const columnHeaderHeight = 6; // Height for column headers inside box
            const lineSpacing = 5.5;
            const linesPerBox = 10; // More lines per box
            
            // Column widths (Item takes more space, Quantity and Notes are smaller)
            const itemColWidth = boxWidth * 0.5; // 50% for Item
            const quantityColWidth = boxWidth * 0.25; // 25% for Quantity
            const notesColWidth = boxWidth * 0.25; // 25% for Notes
            const colPadding = 3; // Padding from edges
            
            // Helper function to draw a category box with specific items
            const drawCategoryBox = (category, items, boxX, boxY, boxHeight, isContinuation = false) => {
                // Set colors based on background - cream uses grey like text, others use lighter grey
                const isCream = selectedBackground === 'cream';
                const boxBorderR = isCream ? 70 : 180;
                const boxBorderG = isCream ? 70 : 180;
                const boxBorderB = isCream ? 70 : 180;
                const lineR = isCream ? 100 : 200;
                const lineG = isCream ? 100 : 200;
                const lineB = isCream ? 100 : 200;
                
                // Draw category box
                doc.setDrawColor(boxBorderR, boxBorderG, boxBorderB);
                doc.setLineWidth(0.5);
                doc.rect(boxX, boxY, boxWidth, boxHeight);
                
                // Category name (centered above box)
                doc.setFontSize(12);
                doc.setFont('times', 'bold');
                doc.setTextColor(70, 70, 70);
                const categoryName = isContinuation ? `${category.toUpperCase()} (cont.)` : category.toUpperCase();
                const categoryWidth = doc.getTextWidth(categoryName);
                doc.text(categoryName, boxX + (boxWidth - categoryWidth) / 2, boxY - 2);
                
                // Column headers inside box - positioned just below the top
                const headerY = boxY + 3;
                doc.setFontSize(9);
                doc.setFont('times', 'bold');
                doc.setTextColor(70, 70, 70);
                
                // Column headers - positioned closer to the line
                doc.text('Item', boxX + colPadding + 1, headerY + 5);
                doc.text('Quantity', boxX + colPadding + itemColWidth + 1, headerY + 5);
                doc.text('Notes', boxX + colPadding + itemColWidth + quantityColWidth + 1, headerY + 5);
                
                // Draw header line below headers
                doc.setDrawColor(lineR, lineG, lineB);
                doc.setLineWidth(0.3);
                doc.line(boxX + colPadding, headerY + 6, boxX + boxWidth - colPadding, headerY + 6);
                
                // Draw vertical lines separating columns - shorter to not touch top/bottom
                const verticalLinePadding = 2; // Padding from top and bottom
                doc.setDrawColor(boxBorderR, boxBorderG, boxBorderB);
                doc.line(boxX + colPadding + itemColWidth, boxY + verticalLinePadding, boxX + colPadding + itemColWidth, boxY + boxHeight - verticalLinePadding);
                doc.line(boxX + colPadding + itemColWidth + quantityColWidth, boxY + verticalLinePadding, boxX + colPadding + itemColWidth + quantityColWidth, boxY + boxHeight - verticalLinePadding);
                
                // Items inside box - start with more space after header
                doc.setFontSize(10);
                doc.setFont('times', 'normal');
                doc.setTextColor(70, 70, 70);
                let itemY = headerY + 12;
                
                items.forEach((item, index) => {
                    // Draw line for this row (before the item text)
                    const lineY = itemY + 1;
                    doc.setDrawColor(lineR, lineG, lineB);
                    doc.line(boxX + colPadding, lineY, boxX + boxWidth - colPadding, lineY);
                    
                    // Item name (left column) - left aligned, positioned just above the line
                    let itemName = item.name || '';
                    const maxItemWidth = itemColWidth - (colPadding * 2);
                    if (doc.getTextWidth(itemName) > maxItemWidth) {
                        while (doc.getTextWidth(itemName + '...') > maxItemWidth && itemName.length > 0) {
                            itemName = itemName.slice(0, -1);
                        }
                        itemName += '...';
                    }
                    doc.text(itemName, boxX + colPadding + 1, itemY);
                    
                    // Quantity (middle column) - left aligned with padding from column edge
                    const quantity = (item.quantity && item.quantity.trim() !== '') ? item.quantity : '';
                    const quantityX = boxX + colPadding + itemColWidth + 1;
                    doc.text(quantity, quantityX, itemY);
                    
                    // Notes (right column) - left aligned with padding from column edge
                    const notes = (item.notes && item.notes.trim() !== '') ? item.notes : '';
                    let notesText = notes;
                    const notesX = boxX + colPadding + itemColWidth + quantityColWidth + 1;
                    const maxNotesWidth = notesColWidth - (colPadding + 3);
                    if (doc.getTextWidth(notesText) > maxNotesWidth) {
                        while (doc.getTextWidth(notesText + '...') > maxNotesWidth && notesText.length > 0) {
                            notesText = notesText.slice(0, -1);
                        }
                        notesText += '...';
                    }
                    doc.text(notesText, notesX, itemY);
                    
                    itemY += lineSpacing;
                });
                
                // No need to draw bottom line - the box rectangle border already provides it
            };
            
            // Track Y position for each column
            let columnY = [startY, startY]; // [left column Y, right column Y]
            
            for (let categoryIndex = 0; categoryIndex < sortedCategories.length; categoryIndex++) {
                const category = sortedCategories[categoryIndex];
                let items = itemsByCategory[category];
                
                // Process all items for this category
                let isFirstBox = true;
                while (items.length > 0) {
                    // Choose column: use left column if it's shorter or equal, otherwise use right
                    let currentCol = (columnY[0] <= columnY[1]) ? 0 : 1;
                    let currentBoxY = columnY[currentCol];
                    let currentBoxX = margin + (currentCol * (boxWidth + boxMargin));
                    
                    // Check if we need a new page
                    const pageBottom = pageHeight - margin;
                    if (currentBoxY > pageBottom - 50) { // Not enough space for even a small box
                        doc.addPage();
                        await drawBackgroundImage(doc, selectedBackground, pageWidth, pageHeight);
                        // Redraw DATE on new page
                        const currentDate = new Date().toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                        });
                        doc.setFontSize(12);
                        doc.setFont('times', 'normal');
                        doc.setTextColor(80, 80, 80);
                        const dateLabel = 'DATE';
                        const dateLabelWidth = doc.getTextWidth(dateLabel);
                        doc.text(dateLabel, pageWidth - margin - dateLabelWidth - 5, 42);
                        const dateWidth = doc.getTextWidth(currentDate);
                        doc.text(currentDate, pageWidth - margin - dateWidth - 5, 50);
                        
                        // Reset both columns to start
                        columnY = [startY, startY];
                        currentCol = 0;
                        currentBoxY = startY;
                        currentBoxX = margin;
                    }
                    
                    // Calculate available height on page (leave some margin at bottom)
                    const minSpaceAtBottom = 20;
                    const availablePageHeight = pageBottom - currentBoxY - minSpaceAtBottom;
                    
                    // Calculate how many items we can fit in available space
                    const headerSpace = 15; // Space from box top to first item
                    const bottomPadding = 0;
                    const contentHeight = availablePageHeight - headerSpace - bottomPadding;
                    const maxItemsThatFit = Math.floor((contentHeight - 2) / lineSpacing);
                    
                    // Calculate how many items we want to show (all items if they fit, or max that fit)
                    const itemsToShowCount = Math.min(items.length, maxItemsThatFit);
                    const itemsToShow = items.slice(0, itemsToShowCount);
                    const remainingItems = items.slice(itemsToShowCount);
                    
                    // Calculate box height needed ONLY for the items we're showing
                    const neededHeight = headerSpace + (itemsToShowCount * lineSpacing) + bottomPadding;
                    const actualBoxHeight = Math.min(neededHeight, availablePageHeight);
                    
                    // Draw box with the specific items
                    drawCategoryBox(category, itemsToShow, currentBoxX, currentBoxY, actualBoxHeight, !isFirstBox);
                    
                    // Update column Y position (add box height + small margin)
                    columnY[currentCol] = currentBoxY + actualBoxHeight + boxMargin;
                    
                    items = remainingItems;
                    isFirstBox = false;
                    
                    // If we have remaining items but can't fit them, we'll continue in the loop
                    // The next iteration will check available space again
                }
            }
        }

        // Save the PDF
        doc.save(`grocery-list-${new Date().toISOString().split('T')[0]}.pdf`);
        
    } catch (error) {
        console.error('Error downloading shopping list:', error);
        await macAlert('Error downloading shopping list. Please try again.');
    }
}

async function drawBackgroundImage(pdf, backgroundName, pageWidth, pageHeight) {
    // Map background names to file paths
    const backgroundMap = {
        'simple': 'Images/Backgrounds/Simple Background.png',
        'blue': 'Images/Backgrounds/Blue Background.png',
        'cream': 'Images/Backgrounds/Cream Background.png',
        'green': 'Images/Backgrounds/Green Background.png',
        'grey': 'Images/Backgrounds/Grey Background.png'
    };
    
    const backgroundPath = backgroundMap[backgroundName] || backgroundMap['simple'];
    
    try {
        // Load image and add to PDF
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        return new Promise((resolve, reject) => {
            img.onload = function() {
                try {
                    // Add image to PDF, covering the entire page
                    pdf.addImage(img, 'PNG', 0, 0, pageWidth, pageHeight);
                    resolve();
                } catch (error) {
                    console.error('Error adding image to PDF:', error);
                    // Fallback to white background
                    pdf.setFillColor(255, 255, 255);
                    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
                    resolve();
                }
            };
            
            img.onerror = function() {
                console.error('Error loading background image:', backgroundPath);
                // Fallback to white background
                pdf.setFillColor(255, 255, 255);
                pdf.rect(0, 0, pageWidth, pageHeight, 'F');
                resolve();
            };
            
            img.src = backgroundPath;
        });
    } catch (error) {
        console.error('Error setting up background image:', error);
        // Fallback to white background
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        return Promise.resolve();
    }
}

    // --- Recipes: Sort dropdown ---
    const recipesSettingsBtn = document.getElementById('recipes-settings-btn');
    const recipesSortDropdown = document.getElementById('recipes-sort-dropdown');
    const recipesSortOrderDropdown = document.getElementById('recipes-sort-order-dropdown');
    const recipesRatingDropdown = document.getElementById('recipes-rating-dropdown');
    const recipesCooktimeDropdown = document.getElementById('recipes-cooktime-dropdown');

    if (recipesSettingsBtn && recipesSortDropdown) {
        recipesSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            recipesSortDropdown.classList.toggle('hidden');
            recipesSortOrderDropdown.classList.add('hidden');
            recipesRatingDropdown.classList.add('hidden');
            recipesCooktimeDropdown.classList.add('hidden');
        });

        // Handle sort option clicks
        const sortItems = recipesSortDropdown.querySelectorAll('.sort-dropdown-item');
        sortItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                if (e.target.classList.contains('sort-order-btn')) return;
                
                e.stopPropagation();
                
                sortItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                currentSort = item.dataset.sort;
                loadRecipesWithFade();
                
                setTimeout(() => {
                    recipesSortDropdown.style.transition = 'opacity 0.2s ease';
                    recipesSortDropdown.style.opacity = '0';
                    setTimeout(() => {
                        recipesSortDropdown.classList.add('hidden');
                        recipesSortDropdown.style.opacity = '';
                        recipesSortDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle sort order button clicks
        const orderBtns = recipesSortDropdown.querySelectorAll('.sort-order-btn');
        orderBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const field = btn.dataset.field;
                currentSort = field;
                
                sortItems.forEach(i => {
                    if (i.dataset.sort === field) {
                        sortItems.forEach(j => j.classList.remove('active'));
                        i.classList.add('active');
                    }
                });
                
                recipesSortDropdown.classList.add('hidden');
                
                // Show appropriate dropdown based on field
                if (field === 'rating') {
                    recipesRatingDropdown.classList.remove('hidden');
                    const ratingOptions = recipesRatingDropdown.querySelectorAll('.sort-order-option[data-rating]');
                    ratingOptions.forEach(opt => {
                        if (currentRatingFilter && opt.dataset.rating === String(currentRatingFilter)) {
                            opt.classList.add('active');
                        } else {
                            opt.classList.remove('active');
                        }
                    });
                } else if (field === 'cooktime') {
                    recipesCooktimeDropdown.classList.remove('hidden');
                    const timeOptions = recipesCooktimeDropdown.querySelectorAll('.sort-order-option[data-time]');
                    timeOptions.forEach(opt => {
                        if (currentCooktimeFilter && opt.dataset.time === currentCooktimeFilter) {
                            opt.classList.add('active');
                        } else {
                            opt.classList.remove('active');
                        }
                    });
                } else {
                    recipesSortOrderDropdown.classList.remove('hidden');
                    const orderOptions = recipesSortOrderDropdown.querySelectorAll('.sort-order-option');
                    orderOptions.forEach(opt => {
                        if (opt.dataset.order === currentRecipeSortOrder) {
                            opt.classList.add('active');
                        } else {
                            opt.classList.remove('active');
                        }
                    });
                }
            });
        });

        // Handle order selection (Name, Date)
        const orderOptions = recipesSortOrderDropdown.querySelectorAll('.sort-order-option');
        orderOptions.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                currentRecipeSortOrder = option.dataset.order;
                
                orderOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                loadRecipesWithFade();
                
                setTimeout(() => {
                    recipesSortOrderDropdown.style.transition = 'opacity 0.2s ease';
                    recipesSortOrderDropdown.style.opacity = '0';
                    setTimeout(() => {
                        recipesSortOrderDropdown.classList.add('hidden');
                        recipesSortOrderDropdown.style.opacity = '';
                        recipesSortOrderDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle rating filter selection
        const ratingOptions = recipesRatingDropdown.querySelectorAll('.sort-order-option[data-rating]');
        ratingOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                
                currentRatingFilter = parseInt(option.dataset.rating);
                
                ratingOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                loadRecipesWithFade();
                
                setTimeout(() => {
                    recipesRatingDropdown.style.transition = 'opacity 0.2s ease';
                    recipesRatingDropdown.style.opacity = '0';
                    setTimeout(() => {
                        recipesRatingDropdown.classList.add('hidden');
                        recipesRatingDropdown.style.opacity = '';
                        recipesRatingDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle cook time filter selection
        const timeOptions = recipesCooktimeDropdown.querySelectorAll('.sort-order-option[data-time]');
        timeOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                
                currentCooktimeFilter = option.dataset.time;
                
                timeOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                loadRecipesWithFade();
                
                setTimeout(() => {
                    recipesCooktimeDropdown.style.transition = 'opacity 0.2s ease';
                    recipesCooktimeDropdown.style.opacity = '0';
                    setTimeout(() => {
                        recipesCooktimeDropdown.classList.add('hidden');
                        recipesCooktimeDropdown.style.opacity = '';
                        recipesCooktimeDropdown.style.transition = '';
                    }, 200);
                }, 300);
            });
        });

        // Handle delete sort (Name/Date dropdown)
        const deleteSort = recipesSortOrderDropdown.querySelector('.sort-order-delete');
        if (deleteSort) {
            deleteSort.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                currentSort = 'createdAt';
                currentRecipeSortOrder = 'desc';
                
                sortItems.forEach(i => i.classList.remove('active'));
                const dateItem = recipesSortDropdown.querySelector('[data-sort="date"]');
                if (dateItem) dateItem.classList.add('active');
                
                loadRecipesWithFade();
                recipesSortOrderDropdown.classList.add('hidden');
            });
        }

        // Handle clear rating filter
        const clearRating = recipesRatingDropdown.querySelector('.sort-order-delete');
        if (clearRating) {
            clearRating.addEventListener('click', (e) => {
                e.stopPropagation();
                currentRatingFilter = null;
                ratingOptions.forEach(opt => opt.classList.remove('active'));
                loadRecipesWithFade();
                recipesRatingDropdown.classList.add('hidden');
            });
        }

        // Handle clear cook time filter
        const clearCooktime = recipesCooktimeDropdown.querySelector('.sort-order-delete');
        if (clearCooktime) {
            clearCooktime.addEventListener('click', (e) => {
                e.stopPropagation();
                currentCooktimeFilter = null;
                timeOptions.forEach(opt => opt.classList.remove('active'));
                loadRecipesWithFade();
                recipesCooktimeDropdown.classList.add('hidden');
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!recipesSettingsBtn.contains(e.target) && 
                !recipesSortDropdown.contains(e.target) &&
                !recipesSortOrderDropdown.contains(e.target) &&
                !recipesRatingDropdown.contains(e.target) &&
                !recipesCooktimeDropdown.contains(e.target)) {
                recipesSortDropdown.classList.add('hidden');
                recipesSortOrderDropdown.classList.add('hidden');
                recipesRatingDropdown.classList.add('hidden');
                recipesCooktimeDropdown.classList.add('hidden');
            }
        });

        // Set initial active state
        const dateSort = recipesSortDropdown.querySelector('[data-sort="date"]');
        if (dateSort) dateSort.classList.add('active');
    }

// ================================
// SEARCH FUNCTIONALITY
// ================================
function initSearch() {
    // Recipes search
    const recipesSearchBtn = document.getElementById('recipes-search-btn');
    const recipesSearchInput = document.getElementById('recipes-search-input');
    
    if (recipesSearchBtn && recipesSearchInput) {
        recipesSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            recipesSearchInput.classList.toggle('hidden');
            if (!recipesSearchInput.classList.contains('hidden')) {
                recipesSearchInput.focus();
            } else {
                recipesSearchInput.value = '';
                filterRecipes('');
            }
        });
        
        recipesSearchInput.addEventListener('input', (e) => {
            filterRecipes(e.target.value);
        });
        
        recipesSearchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Close search on Escape
        recipesSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                recipesSearchInput.classList.add('hidden');
                recipesSearchInput.value = '';
                filterRecipes('');
            }
        });
    }
    
    // Ingredients search
    const ingredientsSearchBtn = document.getElementById('ingredients-search-btn');
    const ingredientsSearchInput = document.getElementById('ingredients-search-input');
    
    if (ingredientsSearchBtn && ingredientsSearchInput) {
        ingredientsSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ingredientsSearchInput.classList.toggle('hidden');
            if (!ingredientsSearchInput.classList.contains('hidden')) {
                ingredientsSearchInput.focus();
            } else {
                ingredientsSearchInput.value = '';
                filterIngredients('');
            }
        });
        
        ingredientsSearchInput.addEventListener('input', (e) => {
            filterIngredients(e.target.value);
        });
        
        ingredientsSearchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Close search on Escape
        ingredientsSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ingredientsSearchInput.classList.add('hidden');
                ingredientsSearchInput.value = '';
                filterIngredients('');
            }
        });
    }
    
    // Close search inputs when clicking outside
    document.addEventListener('click', (e) => {
        if (recipesSearchInput && !recipesSearchInput.classList.contains('hidden')) {
            if (!recipesSearchInput.contains(e.target) && !recipesSearchBtn.contains(e.target)) {
                recipesSearchInput.classList.add('hidden');
                recipesSearchInput.value = '';
                filterRecipes('');
            }
        }
        
        if (ingredientsSearchInput && !ingredientsSearchInput.classList.contains('hidden')) {
            if (!ingredientsSearchInput.contains(e.target) && !ingredientsSearchBtn.contains(e.target)) {
                ingredientsSearchInput.classList.add('hidden');
                ingredientsSearchInput.value = '';
                filterIngredients('');
            }
        }
    });
}

function filterRecipes(searchTerm) {
    const cards = document.querySelectorAll('.recipe-card');
    const term = searchTerm.toLowerCase().trim();
    
    cards.forEach(card => {
        const title = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
        
        if (term === '' || title.includes(term)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

function filterIngredients(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    // Check which view we're in
    const shoppingView = document.getElementById('shopping-header');
    const isShoppingView = !shoppingView?.classList.contains('hidden-view');
    
    if (isShoppingView) {
        // Filter shopping list table
        const tbody = document.getElementById('shopping-tbody');
        const rows = tbody?.querySelectorAll('tr');
        
        rows?.forEach(row => {
            // Skip the "no items" message row
            if (row.children.length === 1) return;
            
            const nameCell = row.querySelector('.ingredient-name-cell span');
            const name = nameCell?.textContent.toLowerCase() || '';
            const quantity = row.children[1]?.textContent.toLowerCase() || '';
            const category = row.children[2]?.textContent.toLowerCase() || '';
            const notes = row.children[3]?.textContent.toLowerCase() || '';
            
            if (term === '' || name.includes(term) || category.includes(term) || notes.includes(term) || quantity.includes(term)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    } else {
        // Filter ingredient groups (All view)
        const groups = document.querySelectorAll('.ingredient-group');
        
        groups.forEach(group => {
            const rows = group.querySelectorAll('tbody tr:not(.add-ingredient-row)');
            let hasVisibleRows = false;
            
            rows.forEach(row => {
                const nameCell = row.querySelector('.ingredient-name-cell span');
                const name = nameCell?.textContent.toLowerCase() || '';
                const quantity = row.children[2]?.textContent.toLowerCase() || '';
                const category = row.children[3]?.textContent.toLowerCase() || '';
                const notes = row.children[4]?.textContent.toLowerCase() || '';
                
                if (term === '' || name.includes(term) || category.includes(term) || notes.includes(term) || quantity.includes(term)) {
                    row.style.display = '';
                    hasVisibleRows = true;
                } else {
                    row.style.display = 'none';
                }
            });
            
            // Hide group if no visible rows
            if (!hasVisibleRows && term !== '') {
                group.style.display = 'none';
            } else {
                group.style.display = '';
            }
        });
    }
}

async function showShoppingView() {
    const shoppingView = document.getElementById('shopping-header');
    const allView = document.getElementById('all-ingredients-view');

    // Clear and load data while view is still hidden
    const tbody = document.getElementById('shopping-tbody');
    if (tbody) tbody.innerHTML = '';

    await loadShoppingIngredients();

    // Hide All view instantly (and clean up any inline styles)
    allView?.classList.add('hidden-view');
    allView.style.opacity = '';
    
    // Remove hidden-view but keep opacity at 0 initially
    shoppingView?.classList.remove('hidden-view');
    shoppingView.style.opacity = '0';
    
    // Force reflow to ensure position change is applied
    void shoppingView.offsetHeight;
    
    // Now fade in by removing inline opacity
    requestAnimationFrame(() => {
        shoppingView.style.opacity = '';
    });
}

function showAllIngredientsView() {
    const shoppingView = document.getElementById('shopping-header');
    const allView = document.getElementById('all-ingredients-view');

    // Hide Shopping view instantly (and clean up any inline styles)
    shoppingView?.classList.add('hidden-view');
    shoppingView.style.opacity = '';
    
    // Remove hidden-view but keep opacity at 0 initially
    allView?.classList.remove('hidden-view');
    allView.style.opacity = '0';
    
    // Force reflow
    void allView.offsetHeight;
    
    // Now fade in
    requestAnimationFrame(() => {
        allView.style.opacity = '';
    });
}


// ================================
// SIDE PANEL - OPEN NEW
// ================================
function openSidePanel(type) {
    const panel = document.getElementById('recipe-side-panel');
    const overlay = document.querySelector('.side-panel-overlay');

    if (!panel || !overlay) {
        console.error("ERROR: Side panel elements missing in DOM.");
        return;
    }

    currentDraftId = null;
    isLoadingRecipe = false;
    isCreatingDoc = false;

    document.getElementById('recipe-name').value = '';
    renderCuisineTags([]);
    
    // Clear ingredient relations
    selectedIngredientsForRecipe = [];
    updateIngredientRelationDisplay();
    const recipeMinutesEl = document.getElementById('recipe-minutes');
    const recipeServingsEl = document.getElementById('recipe-servings');
    if (recipeMinutesEl) recipeMinutesEl.value = '';
    if (recipeServingsEl) recipeServingsEl.value = '';
    document.getElementById('recipe-ingredients').value = '';
    document.getElementById('recipe-instructions').value = '';

    document.querySelectorAll('.star-input').forEach(star => {
        star.classList.remove('active');
        star.textContent = '☆';
    });

    const createdTimeEl = document.getElementById('recipe-created-time');
    if (createdTimeEl) {
        createdTimeEl.textContent = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    }

    const preview = document.getElementById('cover-image-preview');
    const coverSection = document.getElementById('cover-image-section');

    if (preview) {
        preview.src = '';
        preview.classList.remove('has-image');
    }
    if (coverSection) coverSection.classList.remove('has-image');

    panel.classList.add('open');
    document.querySelector('.side-panel-overlay').classList.add('active');
    
    // Update banner share button visibility (will show once recipe is created)
    updateBannerShareButton();
}


// ================================
// SIDE PANEL - OPEN EXISTING
// ================================
async function openExistingRecipe(id) {
    console.log("=== openExistingRecipe START ===");
    console.log("Received ID:", id);

    isLoadingRecipe = true;
    isCreatingDoc = false;
    currentDraftId = id;

    const panel = document.getElementById("recipe-side-panel");
    const overlay = document.querySelector(".side-panel-overlay");

    if (!panel) {
        console.error("ERROR: recipe-side-panel not found!");
        isLoadingRecipe = false;
        return;
    }

    panel.classList.add("open");
    if (overlay) overlay.classList.add("active");

    try {
        // Ensure cuisine tags container starts hidden to prevent flash
        const cuisineContainer = document.getElementById('cuisine-tags-container');
        if (cuisineContainer) {
            cuisineContainer.style.opacity = '0';
            cuisineContainer.style.transition = 'opacity 0.2s ease';
        }

        const doc = await db.collection("recipes").doc(id).get();
        const r = doc.data();

        if (!r) {
            console.error("No recipe found:", id);
            isLoadingRecipe = false;
            return;
        }

        document.getElementById("recipe-name").value = r.title || "";
        // Handle cuisines (can be string or array for backward compatibility)
        const cuisines = r.cuisines || (r.cuisine ? [r.cuisine] : []);
        // Render cuisine tags with fade (will skip fade-out if container is empty)
        await renderCuisineTags(cuisines);
        const recipeMinutesEl = document.getElementById("recipe-minutes");
        const recipeServingsEl = document.getElementById("recipe-servings");
        if (recipeMinutesEl) recipeMinutesEl.value = r.minutes || "";
        if (recipeServingsEl) recipeServingsEl.value = r.servings || "";
        document.getElementById("recipe-ingredients").value = r.ingredients || "";
        document.getElementById("recipe-instructions").value = r.instructions || "";

        const createdTimeEl = document.getElementById('recipe-created-time');
        if (createdTimeEl && r.createdAt) {
            createdTimeEl.textContent = r.createdAt.toDate().toLocaleString();
        }

        const stars = document.querySelectorAll('.star-input');
        stars.forEach(s => {
            const val = parseInt(s.dataset.rating);
            if (val <= (r.rating || 0)) {
                s.classList.add("active");
                s.textContent = "★";
            } else {
                s.classList.remove("active");
                s.textContent = "☆";
            }
        });

        const preview = document.getElementById("cover-image-preview");
        const coverSection = document.getElementById("cover-image-section");

        if (preview && coverSection) {
            if (r.imageUrl) {
                preview.src = r.imageUrl;
                preview.classList.add("has-image");
                coverSection.classList.add("has-image");
                preview.style.top = r.imagePosition?.top || "0px";
            } else {
                preview.src = "";
                preview.classList.remove("has-image");
                coverSection.classList.remove("has-image");
            }
        }

        // Load related ingredients
        selectedIngredientsForRecipe = r.relatedIngredients || [];
        updateIngredientRelationDisplay();

    } catch (err) {
        console.error("Error loading recipe:", err);
    }

    isLoadingRecipe = false;
    
    // Update banner share button visibility
    updateBannerShareButton();
}


// ================================
// STAR RATING
// ================================
function initSidePanel() {
    const stars = document.querySelectorAll('.star-input');

    stars.forEach(star => {
        star.onclick = function () {
            const rating = parseInt(this.dataset.rating);

            stars.forEach(s => {
                const val = parseInt(s.dataset.rating);
                if (val <= rating) {
                    s.classList.add("active");
                    s.textContent = "★";
                } else {
                    s.classList.remove("active");
                    s.textContent = "☆";
                }
            });

            autoSave("rating", rating);
        };
    });

    initCoverImage();
    initIngredientImageUpload();
}


// ================================
// AUTOSAVE INPUTS
// ================================
function initAutoSaveInputs() {
    const recipeName = document.getElementById("recipe-name");
    const recipeCuisines = document.getElementById("recipe-cuisines");
    const recipeMinutes = document.getElementById("recipe-minutes");
    const recipeServings = document.getElementById("recipe-servings");
    const recipeIngredients = document.getElementById("recipe-ingredients");
    const recipeInstructions = document.getElementById("recipe-instructions");

    if (recipeName) recipeName.addEventListener("input", e => autoSave("title", e.target.value));
    // Initialize cuisine tags functionality
    initCuisineTags();
    if (recipeMinutes) recipeMinutes.addEventListener("input", e => autoSave("minutes", parseInt(e.target.value) || 0));
    if (recipeServings) recipeServings.addEventListener("input", e => autoSave("servings", parseInt(e.target.value) || 0));
    if (recipeIngredients) recipeIngredients.addEventListener("input", e => autoSave("ingredients", e.target.value));
    if (recipeInstructions) recipeInstructions.addEventListener("input", e => autoSave("instructions", e.target.value));
}

// ================================
// CUISINE TAGS (MULTIPLE CUISINES)
// ================================
function initCuisineTags() {
    const addBtn = document.getElementById('cuisine-add-btn');
    const container = document.getElementById('cuisine-tags-container');
    
    if (addBtn && container) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCuisineDropdown();
        });
    }
}

async function openCuisineDropdown() {
    const dropdown = document.getElementById('cuisine-dropdown');
    const overlay = document.getElementById('recipe-dropdown-overlay');
    const addBtn = document.getElementById('cuisine-add-btn');
    
    if (!dropdown || !overlay || !addBtn) return;
    
    // Ensure dropdown starts completely hidden
    dropdown.style.display = 'none';
    overlay.style.display = 'none';
    dropdown.style.opacity = '0';
    overlay.style.opacity = '0';
    
    // Position dropdown relative to the add button
    const rect = addBtn.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 8) + 'px';
    dropdown.style.right = (window.innerWidth - rect.right) + 'px';
    dropdown.style.width = '600px';
    
    // Load cuisines first (this clears and rebuilds content)
    await loadCuisinesForDropdown();
    
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

async function renderCuisineTags(cuisines) {
    const container = document.getElementById('cuisine-tags-container');
    if (!container) return;
    
    // Check if there's existing content to fade out
    // Only fade out if there's content AND it's currently visible
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
    
    if (!cuisines || cuisines.length === 0) {
        container.style.minHeight = '';
        container.style.opacity = '';
        container.style.transition = '';
        return;
    }
    
    // Handle both old format (names) and new format (objects with id/name)
    const user = auth.currentUser;
    let cuisineMap = {}; // Map cuisine IDs to names
    
    if (user) {
        // Get workspace filter
        const workspaceFilter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal', userId: user.uid };
        
        // Build query based on workspace type
        let cuisinesQuery;
        if (workspaceFilter.type === 'personal') {
            cuisinesQuery = db.collection("cuisines").where("userId", "==", user.uid);
        } else {
            cuisinesQuery = db.collection("cuisines").where("teamspaceId", "==", workspaceFilter.teamspaceId);
        }
        
        const snapshot = await cuisinesQuery.get();
        snapshot.forEach(doc => {
            cuisineMap[doc.id] = doc.data().name;
        });
    }
    
    cuisines.forEach((cuisine, index) => {
        // Handle backward compatibility: cuisine can be string (name) or object {id, name}
        const cuisineName = typeof cuisine === 'string' ? cuisine : (cuisine.name || cuisineMap[cuisine.id] || 'Unknown');
        const cuisineId = typeof cuisine === 'string' ? null : cuisine.id;
        
        const tag = document.createElement('div');
        tag.classList.add('cuisine-tag');
        tag.dataset.cuisineId = cuisineId || '';
        tag.innerHTML = `
            <span>${escapeHtml(cuisineName)}</span>
            <button class="cuisine-tag-remove" data-index="${index}">×</button>
        `;
        
        const removeBtn = tag.querySelector('.cuisine-tag-remove');
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await removeCuisineTag(index);
        });
        
        container.appendChild(tag);
    });
    
    // Remove min-height after content is loaded
    container.style.minHeight = '';
    
    // Force reflow
    void container.offsetHeight;
    
    // Fade back in
    requestAnimationFrame(() => {
        container.style.opacity = '';
    });
}

async function addCuisineTag(cuisineData) {
    const container = document.getElementById('cuisine-tags-container');
    if (!container) return;
    
    // Handle both string (name) and object (id/name) formats
    const cuisineName = typeof cuisineData === 'string' ? cuisineData : cuisineData.name;
    const cuisineId = typeof cuisineData === 'string' ? null : cuisineData.id;
    
    // Get current cuisines
    const currentCuisines = getCurrentCuisines();
    
    // Don't add if already exists (check by name for backward compatibility, or by ID if available)
    const currentNames = currentCuisines.map(c => typeof c === 'string' ? c : c.name);
    if (currentNames.includes(cuisineName)) {
        return;
    }
    
    // Add the new cuisine (store as object with id and name if ID is available)
    const cuisineToAdd = cuisineId ? { id: cuisineId, name: cuisineName } : cuisineName;
    currentCuisines.push(cuisineToAdd);
    
    // Render tags
    await renderCuisineTags(currentCuisines);
    
    // Save to Firebase (store IDs if available, otherwise names for backward compatibility)
    await autoSave("cuisines", currentCuisines);
    
    // Update all cuisine counts
    await updateAllCuisineCounts();
}

async function removeCuisineTag(index) {
    const currentCuisines = getCurrentCuisines();
    const removedCuisine = currentCuisines[index];
    
    // Remove the cuisine
    currentCuisines.splice(index, 1);
    
    // Render tags
    renderCuisineTags(currentCuisines);
    
    // Save to Firebase
    await autoSave("cuisines", currentCuisines);
    
    // Update all cuisine counts
    await updateAllCuisineCounts();
}

function getCurrentCuisines() {
    const container = document.getElementById('cuisine-tags-container');
    if (!container) return [];
    
    const tags = container.querySelectorAll('.cuisine-tag');
    return Array.from(tags).map(tag => {
        const cuisineId = tag.dataset.cuisineId;
        const cuisineName = tag.querySelector('span').textContent.trim();
        // Return object with id and name if ID exists, otherwise just name for backward compatibility
        return cuisineId ? { id: cuisineId, name: cuisineName } : cuisineName;
    });
}

// ================================
// COVER IMAGE
// ================================
function initCoverImage() {
    const coverSection = document.getElementById("cover-image-section");
    const preview = document.getElementById("cover-image-preview");
    const placeholder = document.getElementById("cover-image-placeholder");
    const modalOverlay = document.getElementById("image-modal-overlay");
    const fileInput = document.getElementById("cover-image-input");
    const uploadFileBtn = document.getElementById("upload-file-btn");
    const urlInput = document.getElementById("image-url-input");
    const urlSubmitBtn = document.getElementById("url-submit-btn");
    const changeCoverBtn = document.getElementById("change-cover-btn");
    const removeCoverBtn = document.getElementById("remove-cover-btn");
    const repositionBtn = document.getElementById("reposition-btn");
    const tabs = document.querySelectorAll(".modal-tab");

    preview.style.position = "absolute";
    preview.style.left = "50%";
    preview.style.top = "0px";
    preview.style.transform = "translateX(-50%)";
    preview.style.userSelect = "none";
    preview.style.cursor = "grab";

    let repositionMode = false;
    let startY = 0;
    let startTop = 0;
    let savedTop = "0px";

    function clampPosition(top) {
        const imageHeight = preview.offsetHeight;
        const containerHeight = coverSection.offsetHeight;
        const maxDown = containerHeight - imageHeight;

        if (top > 0) return 0;
        if (top < maxDown) return maxDown;
        return top;
    }

    function enterRepositionMode() {
        repositionMode = true;
        coverSection.classList.add("reposition-active");
        changeCoverBtn.textContent = "Save position";
        repositionBtn.textContent = "Cancel";
        startTop = parseFloat(preview.style.top || "0px");
        savedTop = startTop + "px";
    }

    function exitRepositionMode(apply) {
        repositionMode = false;
        coverSection.classList.remove("reposition-active");

        if (!apply) preview.style.top = savedTop;
        else autoSave("imagePosition", { top: preview.style.top });

        changeCoverBtn.textContent = "Change cover";
        repositionBtn.textContent = "Reposition";
    }

    if (repositionBtn) {
        repositionBtn.addEventListener("click", e => {
            e.stopPropagation();
            if (!repositionMode) enterRepositionMode();
            else exitRepositionMode(false);
        });
    }

    if (changeCoverBtn) {
        changeCoverBtn.addEventListener("click", e => {
            if (repositionMode) {
                exitRepositionMode(true);
            } else {
                e.stopPropagation();
                modalOverlay.classList.remove("hidden");
            }
        });
    }

    preview.addEventListener("mousedown", e => {
        if (!repositionMode) return;

        e.preventDefault();
        preview.style.cursor = "grabbing";
        startY = e.clientY;
        startTop = parseFloat(preview.style.top || "0px");

        function onMove(ev) {
            if (!repositionMode) return;
            const dy = ev.clientY - startY;
            let newTop = startTop + dy;
            newTop = clampPosition(newTop);
            preview.style.top = `${newTop}px`;
        }

        function endMove() {
            preview.style.cursor = "grab";
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", endMove);
        }

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", endMove);
    });

    if (placeholder) placeholder.onclick = () => modalOverlay.classList.remove("hidden");

    tabs.forEach(tab => {
        tab.onclick = function () {
            const target = this.dataset.tab;

            tabs.forEach(t => t.classList.remove("active"));
            this.classList.add("active");

            document.querySelectorAll(".modal-tab-content")
                .forEach(c => c.classList.remove("active"));

            document.getElementById(target + "-tab").classList.add("active");
        };
    });

    if (uploadFileBtn) uploadFileBtn.onclick = () => fileInput.click();

    if (fileInput) {
        fileInput.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            // Compress image before saving
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                
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
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress with quality adjustment
                let quality = 0.7;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                
                // If still too large, reduce quality
                while (dataUrl.length > 900000 && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                
                preview.src = dataUrl;
                preview.classList.add("has-image");
                coverSection.classList.add("has-image");
                modalOverlay.classList.add("hidden");
                autoSave("imageUrl", dataUrl);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                alert('Error loading image. Please try again.');
            };
            
            img.src = objectUrl;
        };
    }

    if (urlSubmitBtn) {
        urlSubmitBtn.onclick = () => {
            const url = urlInput.value.trim();
            if (!url) return;

            preview.src = url;
            preview.classList.add("has-image");
            coverSection.classList.add("has-image");
            urlInput.value = "";
            modalOverlay.classList.add("hidden");

            autoSave("imageUrl", url);
        };
    }

    if (removeCoverBtn) {
        removeCoverBtn.onclick = () => {
            preview.src = "";
            preview.classList.remove("has-image");
            coverSection.classList.remove("has-image");
            modalOverlay.classList.add("hidden");
            autoSave("imageUrl", "");
        };
    }

    if (modalOverlay) {
        modalOverlay.onclick = e => {
            if (e.target === modalOverlay) modalOverlay.classList.add("hidden");
        };
    }
}


// ================================
// ACCOUNT BUTTON
// ================================
function initAccountButton() {
    const accountBtn = document.getElementById('account-btn');
  
    if (accountBtn) {
      accountBtn.addEventListener('click', () => {
          window.location.href = '/account.html';
      });
    }
}



// ================================
// LOGIN
// ================================
el("google-login").onclick = () => {
    auth.signInWithPopup(provider).catch(err => console.error("Login error:", err));
};


// ================================
// AUTH LISTENER
// ================================
auth.onAuthStateChanged(user => {
    document.body.classList.remove('auth-checking'); // Add this line

    const login = document.getElementById("login-screen");
    const app = document.getElementById("app");

    if (user) {
        login.classList.add("hidden");
        app.classList.remove("hidden");

        // Store current user globally
        currentUser = user;

        initNavigation();
        initDropdowns();
        initSearch();
        initSidePanel();
        initAutoSaveInputs();
        initActionButtons();
        initIconPicker();
        initShareFunctionality(); // Initialize share functionality
        initAccountButton(); // Initialize account button
        initWorkspaceSidebar(); // Initialize workspace sidebar
        loadRecipes();
        loadCuisines('order', 'desc'); // Sort by order by default (descending = 1, 2, 3...)
        loadIngredientGroups();
        initNewGroupButton();
        updateFavoritesCount(); // Update Favorites count on initial load

    } else {
        login.classList.remove("hidden");
        app.classList.add("hidden");
    }
});



// ================================
// LOGOUT
// ================================
el("logout-btn").onclick = () => auth.signOut();


// ================================
// SORTING
// ================================
let currentSort = "createdAt";
let currentRecipeSortOrder = "desc"; // Default to newest first
let currentRatingFilter = null;
let currentCooktimeFilter = null;

el("sort-select")?.addEventListener("change", (e) => {
    currentSort = e.target.value;
    loadRecipes();
});

// ================================
// SHARE RECIPE FUNCTIONALITY
// ================================
let currentRecipeToShare = null;
let currentShareLink = '';

// Get the base URL for sharing (adjust this to your deployed URL)
const getBaseUrl = () => {
    // IMPORTANT: Update this with your Firebase Hosting URL before deploying!
    // Example: 'https://recipe-book-abc123.web.app'
    // 
    // To find your URL:
    // 1. Go to Firebase Console ? Hosting
    // 2. Look for your site URL
    // 3. Replace the line below with: return 'https://YOUR-PROJECT.web.app';
    
    // Temporary: Uses current origin (works for local testing)
    const currentOrigin = window.location.origin;
    
    // Auto-detect if we're on localhost
    if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
        console.warn('?? WARNING: Share links will use localhost and won\'t work on other devices!');
        console.warn('?? Deploy to Firebase and update getBaseUrl() in app.js');
    }
    
    return currentOrigin;
    
    // AFTER DEPLOYING: Replace the line above with your actual URL like this:
    // return 'https://your-project.web.app';
};

// Update banner share button visibility - show on homepage for "Add to Home Screen"
function updateBannerShareButton() {
    const bannerShareBtn = document.getElementById('banner-share-btn');
    if (!bannerShareBtn) return;
    
    // Check if app is already installed (running in standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone || 
                        document.referrer.includes('android-app://');
    
    if (isStandalone) {
        // App is already installed, hide the button
        bannerShareBtn.style.display = 'none';
        return;
    }
    
    // Hide button when recipe panel is open (to avoid confusion)
    const panel = document.getElementById('recipe-side-panel');
    const isPanelOpen = panel && panel.classList.contains('open');
    
    if (isPanelOpen) {
        bannerShareBtn.style.display = 'none';
    } else {
        // Show button on homepage for adding to home screen
        bannerShareBtn.style.display = 'block';
    }
}

// Initialize share functionality
function initShareFunctionality() {
    console.log('Initializing share functionality...');
    
    // Share button click handler function
    const handleShareClick = async () => {
        console.log('Share button clicked!');
        if (!currentDraftId) {
            alert('Please open a recipe first');
            return;
        }

        try {
            // Get the current recipe data
            const doc = await db.collection("recipes").doc(currentDraftId).get();
            const recipe = doc.data();
            
            if (!recipe) {
                alert('Recipe not found');
                return;
            }

            currentRecipeToShare = {
                id: currentDraftId,
                ...recipe
            };

            // Generate the share link
            currentShareLink = `${getBaseUrl()}/recipe-view.html?id=${currentDraftId}`;
            
            // Set the link in the input
            document.getElementById('share-link-input').value = currentShareLink;

            // Show the share modal
            document.getElementById('share-modal-overlay').classList.remove('hidden');
            document.getElementById('share-modal').classList.remove('hidden');
        } catch (err) {
            console.error('Error loading recipe for sharing:', err);
            alert('Error loading recipe');
        }
    };

    // Open share modal - side panel button
    const shareBtn = document.getElementById('share-recipe-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', handleShareClick);
    }
    
    // Banner button (mobile) - "Add to Home Screen" functionality
    const bannerShareBtn = document.getElementById('banner-share-btn');
    if (bannerShareBtn) {
        // Check if app is already installed (running in standalone mode)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                            window.navigator.standalone || 
                            document.referrer.includes('android-app://');
        
        if (isStandalone) {
            // App is already installed, hide the button
            bannerShareBtn.style.display = 'none';
        } else {
            // Show button and add click handler
            bannerShareBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Banner share button clicked - Add to Home Screen');
                
                // Show instructions for adding to home screen
                showAddToHomeScreenInstructions();
            });
        }
    }
    
    // Initial update of banner share button visibility
    updateBannerShareButton();
    
    // Account button - navigate to account page
    const accountBtn = document.getElementById('account-btn');
    if (accountBtn) {
        accountBtn.addEventListener('click', () => {
            window.location.href = '/account.html';
        });
    }
    
    // Close share modal
    const closeBtn = document.getElementById('share-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            console.log('Close button clicked!');
            document.getElementById('share-modal-overlay').classList.add('hidden');
            document.getElementById('share-modal').classList.add('hidden');
        });
    }

    const overlay = document.getElementById('share-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            document.getElementById('share-modal-overlay').classList.add('hidden');
            document.getElementById('share-modal').classList.add('hidden');
        });
    }

    // Copy link to clipboard
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            console.log('Copy button clicked!');
            const input = document.getElementById('share-link-input');
            
            try {
                await navigator.clipboard.writeText(input.value);
                
                // Visual feedback
                const btn = document.getElementById('copy-link-btn');
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.background = '#10b981';
                
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                }, 2000);
            } catch (err) {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
                alert('Link copied to clipboard!');
            }
        });
    }

    // Share via Messages (SMS)
    const messagesBtn = document.getElementById('share-via-messages');
    if (messagesBtn) {
        messagesBtn.addEventListener('click', () => {
            console.log('Messages button clicked!');
            if (!currentRecipeToShare || !currentShareLink) return;

            const recipe = currentRecipeToShare;
            const messageText = `Check out this recipe: ${recipe.title || 'Recipe'}\n${currentShareLink}`;
            
            // Create SMS link (works on mobile devices)
            const smsLink = `sms:?body=${encodeURIComponent(messageText)}`;
            window.location.href = smsLink;
        });
    }

    // Share via Email
    const emailBtn = document.getElementById('share-via-email');
    if (emailBtn) {
        emailBtn.addEventListener('click', () => {
            console.log('Email button clicked!');
            if (!currentRecipeToShare || !currentShareLink) {
                console.error('No recipe or link available');
                return;
            }

            const recipe = currentRecipeToShare;
            const subject = `Recipe: ${recipe.title || 'Untitled Recipe'}`;
            const body = `Hi!\n\nI wanted to share this recipe with you: ${recipe.title || 'Recipe'}\n\nView it here:\n${currentShareLink}\n\nEnjoy!`;
            
            // Create mailto link
            const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            
            console.log('Opening email with:', mailtoLink);
            
            // Try to open email
            try {
                window.location.href = mailtoLink;
                
                // If mailto doesn't work, show fallback after a delay
                setTimeout(() => {
                    if (confirm('Email not opening? Would you like to copy the message instead?')) {
                        const messageText = `${subject}\n\n${body}`;
                        navigator.clipboard.writeText(messageText).then(() => {
                            alert('Message copied! Paste it into your email app.');
                        }).catch(() => {
                            // Fallback to textarea method
                            const textarea = document.createElement('textarea');
                            textarea.value = messageText;
                            document.body.appendChild(textarea);
                            textarea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textarea);
                            alert('Message copied! Paste it into your email app.');
                        });
                    }
                }, 2000);
            } catch (err) {
                console.error('Email error:', err);
                alert('Could not open email. Please use "Copy Link" instead and paste into your email manually.');
            }
        });
    }

    // Download as PDF
    const pdfBtn = document.getElementById('share-download-pdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => {
            console.log('PDF button clicked!');
            if (!currentRecipeToShare) return;
            generateRecipePDF(currentRecipeToShare);
        });
    }
    
    console.log('Share functionality initialized!');
}

// Show instructions for adding app to home screen
function showAddToHomeScreenInstructions() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    let message = '';
    
    if (isIOS) {
        if (isSafari) {
            message = '📱 Add Recipe Book to Home Screen:\n\n' +
                      '1. Look at the bottom of your screen\n' +
                      '2. Tap the Share button (square with arrow pointing up)\n' +
                      '3. Scroll down in the share menu\n' +
                      '4. Tap "Add to Home Screen"\n' +
                      '5. Tap "Add" in the top right\n\n' +
                      '✨ The app icon will appear on your home screen!\n' +
                      'When you tap it, Recipe Book opens in full-screen mode.';
        } else {
            message = '⚠️ Please use Safari to add Recipe Book to your home screen:\n\n' +
                      '1. Open this page in Safari (not Chrome)\n' +
                      '2. Tap the Share button at the bottom\n' +
                      '3. Tap "Add to Home Screen"\n' +
                      '4. Tap "Add"\n\n' +
                      'Safari is required for "Add to Home Screen" on iPhone/iPad.';
        }
    } else if (isAndroid) {
        message = '📱 Add Recipe Book to Home Screen:\n\n' +
                  '1. Tap the menu button (three dots) in the top right\n' +
                  '2. Tap "Add to Home screen" or "Install app"\n' +
                  '3. Tap "Add" or "Install" to confirm\n\n' +
                  '✨ The app will appear on your home screen!';
    } else {
        message = '📱 Add Recipe Book to Home Screen:\n\n' +
                  'On iPhone/iPad (Safari only):\n' +
                  '1. Tap Share button (bottom of screen)\n' +
                  '2. Tap "Add to Home Screen"\n' +
                  '3. Tap "Add"\n\n' +
                  'On Android:\n' +
                  '1. Tap menu (three dots)\n' +
                  '2. Tap "Add to Home screen"\n' +
                  '3. Confirm\n\n' +
                  '✨ The app icon will appear on your home screen!';
    }
    
    alert(message);
}

// generateRecipePDF lives in cookbook.js so the single recipe and the
// full cookbook share one page layout

// ================================
// ACCOUNT MODAL (Notion-style)
// ================================
function openAccountModal() {
    const overlay = document.getElementById('account-overlay');
    const modal = document.getElementById('account-modal');
  
    if (!overlay || !modal) {
      console.error('Account modal elements not found');
      return;
    }
  
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
  
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      modal.classList.add('active');
    });
  
    document.body.style.overflow = 'hidden';
  }
  
  function closeAccountModal() {
    const overlay = document.getElementById('account-overlay');
    const modal = document.getElementById('account-modal');
  
    overlay.classList.remove('active');
    modal.classList.remove('active');
  
    setTimeout(() => {
      overlay.classList.add('hidden');
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }, 200);
}/* ==========================================
   WORKSPACE SIDEBAR JAVASCRIPT
   ========================================== */

// Global state
let workspaceSidebarOpen = false;
let workspaceSearchOpen = false;

// Initialize workspace sidebar
function initWorkspaceSidebar() {
    console.log('🚀 Initializing workspace sidebar...');
    
    const menuBtn = document.getElementById('workspace-menu-btn');
    const sidebar = document.getElementById('workspace-sidebar');
    const overlay = document.getElementById('workspace-sidebar-overlay');
    const searchBtn = document.getElementById('workspace-search-btn');
    const searchModal = document.getElementById('workspace-search-modal');
    const searchClose = document.getElementById('workspace-search-modal-close');
    const searchInput = document.getElementById('workspace-search-input');
    const addTeamspaceBtn = document.getElementById('workspace-add-teamspace');
    
    // Open sidebar
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            workspaceSidebarOpen = true;
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Close sidebar
    if (overlay) {
        overlay.addEventListener('click', closeWorkspaceSidebar);
    }
    
    // Open search modal
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            openWorkspaceSearch();
        });
    }
    
    // Close search modal
    if (searchClose) {
        searchClose.addEventListener('click', closeWorkspaceSearch);
    }
    
    // Search input
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            performWorkspaceSearch(query);
        });
    }
    
    // Add teamspace button
    if (addTeamspaceBtn) {
        addTeamspaceBtn.addEventListener('click', () => {
            closeWorkspaceSidebar();
            // Open account page teamspaces tab
            window.location.href = 'account.html#teamspaces';
        });
    }
    
    // Edit button - opens account page
    const editBtn = document.getElementById('workspace-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            closeWorkspaceSidebar();
            window.location.href = 'account.html';
        });
    }
    
    // Dropdown button (for future use)
    const dropdownBtn = document.getElementById('workspace-dropdown-btn');
    if (dropdownBtn) {
        dropdownBtn.addEventListener('click', () => {
            console.log('Dropdown clicked - feature coming soon');
        });
    }
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (workspaceSearchOpen) {
                closeWorkspaceSearch();
            } else if (workspaceSidebarOpen) {
                closeWorkspaceSidebar();
            }
        }
    });
    
    // Personal workspace click handler
    const personalItem = document.getElementById('workspace-personal-item');
    if (personalItem) {
        personalItem.addEventListener('click', () => {
            switchWorkspace('personal');
        });
    }
    
    // Load workspace data
    loadWorkspaceData();
    
    console.log('✅ Workspace sidebar initialized');
}

// Close workspace sidebar
function closeWorkspaceSidebar() {
    workspaceSidebarOpen = false;
    const sidebar = document.getElementById('workspace-sidebar');
    const overlay = document.getElementById('workspace-sidebar-overlay');
    
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Open workspace search modal
function openWorkspaceSearch() {
    workspaceSearchOpen = true;
    const searchModal = document.getElementById('workspace-search-modal');
    const searchInput = document.getElementById('workspace-search-input');
    
    searchModal.classList.add('active');
    searchInput.focus();
}

// Close workspace search modal
function closeWorkspaceSearch() {
    workspaceSearchOpen = false;
    const searchModal = document.getElementById('workspace-search-modal');
    const searchInput = document.getElementById('workspace-search-input');
    
    searchModal.classList.remove('active');
    searchInput.value = '';
    document.getElementById('workspace-search-results').innerHTML = '<div class="workspace-search-empty">Start typing to search...</div>';
}

// Load workspace data
async function loadWorkspaceData() {
    if (!currentUser) {
        console.log('⏳ Waiting for user to load...');
        return;
    }
    
    console.log('📊 Loading workspace data...');
    
    // Update username in header
    const workspaceUsername = document.getElementById('workspace-username');
    if (workspaceUsername && currentUser.displayName) {
        workspaceUsername.textContent = `${currentUser.displayName}'s Personal`;
    }
    
    // Update avatar with user photo or keep default
    const workspaceAvatar = document.getElementById('workspace-avatar');
    if (workspaceAvatar) {
        if (currentUser.photoURL) {
            workspaceAvatar.innerHTML = `<img src="${safeImageSrc(currentUser.photoURL)}" style="width: 100%; height: 100%; border-radius: 4px; object-fit: cover;">`;
        } else {
            // Keep default person icon
            workspaceAvatar.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            `;
        }
    }
    
    // Update workspace name from Firestore or use default
    const personalTitle = document.getElementById('workspace-personal-title');
    if (personalTitle) {
        try {
            const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
            if (userDoc.exists) {
                await removeStoredEmail(currentUser.uid, userDoc.data());
            }
            if (userDoc.exists && userDoc.data().workspaceName) {
                personalTitle.textContent = userDoc.data().workspaceName;
            } else {
                personalTitle.textContent = 'My Recipe Book';
            }
        } catch (error) {
            console.error('Error loading workspace name:', error);
            personalTitle.textContent = 'My Recipe Book';
        }
    }
    
    // Load teamspaces
    await loadWorkspaceTeamspaces();
}

// Load workspace teamspaces
async function loadWorkspaceTeamspaces() {
    const teamspacesContainer = document.getElementById('workspace-teamspaces');
    if (!teamspacesContainer) return;
    
    try {
        const teamspacesSnapshot = await firebase.firestore().collection('teamspaces')
            .where('memberIds', 'array-contains', currentUser.uid)
            .get();
        
        if (teamspacesSnapshot.empty) {
            teamspacesContainer.innerHTML = '<div style="padding: 10px; font-size: 13px; color: #999;">No teamspaces yet</div>';
            return;
        }
        
        let html = '';
        teamspacesSnapshot.forEach(doc => {
            const teamspace = doc.data();
            const teamspaceId = doc.id;
            
            // Simple item matching the personal workspace styling (no nested pages)
            // Added data-teamspace-id for tracking and onclick for workspace switching
            html += `
                <div class="workspace-item" data-teamspace-id="${escapeHtml(teamspaceId)}" data-teamspace-name="${escapeHtml(teamspace.name)}">
                    <span class="workspace-item-icon">🏠</span>
                    <span class="workspace-item-name">${escapeHtml(teamspace.name)}</span>
                </div>
            `;
        });
        
        teamspacesContainer.innerHTML = html;

        // Wire up clicks here instead of building onclick strings out of
        // teamspace names, which other people control
        teamspacesContainer.querySelectorAll('.workspace-item[data-teamspace-id]').forEach(item => {
            item.addEventListener('click', () => {
                switchWorkspace('teamspace', item.dataset.teamspaceId, item.dataset.teamspaceName);
            });
        });
        
        // Update active state after loading
        updateActiveWorkspaceUI();
        
    } catch (error) {
        console.error('Error loading teamspaces:', error);
        teamspacesContainer.innerHTML = '<div style="padding: 10px; font-size: 13px; color: #999;">Error loading teamspaces</div>';
    }
}

// Toggle teamspace expansion
function toggleWorkspaceTeamspace(teamspaceId) {
    const chevron = document.getElementById(`chevron-${teamspaceId}`);
    const pages = document.getElementById(`pages-${teamspaceId}`);
    
    if (chevron && pages) {
        chevron.classList.toggle('expanded');
        pages.classList.toggle('expanded');
    }
}

// Navigate to workspace item
function navigateToWorkspaceItem(type, id) {
    console.log(`📍 Navigating to ${type}: ${id}`);
    
    closeWorkspaceSidebar();
    
    // Navigation logic based on type
    switch(type) {
        case 'recipe':
            // Navigate to recipe view
            window.location.href = `recipe-view.html?id=${id}`;
            break;
        case 'page':
            // Navigate to specific page (would need implementation)
            console.log('Page navigation not implemented yet');
            break;
        case 'teamspace-page':
            // Navigate to teamspace page
            console.log('Teamspace page navigation not implemented yet');
            break;
        default:
            console.log('Unknown navigation type');
    }
}

// Perform workspace search
async function performWorkspaceSearch(query) {
    const resultsContainer = document.getElementById('workspace-search-results');
    
    if (!query) {
        resultsContainer.innerHTML = '<div class="workspace-search-empty">Start typing to search...</div>';
        return;
    }
    
    console.log('🔍 Searching for:', query);
    
    // Search across recipes, cuisines, ingredients, teamspaces
    const results = {
        recipes: [],
        cuisines: [],
        ingredients: [],
        teamspaces: []
    };
    
    // Search recipes
    try {
        const recipesSnapshot = await firebase.firestore().collection('recipes')
            .where('userId', '==', currentUser.uid)
            .get();
        
        recipesSnapshot.forEach(doc => {
            const recipe = doc.data();
            if (recipe.name && recipe.name.toLowerCase().includes(query.toLowerCase())) {
                results.recipes.push({
                    id: doc.id,
                    name: recipe.name,
                    icon: '🍴',
                    path: 'Recipes'
                });
            }
        });
    } catch (error) {
        console.error('Error searching recipes:', error);
    }
    
    // Display results
    displayWorkspaceSearchResults(results, query);
}

// Display workspace search results
function displayWorkspaceSearchResults(results, query) {
    const resultsContainer = document.getElementById('workspace-search-results');
    
    const totalResults = results.recipes.length + results.cuisines.length + 
                         results.ingredients.length + results.teamspaces.length;
    
    if (totalResults === 0) {
        resultsContainer.innerHTML = `<div class="workspace-search-empty">No results found for "${escapeHtml(query)}"</div>`;
        return;
    }
    
    let html = '';
    
    // Recipes
    if (results.recipes.length > 0) {
        html += '<div class="workspace-search-result-group">';
        html += '<div class="workspace-search-result-group-title">RECIPES</div>';
        results.recipes.forEach(recipe => {
            html += `
                <div class="workspace-search-result-item" onclick="navigateToWorkspaceItem('recipe', '${recipe.id}'); closeWorkspaceSearch();">
                    <span class="workspace-search-result-icon">${recipe.icon}</span>
                    <div class="workspace-search-result-content">
                        <div class="workspace-search-result-title">${escapeHtml(recipe.name)}</div>
                        <div class="workspace-search-result-path">${recipe.path}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    resultsContainer.innerHTML = html;
}

// Make functions globally available
window.toggleWorkspaceTeamspace = toggleWorkspaceTeamspace;
window.navigateToWorkspaceItem = navigateToWorkspaceItem;
window.closeWorkspaceSearch = closeWorkspaceSearch;