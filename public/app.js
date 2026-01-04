// ================================================================
// RECIPE BOOK - MAIN APP
// ================================================================
// Core: Firebase, Auth, Navigation, Search, UI Components

// ================================
// FIREBASE REFERENCES
// ================================
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const provider = new firebase.auth.GoogleAuthProvider();

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

            const isRecipeBtn = wrapper.querySelector('#recipes-new-btn');
            const isIngredientBtn = wrapper.querySelector('#ingredients-new-btn');

            if (isRecipeBtn) {
                if (action === 'From Scratch') openSidePanel('recipe');
            } 
            else if (isIngredientBtn) {
                if (action === 'Upload') openIngredientPanel();
                else if (action === 'From Scratch') openIngredientPanel();
            } 
            else {
                // ⭐ THIS IS CUISINES ⭐
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

        // Handle sort order button clicks (⌄)
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

        // Handle sort order button clicks (⌄)
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
        const snapshot = await db.collection("cuisines")
            .where("userId", "==", user.uid)
            .get();
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
            <span>${cuisineName}</span>
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
// LOGIN
// ================================
el("google-login").onclick = () => {
    auth.signInWithPopup(provider).catch(err => console.error("Login error:", err));
};


// ================================
// AUTH LISTENER
// ================================
auth.onAuthStateChanged(user => {
    const login = document.getElementById("login-screen");
    const app = document.getElementById("app");

    if (user) {
        login.classList.add("hidden");
        app.classList.remove("hidden");

        initNavigation();
        initDropdowns();
        initSearch();
        initSidePanel();
        initAutoSaveInputs();
        initActionButtons();
        initIconPicker();
        loadRecipes();
        loadCuisines();
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