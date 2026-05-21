// ================================
// RECIPE IMPORT (link / photo / PDF -> review -> save)
// ================================
// Flow: user pastes a link or picks files -> we send it to the Cloudflare
// Worker (which holds the Groq key) -> it sends back a validated recipe ->
// user checks/edits it in the review screen -> only THEN do we create the
// recipe, using the same openSidePanel + autoSave path as "From Scratch".
//
// Load this AFTER app.js, recipes.js and recipe-parser.js.

// paste your worker URL here after `npx wrangler deploy`
const RECIPE_IMPORT_URL = 'https://recipe-import.sloanatkins.workers.dev/import';

const IMPORT_MAX_PHOTOS = 3;
const IMPORT_MAX_IMAGE_CHARS = 3_500_000; // stay under the worker's 4MB cap

// state for the review screen
let importDraft = null;

// ================================
// HOOK INTO THE EXISTING "New > Upload" MENU
// ================================
// app.js wires "Upload" to click the old file input. Instead of editing
// app.js, we catch the click first (capture phase) and open our modal.
document.addEventListener('click', (e) => {
    const item = e.target.closest('#recipes-new-dropdown .dropdown-item');
    if (!item || item.textContent.trim() !== 'Upload') return;

    e.preventDefault();
    e.stopImmediatePropagation();
    document.getElementById('recipes-new-dropdown')?.classList.add('hidden');
    openRecipeImport();
}, true);

// ================================
// BUILD THE MODAL (once)
// ================================
function buildRecipeImportModal() {
    if (document.getElementById('ri-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ri-overlay';
    overlay.className = 'ri-overlay hidden';
    overlay.innerHTML = `
        <div class="ri-modal" role="dialog" aria-modal="true" aria-labelledby="ri-heading">
            <div class="ri-header">
                <h3 id="ri-heading">Import a recipe</h3>
                <button class="ri-close" id="ri-close" aria-label="Close">&times;</button>
            </div>

            <!-- STEP 1: pick a source -->
            <div class="ri-step" id="ri-step-source">
                <label class="ri-label" for="ri-url">Paste a link</label>
                <form class="ri-url-row" id="ri-url-form">
                    <input type="url" id="ri-url" class="ri-input" placeholder="https://..." autocomplete="off" inputmode="url">
                    <button type="submit" class="ri-btn ri-btn-primary" id="ri-url-btn">Import</button>
                </form>

                <div class="ri-or"><span>or</span></div>

                <button class="ri-drop" id="ri-drop" type="button">
                    <span class="ri-drop-title">Upload photos or a file</span>
                    <span class="ri-drop-sub">Up to ${IMPORT_MAX_PHOTOS} screenshots, or a PDF / text file</span>
                </button>
                <input type="file" id="ri-file" accept="image/*,.heic,.pdf,.txt" multiple hidden>

                <p class="ri-status hidden" id="ri-status" role="status"></p>
            </div>

            <!-- STEP 2: review before saving -->
            <div class="ri-step hidden" id="ri-step-review">
                <p class="ri-note" id="ri-note"></p>

                <div class="ri-cover-wrap hidden" id="ri-cover-wrap">
                    <img class="ri-cover" id="ri-cover" alt="">
                    <button class="ri-cover-remove" id="ri-cover-remove" type="button">Don't use as cover</button>
                </div>

                <label class="ri-label" for="ri-title">Title</label>
                <input type="text" id="ri-title" class="ri-input">

                <div class="ri-row">
                    <div>
                        <label class="ri-label" for="ri-servings">Servings</label>
                        <input type="number" id="ri-servings" class="ri-input" min="1">
                    </div>
                    <div>
                        <label class="ri-label" for="ri-minutes">Minutes</label>
                        <input type="number" id="ri-minutes" class="ri-input" min="1">
                    </div>
                    <div>
                        <label class="ri-label" for="ri-cuisine">Cuisine</label>
                        <input type="text" id="ri-cuisine" class="ri-input" placeholder="Optional">
                    </div>
                </div>

                <label class="ri-label" for="ri-ingredients">Ingredients <span class="ri-hint">one per line</span></label>
                <textarea id="ri-ingredients" class="ri-input ri-textarea" rows="8"></textarea>

                <label class="ri-label" for="ri-instructions">Instructions <span class="ri-hint">one step per line</span></label>
                <textarea id="ri-instructions" class="ri-input ri-textarea" rows="8"></textarea>

                <p class="ri-status hidden" id="ri-review-status" role="status"></p>

                <div class="ri-actions">
                    <button class="ri-btn" id="ri-back" type="button">Back</button>
                    <button class="ri-btn ri-btn-primary" id="ri-save" type="button">Save recipe</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // close on X, on clicking the dark area, or Escape
    overlay.querySelector('#ri-close').addEventListener('click', closeRecipeImport);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeRecipeImport(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeRecipeImport();
    });

    overlay.querySelector('#ri-url-form').addEventListener('submit', (e) => {
        e.preventDefault();
        importFromUrl(document.getElementById('ri-url').value);
    });

    const fileInput = overlay.querySelector('#ri-file');
    const drop = overlay.querySelector('#ri-drop');
    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        importFromFiles(Array.from(fileInput.files));
        fileInput.value = '';
    });

    // drag and drop on desktop
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('ri-drop-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('ri-drop-over'));
    drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('ri-drop-over');
        importFromFiles(Array.from(e.dataTransfer.files));
    });

    // pasting a screenshot straight into the modal works too
    overlay.addEventListener('paste', (e) => {
        if (document.getElementById('ri-step-source').classList.contains('hidden')) return;
        const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
        if (files.length) {
            e.preventDefault();
            importFromFiles(files);
        }
    });

    overlay.querySelector('#ri-back').addEventListener('click', () => showImportStep('source'));
    overlay.querySelector('#ri-save').addEventListener('click', saveImportedRecipe);
}

function openRecipeImport() {
    buildRecipeImportModal();
    importDraft = null;
    document.getElementById('ri-url').value = '';
    setImportStatus('');
    showImportStep('source');
    document.getElementById('ri-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('ri-url').focus(), 50);
}

function closeRecipeImport() {
    document.getElementById('ri-overlay')?.classList.add('hidden');
    setImportBusy(false);
}

function showImportStep(step) {
    document.getElementById('ri-step-source').classList.toggle('hidden', step !== 'source');
    document.getElementById('ri-step-review').classList.toggle('hidden', step !== 'review');
    document.getElementById('ri-heading').textContent = step === 'review' ? 'Check the recipe' : 'Import a recipe';
}

function setImportStatus(message, isError = false, id = 'ri-status') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('hidden', !message);
    el.classList.toggle('ri-error', isError);
}

function setImportBusy(busy, message = '') {
    ['ri-url', 'ri-url-btn', 'ri-drop'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = busy;
    });
    if (busy) setImportStatus(message);
}

// ================================
// TALK TO THE WORKER
// ================================
async function callRecipeImportWorker(payload) {
    if (RECIPE_IMPORT_URL.includes('YOUR-SUBDOMAIN')) {
        throw Object.assign(new Error('The importer isn\'t set up yet (RECIPE_IMPORT_URL in recipe-import.js).'), { offline: true });
    }

    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in again.');
    const token = await user.getIdToken();

    let res;
    try {
        res = await fetch(RECIPE_IMPORT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        throw Object.assign(new Error('Couldn\'t reach the importer. Check your connection.'), { offline: true });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data?.error?.message || 'Import failed. Please try again.');
        err.code = data?.error?.code;
        // limits or server trouble: worth falling back to the old local parser for files
        err.offline = res.status === 429 || res.status >= 500;
        throw err;
    }
    return data;
}

// ================================
// LINK IMPORT
// ================================
async function importFromUrl(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url) return setImportStatus('Paste a link first.', true);

    setImportBusy(true, 'Reading the page...');
    try {
        const data = await callRecipeImportWorker({ type: 'url', url });
        showImportReview(data.recipe, data.source);
    } catch (err) {
        setImportStatus(err.message, true);
    } finally {
        setImportBusy(false);
    }
}

// ================================
// FILE IMPORT (photos, PDF, text)
// ================================
async function importFromFiles(files) {
    if (!files.length) return;

    const isImage = f => f.type.startsWith('image/') || /\.heic$/i.test(f.name);
    const images = files.filter(isImage);
    const others = files.filter(f => !isImage(f));

    if (images.length && others.length) return setImportStatus('Pick either photos or one PDF/text file, not both.', true);
    if (images.length > IMPORT_MAX_PHOTOS) return setImportStatus(`Up to ${IMPORT_MAX_PHOTOS} photos at a time.`, true);
    if (others.length > 1) return setImportStatus('One PDF or text file at a time.', true);

    setImportBusy(true, images.length ? 'Reading your photo...' : 'Reading your file...');
    try {
        let payload;
        if (images.length) {
            const dataUrls = [];
            for (const f of images) dataUrls.push(await riImageFileToDataUrl(f));
            payload = { type: 'images', images: dataUrls };
        } else {
            const text = await riFileToText(others[0]);
            if (text.trim().length < 50) throw new Error('Couldn\'t find any text in that file.');
            payload = { type: 'text', text };
        }

        try {
            const data = await callRecipeImportWorker(payload);
            showImportReview(data.recipe, data.source, payload.type === 'images' ? payload.images[0] : null);
        } catch (err) {
            if (!err.offline || typeof handleRecipeFileUpload !== 'function') throw err;
            // worker is down or out of quota: use the old in-browser parser
            // (recipe-parser.js) so imports still sort of work
            console.warn('Importer unavailable, using local parser:', err.message);
            setImportStatus('Using the offline parser...');
            const local = await handleRecipeFileUpload(images[0] || others[0]);
            showImportReview(riLocalParseToRecipe(local), 'local', local.imageData ? await riShrinkDataUrl(local.imageData) : null);
        }
    } catch (err) {
        console.error('Import error:', err);
        setImportStatus(err.message || 'Import failed.', true);
    } finally {
        setImportBusy(false);
    }
}

// resize + recompress photos so they're small enough to send (and cheaper)
async function riImageFileToDataUrl(file) {
    if (/\.heic$/i.test(file.name) || file.type === 'image/heic') {
        if (typeof heic2any !== 'function') throw new Error('HEIC photos need heic2any loaded.');
        const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        file = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
    }
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    return riShrinkDataUrl(dataUrl);
}

function riShrinkDataUrl(dataUrl, maxSide = 1600) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            const scale = Math.min(1, maxSide / Math.max(width, height));
            width = Math.round(width * scale);
            height = Math.round(height * scale);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            let quality = 0.85;
            let out = canvas.toDataURL('image/jpeg', quality);
            while (out.length > IMPORT_MAX_IMAGE_CHARS && quality > 0.3) {
                quality -= 0.1;
                out = canvas.toDataURL('image/jpeg', quality);
            }
            resolve(out);
        };
        img.onerror = () => reject(new Error('Couldn\'t open that image.'));
        img.src = dataUrl;
    });
}

async function riFileToText(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) return file.text();

    if (typeof pdfjsLib === 'undefined') throw new Error('PDF support didn\'t load. Refresh and try again.');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // keep line breaks where the PDF has them, the model does better with that
        text += content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    return text;
}

// the old parser returns strings with bullets, turn that into our shape
function riLocalParseToRecipe(p) {
    const lines = s => (s || '').split('\n').map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
    return {
        title: p.title || 'Untitled Recipe',
        servings: p.servings || null,
        minutes: p.minutes || null,
        cuisine: null,
        ingredients: [{ section: null, items: lines(p.ingredients).filter(l => l !== 'No ingredients found') }],
        instructions: lines(p.instructions).filter(l => l !== 'No instructions found').map(l => l.replace(/^\d+\.\s*/, '')),
        imageUrl: null,
        sourceUrl: null,
    };
}

// ================================
// REVIEW SCREEN
// ================================
function showImportReview(recipe, source, coverDataUrl = null) {
    importDraft = { source, sourceUrl: recipe.sourceUrl || null };

    document.getElementById('ri-title').value = recipe.title || '';
    document.getElementById('ri-servings').value = recipe.servings || '';
    document.getElementById('ri-minutes').value = recipe.minutes || '';
    document.getElementById('ri-cuisine').value = recipe.cuisine || '';
    document.getElementById('ri-ingredients').value = riIngredientsToText(recipe.ingredients);
    document.getElementById('ri-instructions').value = (recipe.instructions || []).join('\n');

    const cover = recipe.imageUrl || coverDataUrl;
    const coverWrap = document.getElementById('ri-cover-wrap');
    const coverEl = document.getElementById('ri-cover');
    const hideCover = () => { coverWrap.classList.add('hidden'); importDraft.cover = null; };
    importDraft.cover = cover || null;
    coverWrap.classList.toggle('hidden', !cover);
    if (cover) coverEl.src = cover;
    coverEl.onerror = hideCover; // broken image links just don't show
    document.getElementById('ri-cover-remove').onclick = hideCover;

    const notes = {
        jsonld: 'Pulled straight from the site\'s recipe data.',
        ai: 'Read by AI. Double check the amounts before saving.',
        local: 'The AI importer wasn\'t available, so this used the offline parser. Check it carefully.',
    };
    let note = notes[source] || '';
    if (recipe.sourceUrl) {
        try { note += ` Source: ${new URL(recipe.sourceUrl).hostname.replace(/^www\./, '')}`; } catch { /* ignore */ }
    }
    const noteEl = document.getElementById('ri-note');
    noteEl.textContent = note;
    noteEl.classList.toggle('ri-note-warn', source !== 'jsonld');

    setImportStatus('', false, 'ri-review-status');
    showImportStep('review');
    document.getElementById('ri-title').focus();
}

function riIngredientsToText(sections) {
    if (!Array.isArray(sections)) return '';
    const parts = [];
    sections.forEach((s, i) => {
        if (s.section) {
            if (i > 0) parts.push('');
            parts.push(s.section.endsWith(':') ? s.section : s.section + ':');
        }
        (s.items || []).forEach(item => parts.push(item));
    });
    return parts.join('\n');
}

// ================================
// SAVE (reuses the same create path as "From Scratch")
// ================================
async function saveImportedRecipe() {
    const title = document.getElementById('ri-title').value.trim();
    const ingredients = document.getElementById('ri-ingredients').value
        .split('\n').map(l => l.trimEnd()).join('\n').trim();
    const steps = document.getElementById('ri-instructions').value
        .split('\n').map(l => l.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean);

    if (!title) return setImportStatus('Give it a title first.', true, 'ri-review-status');
    if (!ingredients || !steps.length) {
        return setImportStatus('It needs at least one ingredient and one step.', true, 'ri-review-status');
    }

    const saveBtn = document.getElementById('ri-save');
    saveBtn.disabled = true;

    try {
        const servings = parseInt(document.getElementById('ri-servings').value) || 0;
        const minutes = parseInt(document.getElementById('ri-minutes').value) || 0;
        // same format the default recipes use: "1. step" with a blank line between
        const instructions = steps.map((s, i) => `${i + 1}. ${s}`).join('\n\n');

        // open a fresh recipe panel exactly like "From Scratch" does
        openSidePanel('recipe');

        document.getElementById('recipe-name').value = title;
        document.getElementById('recipe-servings').value = servings || '';
        document.getElementById('recipe-minutes').value = minutes || '';
        document.getElementById('recipe-ingredients').value = ingredients;
        document.getElementById('recipe-instructions').value = instructions;

        // one at a time on purpose: the first autoSave creates the doc, and
        // autoSave drops calls that come in while it's still creating it
        await autoSave('title', title);
        await autoSave('servings', servings);
        await autoSave('minutes', minutes);
        await autoSave('ingredients', ingredients);
        await autoSave('instructions', instructions);
        if (importDraft?.sourceUrl) await autoSave('sourceUrl', importDraft.sourceUrl);

        if (importDraft?.cover) {
            const preview = document.getElementById('cover-image-preview');
            const coverSection = document.getElementById('cover-image-section');
            preview.src = importDraft.cover;
            preview.classList.add('has-image');
            coverSection?.classList.add('has-image');
            await autoSave('imageUrl', importDraft.cover);
        }

        // only tag a cuisine if it matches one the user already has
        const cuisineName = document.getElementById('ri-cuisine').value.trim();
        if (cuisineName && typeof addCuisineTag === 'function') {
            const match = await riFindExistingCuisine(cuisineName);
            if (match) await addCuisineTag(match);
        }

        closeRecipeImport();
        if (typeof showSuccessMessage === 'function') showSuccessMessage('Recipe imported!');
    } catch (err) {
        console.error('Error saving imported recipe:', err);
        setImportStatus('Couldn\'t save that recipe. Please try again.', true, 'ri-review-status');
    } finally {
        saveBtn.disabled = false;
    }
}

async function riFindExistingCuisine(name) {
    const user = auth.currentUser;
    if (!user) return null;
    const snap = await db.collection('cuisines').where('userId', '==', user.uid).get();
    const wanted = name.toLowerCase();
    let found = null;
    snap.forEach(doc => {
        if (!found && (doc.data().name || '').trim().toLowerCase() === wanted) {
            found = { id: doc.id, name: doc.data().name };
        }
    });
    return found;
}
