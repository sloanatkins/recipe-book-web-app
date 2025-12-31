// ================================
// DOWNLOAD SHOPPING LIST
// ================================

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