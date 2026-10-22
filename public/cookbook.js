// ================================
// RECIPE AND COOKBOOK PDFs
// ================================
// One page design used by both the single-recipe PDF (Share > Download as PDF)
// and the full cookbook (Download Cookbook). Soft blue pages, polaroid-style
// photos, pastel tags, a light blue ingredients card, and blue step numbers.
// Text wraps and long recipes continue onto new pages.

const PDF = {
    margin: 18,
    // Soft light-blue palette that matches the app's blue buttons
    paper: [248, 251, 255],
    ink: [38, 52, 72],
    soft: [118, 134, 152],
    accent: [86, 152, 218],
    panel: [229, 241, 252],
    dots: [178, 210, 238],
    white: [255, 255, 255],
    shadow: [221, 231, 242],
    // Tag colors, used in turn
    pastels: [
        [214, 234, 250],   // sky
        [214, 240, 230],   // mint
        [232, 226, 250],   // lavender
        [255, 243, 206],   // butter
        [252, 226, 232],   // blush
    ],
};

// ── Helpers ──

// Cuisines are stored as plain names or as { id, name }
function cuisineNames(recipe) {
    const list = recipe.cuisines || (recipe.cuisine ? [recipe.cuisine] : []);
    return list
        .map(c => (typeof c === 'string' ? c : c?.name))
        .filter(name => name && name !== 'Favorites');
}

// Load an image through a canvas. Photos get cropped to the box's shape and
// saved as JPEG; logos keep their transparency as PNG.
function loadPdfImage(src, boxWidth, boxHeight, { keepTransparency = false } = {}) {
    return new Promise(resolve => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (keepTransparency) {
                    // Logos only need to be small, which keeps the PDF light
                    const scale = Math.min(1, 300 / Math.max(img.naturalWidth, img.naturalHeight));
                    canvas.width = Math.round(img.naturalWidth * scale);
                    canvas.height = Math.round(img.naturalHeight * scale);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    return resolve(canvas.toDataURL('image/png'));
                }
                // Crop the middle of the photo to the box's aspect ratio
                const boxRatio = boxWidth / boxHeight;
                let sw = img.naturalWidth;
                let sh = img.naturalHeight;
                if (sw / sh > boxRatio) sw = sh * boxRatio;
                else sh = sw / boxRatio;
                const sx = (img.naturalWidth - sw) / 2;
                const sy = (img.naturalHeight - sh) / 2;
                canvas.width = 900;
                canvas.height = Math.round(900 / boxRatio);
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            } catch (err) {
                // Photos linked from other sites usually can't be copied into a PDF
                console.warn('Skipping image in PDF:', err);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// Pale blue-white background for every page
function paintPaper(doc) {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFillColor(...PDF.paper);
    doc.rect(0, 0, w, h, 'F');
}

function newPage(doc) {
    doc.addPage();
    paintPaper(doc);
}

// A five-point star, filled or outlined
function drawStar(doc, cx, cy, r, filled) {
    const points = [];
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r : r * 0.45;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
    const deltas = points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]]);
    doc.setLineWidth(0.25);
    doc.setDrawColor(...PDF.accent);
    doc.setFillColor(...PDF.accent);
    doc.lines(deltas, points[0][0], points[0][1], [1, 1], filled ? 'FD' : 'S', true);
}

// A row of little dots, used as a cute divider
function dottedLine(doc, x1, x2, y, color = PDF.dots, gap = 2.4) {
    doc.setFillColor(...color);
    for (let x = x1; x <= x2; x += gap) doc.circle(x, y, 0.35, 'F');
}

// Rounded pill with text, returns its width
function drawPill(doc, x, y, text, fill, textColor = PDF.ink) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const width = doc.getTextWidth(text) + 8;
    doc.setFillColor(...fill);
    doc.roundedRect(x, y, width, 6.2, 3.1, 3.1, 'F');
    doc.setTextColor(...textColor);
    doc.text(text, x + 4, y + 4.25);
    return width;
}

// Tracks the cursor and starts a new page when we run out of room
function makeWriter(doc) {
    const bottom = doc.internal.pageSize.getHeight() - PDF.margin - 10;
    const writer = {
        y: PDF.margin,
        fits(space) {
            return writer.y + space <= bottom;
        },
        ensure(space) {
            if (!writer.fits(space)) {
                newPage(doc);
                writer.y = PDF.margin;
                return true;
            }
            return false;
        },
    };
    return writer;
}

// ── One recipe ──

async function drawRecipe(doc, recipe) {
    const { margin } = PDF;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    const w = makeWriter(doc);

    // Polaroid-style photo: white frame with a soft shadow
    const frame = 4;
    const photoWidth = contentWidth - frame * 2;
    const photoHeight = 66;
    const photo = await loadPdfImage(recipe.imageUrl, photoWidth, photoHeight);
    if (photo) {
        doc.setFillColor(...PDF.shadow);
        doc.roundedRect(margin + 1.2, w.y + 1.2, contentWidth, photoHeight + frame * 2, 2, 2, 'F');
        doc.setFillColor(...PDF.white);
        doc.roundedRect(margin, w.y, contentWidth, photoHeight + frame * 2, 2, 2, 'F');
        doc.addImage(photo, 'JPEG', margin + frame, w.y + frame, photoWidth, photoHeight);
        w.y += photoHeight + frame * 2 + 11;
    } else {
        // No photo: a little blue accent bar instead
        doc.setFillColor(...PDF.accent);
        doc.roundedRect(margin, w.y, 22, 2.2, 1.1, 1.1, 'F');
        w.y += 10;
    }

    // Title
    doc.setFont('times', 'bold');
    doc.setFontSize(25);
    doc.setTextColor(...PDF.ink);
    const titleLines = doc.splitTextToSize(recipe.title || 'Untitled', contentWidth);
    doc.text(titleLines, margin, w.y + 4);
    w.y += titleLines.length * 9.5 + 1;
    dottedLine(doc, margin, margin + 40, w.y, PDF.accent, 2.2);
    w.y += 7;

    // Chips: time, servings, cuisines, then the star rating
    let x = margin;
    const wrapIfNeeded = (width) => {
        if (x + width > margin + contentWidth) {
            x = margin;
            w.y += 8.5;
        }
    };
    const chip = (text, fill) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        wrapIfNeeded(doc.getTextWidth(text) + 8);
        x += drawPill(doc, x, w.y, text, fill) + 2.5;
    };
    if (recipe.minutes) chip(`${recipe.minutes} min`, PDF.panel);
    if (recipe.servings) chip(`Serves ${recipe.servings}`, PDF.panel);
    cuisineNames(recipe).forEach((tag, i) => chip(tag, PDF.pastels[i % PDF.pastels.length]));

    if (recipe.rating) {
        wrapIfNeeded(32);
        for (let i = 0; i < 5; i++) {
            drawStar(doc, x + 3 + i * 5.6, w.y + 3.1, 2.3, i < recipe.rating);
        }
        x += 32;
    }
    if (x > margin) w.y += 15;

    // Ingredients in a light blue card. The card is drawn page by page, so a long
    // list just continues in a new card on the next page.
    const ingredients = (recipe.ingredients || '')
        .split('\n')
        .map(line => line.replace(/^\s*[•\-*]\s*/, '').trim())
        .filter(Boolean);

    if (ingredients.length > 0) {
        const pad = 7;
        const textWidth = contentWidth - pad * 2 - 5;
        doc.setFont('times', 'normal');
        doc.setFontSize(10.5);

        // Measure every row first so each card is the right height
        const rows = [{ kind: 'heading', height: 10 }];
        ingredients.forEach(line => {
            const isSubheading = !/\d/.test(line) && line.length < 40
                && (/:$/.test(line) || /^(for the .+|filling|topping|crumble topping|sauce|dressing|crust|dough|glaze|frosting|icing|marinade|garnish|base|batter)$/i.test(line));
            if (isSubheading) {
                rows.push({ kind: 'sub', text: line.replace(/:$/, ''), height: 7.5 });
            } else {
                const wrapped = doc.splitTextToSize(line, textWidth);
                rows.push({ kind: 'item', lines: wrapped, height: wrapped.length * 4.8 + 1.4 });
            }
        });

        let i = 0;
        while (i < rows.length) {
            // Keep the heading with at least one ingredient
            w.ensure(rows[i].height + (rows[i + 1]?.height || 0) + pad * 2);
            const chunk = [];
            let height = pad * 2 - 2;
            while (i < rows.length && w.fits(height + rows[i].height)) {
                chunk.push(rows[i]);
                height += rows[i].height;
                i++;
            }
            doc.setFillColor(...PDF.panel);
            doc.roundedRect(margin, w.y, contentWidth, height, 4, 4, 'F');

            let y = w.y + pad + 2;
            chunk.forEach(row => {
                if (row.kind === 'heading') {
                    doc.setFont('times', 'bold');
                    doc.setFontSize(14);
                    doc.setTextColor(...PDF.ink);
                    doc.text('Ingredients', margin + pad, y + 1);
                } else if (row.kind === 'sub') {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.5);
                    doc.setTextColor(...PDF.accent);
                    doc.text(row.text.toUpperCase(), margin + pad, y + 2);
                } else {
                    doc.setFillColor(...PDF.accent);
                    doc.circle(margin + pad + 1, y - 1.1, 0.9, 'F');
                    doc.setFont('times', 'normal');
                    doc.setFontSize(10.5);
                    doc.setTextColor(...PDF.ink);
                    doc.text(row.lines, margin + pad + 5, y);
                }
                y += row.height;
            });
            w.y += height + 9;
        }
    }

    // Instructions with blue numbered circles
    const steps = (recipe.instructions || '')
        .split('\n')
        .map(line => line.replace(/^\s*\d+\s*[\.\)\-]\s*/, '').trim())
        .filter(Boolean);

    if (steps.length > 0) {
        w.ensure(24);
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...PDF.ink);
        doc.text('Instructions', margin, w.y + 2);
        w.y += 11;

        steps.forEach((step, n) => {
            doc.setFont('times', 'normal');
            doc.setFontSize(10.5);
            const wrapped = doc.splitTextToSize(step, contentWidth - 12);
            w.ensure(Math.max(wrapped.length * 4.9, 7) + 3);

            doc.setFillColor(...PDF.accent);
            doc.circle(margin + 3.2, w.y - 1.2, 3.2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...PDF.white);
            doc.text(String(n + 1), margin + 3.2, w.y - 0.05, { align: 'center' });

            doc.setFont('times', 'normal');
            doc.setFontSize(10.5);
            doc.setTextColor(...PDF.ink);
            doc.text(wrapped, margin + 11, w.y);
            w.y += Math.max(wrapped.length * 4.9, 5) + 4;
        });
    }
}

// Footer on every page after `skip`: book name on the left, page number in a
// little blue circle on the right
function addFooters(doc, skip = 0, label = '') {
    const total = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let page = skip + 1; page <= total; page++) {
        doc.setPage(page);
        const y = pageHeight - 11;
        if (label) {
            doc.setFont('times', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PDF.soft);
            doc.text(label, PDF.margin, y + 1);
        }
        doc.setFillColor(...PDF.accent);
        doc.circle(pageWidth - PDF.margin - 3, y, 3.4, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...PDF.white);
        doc.text(String(page - skip), pageWidth - PDF.margin - 3, y + 1.1, { align: 'center' });
    }
}

function pdfFileName(name) {
    return (name || 'recipe').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() + '.pdf';
}

// ── Single recipe (Share > Download as PDF) ──

async function generateRecipePDF(recipe) {
    if (!window.jspdf) {
        alert('PDF library not loaded. Please refresh the page and try again.');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ compress: true });
    paintPaper(doc);
    await drawRecipe(doc, recipe);
    if (doc.getNumberOfPages() > 1) addFooters(doc);
    doc.save(pdfFileName(recipe.title));
}

// ── Whole cookbook ──

// Same recipes the grid shows: my personal ones, or the open teamspace's
async function loadCookbookRecipes() {
    const user = auth.currentUser;
    const filter = typeof getWorkspaceFilter === 'function' ? getWorkspaceFilter() : { type: 'personal' };

    const snapshot = filter.type === 'teamspace'
        ? await db.collection('recipes').where('teamspaceId', '==', filter.teamspaceId).get()
        : await db.collection('recipes').where('userId', '==', user.uid).get();

    return snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => filter.type === 'teamspace' || !r.teamspaceId)
        .filter(r => (r.title || '').trim() || (r.ingredients || '').trim())
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

async function drawCover(doc, bookName, recipeCount) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const cx = pageWidth / 2;
    paintPaper(doc);

    // Soft pastel circles peeking in from the corners
    const blobs = [
        [pageWidth + 8, 18, 52, PDF.panel],
        [pageWidth - 30, 58, 14, PDF.pastels[3]],
        [-14, pageHeight - 30, 48, PDF.pastels[1]],
        [34, pageHeight - 12, 16, PDF.pastels[2]],
        [-4, 40, 13, PDF.pastels[3]],
        [pageWidth - 6, pageHeight - 54, 22, PDF.pastels[0]],
    ];
    blobs.forEach(([x, y, r, color]) => {
        doc.setFillColor(...color);
        doc.circle(x, y, r, 'F');
    });

    // Dotted frame
    const inset = 12;
    dottedLine(doc, inset, pageWidth - inset, inset, PDF.dots, 3);
    dottedLine(doc, inset, pageWidth - inset, pageHeight - inset, PDF.dots, 3);
    doc.setFillColor(...PDF.dots);
    for (let y = inset; y <= pageHeight - inset; y += 3) {
        doc.circle(inset, y, 0.35, 'F');
        doc.circle(pageWidth - inset, y, 0.35, 'F');
    }

    // Logo in a white circle
    const logoY = pageHeight * 0.33;
    doc.setFillColor(...PDF.shadow);
    doc.circle(cx + 0.8, logoY + 0.8, 24, 'F');
    doc.setFillColor(...PDF.white);
    doc.circle(cx, logoY, 24, 'F');
    const logo = await loadPdfImage('Images/logo.png', 0, 0, { keepTransparency: true });
    if (logo) doc.addImage(logo, 'PNG', cx - 15, logoY - 15, 30, 30);

    // Title and subtitle
    doc.setFont('times', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(...PDF.ink);
    const titleLines = doc.splitTextToSize(bookName, pageWidth - 60);
    let y = logoY + 44;
    doc.text(titleLines, cx, y, { align: 'center' });
    y += (titleLines.length - 1) * 13 + 11;

    doc.setFont('times', 'italic');
    doc.setFontSize(13);
    doc.setTextColor(...PDF.soft);
    doc.text('recipes worth keeping', cx, y, { align: 'center' });
    y += 8;
    dottedLine(doc, cx - 18, cx + 18, y, PDF.accent, 2.4);
    y += 9;

    // Count and date in a pill
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const pillText = `${recipeCount} recipe${recipeCount === 1 ? '' : 's'}   |   ${date}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const pillWidth = doc.getTextWidth(pillText) + 8;
    drawPill(doc, cx - pillWidth / 2, y, pillText, PDF.accent, PDF.white);
}

async function downloadCookbook() {
    if (!window.jspdf) {
        alert('PDF library not loaded. Please refresh the page and try again.');
        return;
    }
    const user = auth.currentUser;
    if (!user) return;

    const bookName = (typeof currentWorkspaceName === 'string' && currentWorkspaceName) || 'My Recipe Book';
    if (typeof showLoadingIndicator === 'function') showLoadingIndicator('Building your cookbook...');

    try {
        const recipes = await loadCookbookRecipes();
        if (recipes.length === 0) {
            alert('There are no recipes in this workspace yet.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ compress: true });
        const { margin } = PDF;
        const pageWidth = doc.internal.pageSize.getWidth();

        await drawCover(doc, bookName, recipes.length);

        // Leave room for the contents and fill it in once page numbers are known
        const perPage = 26;
        const contentsPages = Math.ceil(recipes.length / perPage);
        for (let i = 0; i < contentsPages; i++) newPage(doc);

        // Each recipe starts on its own page
        const startPages = [];
        for (const recipe of recipes) {
            newPage(doc);
            startPages.push(doc.getNumberOfPages());
            await drawRecipe(doc, recipe);
        }

        // Contents with dotted leaders, each row links to its recipe
        const frontMatter = 1 + contentsPages;
        recipes.forEach((recipe, i) => {
            const page = 2 + Math.floor(i / perPage);
            const row = i % perPage;
            doc.setPage(page);

            if (row === 0) {
                doc.setFont('times', 'bold');
                doc.setFontSize(26);
                doc.setTextColor(...PDF.ink);
                doc.text("What's inside", margin, margin + 12);
                dottedLine(doc, margin, margin + 40, margin + 18, PDF.accent, 2.2);
            }

            const y = margin + 34 + row * 9;
            const pageNumber = String(startPages[i] - frontMatter);

            doc.setFillColor(...PDF.pastels[i % PDF.pastels.length]);
            doc.circle(margin + 2, y - 1.3, 2, 'F');

            doc.setFont('times', 'normal');
            doc.setFontSize(12);
            doc.setTextColor(...PDF.ink);
            const title = doc.splitTextToSize(recipe.title || 'Untitled', pageWidth - margin * 2 - 40)[0];
            doc.text(title, margin + 7, y);
            const leaderStart = margin + 7 + doc.getTextWidth(title) + 3;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PDF.accent);
            doc.text(pageNumber, pageWidth - margin, y, { align: 'right' });

            // Dotted leader between title and page number
            const leaderEnd = pageWidth - margin - 8;
            if (leaderEnd > leaderStart) dottedLine(doc, leaderStart, leaderEnd, y - 0.8, PDF.dots, 2);

            doc.link(margin, y - 6, pageWidth - margin * 2, 8, { pageNumber: startPages[i] });
        });

        addFooters(doc, frontMatter, bookName);
        doc.save(pdfFileName(bookName));
    } catch (error) {
        console.error('Error building cookbook:', error);
        alert('Could not build the cookbook. Please try again.');
    } finally {
        if (typeof hideLoadingIndicator === 'function') hideLoadingIndicator();
    }
}

// Hook up the sidebar button
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('download-btn');
    if (button) button.addEventListener('click', downloadCookbook);
});
