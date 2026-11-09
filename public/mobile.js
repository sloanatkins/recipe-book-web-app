// ========================================
// PHONE LAYOUT (tab bar + cuisine row)
// Only runs on screens 768px wide or less. On a laptop this file
// does nothing, so the desktop layout stays the same.
// Load it after app.js, recipes.js and cuisines.js.
// ========================================
(function () {
    const PHONE = window.matchMedia('(max-width: 768px)');
    const TABS = [
        { id: 'recipes', label: 'Recipes', icon: 'Images/fork-knife-logo.png' },
        { id: 'cuisines', label: 'Cuisines', icon: 'Images/flag.png' },
        { id: 'ingredients', label: 'Ingredients', icon: 'Images/apple.png' },
        { id: 'actions', label: 'Actions', icon: 'Images/recipe-create.png' },
        { id: 'account', label: 'Account', icon: null }
    ];

    let built = false;
    let activeCuisine = 'ALL';

    // ---------- small helpers ----------
    function savedTab() {
        try { return localStorage.getItem('mobileTab') || 'recipes'; } catch (e) { return 'recipes'; }
    }

    function rememberTab(id) {
        try { localStorage.setItem('mobileTab', id); } catch (e) { /* private mode, no big deal */ }
    }

    // ---------- tab bar ----------
    function buildTabBar() {
        const bar = document.createElement('nav');
        bar.id = 'mobile-tab-bar';
        bar.setAttribute('aria-label', 'Sections');

        TABS.forEach(tab => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mobile-tab';
            btn.dataset.tab = tab.id;
            btn.innerHTML = tab.icon
                ? `<img src="${tab.icon}" alt="" class="mobile-tab-icon"><span>${tab.label}</span>`
                : `<svg class="mobile-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span>${tab.label}</span>`;
            btn.addEventListener('click', () => showTab(tab.id));
            bar.appendChild(btn);
        });

        document.body.appendChild(bar);
    }

    function showTab(id) {
        // account lives on its own page, same as the old account button
        if (id === 'account') {
            window.location.href = '/account.html';
            return;
        }

        TABS.forEach(t => document.body.classList.remove('m-tab-' + t.id));
        document.body.classList.add('m-tab-' + id);

        document.querySelectorAll('#mobile-tab-bar .mobile-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === id);
        });

        rememberTab(id);
        window.scrollTo(0, 0);
    }

    // ---------- cuisine row on the Recipes tab ----------
    function buildChipRow() {
        const recipes = document.getElementById('recipes');
        const header = recipes && recipes.querySelector('.recipes-header-options');
        if (!header) return;

        const row = document.createElement('div');
        row.id = 'mobile-cuisine-chips';
        header.after(row);

        renderChips();

        // cuisines.js fills #cuisines-list after login (and again after edits),
        // so rebuild the chips whenever that list changes
        const list = document.getElementById('cuisines-list');
        if (list) {
            new MutationObserver(renderChips).observe(list, { childList: true, subtree: true });
        }

        // recipes.js redraws the grid after saves/sorts, so re-apply the filter
        const grid = document.getElementById('recipe-grid');
        if (grid) {
            new MutationObserver(() => {
                if (activeCuisine !== 'ALL') applyCuisineFilter(activeCuisine);
            }).observe(grid, { childList: true });
        }
    }

    function cuisineNamesFromList() {
        const names = [];
        document.querySelectorAll('#cuisines-list .cuisine-name-input').forEach(input => {
            const name = (input.value || input.textContent || '').trim();
            if (name && !names.includes(name)) names.push(name);
        });
        return names;
    }

    function renderChips() {
        const row = document.getElementById('mobile-cuisine-chips');
        if (!row) return;

        const names = cuisineNamesFromList();
        // the cuisine got renamed or deleted, go back to All
        if (activeCuisine !== 'ALL' && !names.includes(activeCuisine)) {
            activeCuisine = 'ALL';
            clearCuisineFilter();
        }

        const chips = ['ALL', ...names];
        row.innerHTML = '';
        chips.forEach(name => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'mobile-chip' + (name === activeCuisine ? ' active' : '');
            chip.textContent = name === 'ALL' ? 'All' : name;
            chip.addEventListener('click', () => pickCuisine(name));
            row.appendChild(chip);
        });
    }

    function pickCuisine(name) {
        activeCuisine = name;
        renderChips();
        if (name === 'ALL') {
            clearCuisineFilter();
            fadeGrid();
        } else {
            applyCuisineFilter(name).then(fadeGrid);
        }
    }

    // replays the card fade-in from mobile.css
    function fadeGrid() {
        const grid = document.getElementById('recipe-grid');
        if (!grid) return;
        grid.classList.remove('m-fade');
        void grid.offsetWidth; // restart the animation
        grid.classList.add('m-fade');
    }

    function clearCuisineFilter() {
        document.querySelectorAll('#recipe-grid .recipe-card').forEach(card => {
            card.classList.remove('m-chip-hidden');
        });
        const empty = document.getElementById('mobile-chip-empty');
        if (empty) empty.remove();
    }

    // Recipes store cuisines a few different ways (old string format, ids,
    // {id, name} objects), so this turns each one into a plain name.
    async function recipeTitlesForCuisine(cuisineName) {
        const user = firebase.auth().currentUser;
        if (!user) return new Set();

        const ws = typeof getWorkspaceFilter === 'function'
            ? getWorkspaceFilter()
            : { type: 'personal', userId: user.uid };
        const fs = firebase.firestore();

        const recipesQuery = ws.type === 'personal'
            ? fs.collection('recipes').where('userId', '==', user.uid)
            : fs.collection('recipes').where('teamspaceId', '==', ws.teamspaceId);
        const cuisinesQuery = ws.type === 'personal'
            ? fs.collection('cuisines').where('userId', '==', user.uid)
            : fs.collection('cuisines').where('teamspaceId', '==', ws.teamspaceId);

        const [recipeSnap, cuisineSnap] = await Promise.all([recipesQuery.get(), cuisinesQuery.get()]);

        const nameById = {};
        cuisineSnap.forEach(doc => { nameById[doc.id] = doc.data().name; });

        const titles = new Set();
        recipeSnap.forEach(doc => {
            const r = doc.data();
            if (ws.type === 'personal' && r.teamspaceId) return; // same rule as recipes.js
            const list = r.cuisines || (r.cuisine ? [r.cuisine] : []);
            const names = list.map(c => {
                if (typeof c === 'string') return nameById[c] || c;
                if (c && typeof c === 'object') return c.name || nameById[c.id];
                return null;
            });
            if (names.includes(cuisineName)) titles.add(r.title || 'Untitled');
        });
        return titles;
    }

    async function applyCuisineFilter(name) {
        let titles;
        try {
            titles = await recipeTitlesForCuisine(name);
        } catch (err) {
            console.error('Cuisine filter failed:', err);
            return;
        }
        if (activeCuisine !== name) return; // they tapped another chip meanwhile

        let shown = 0;
        document.querySelectorAll('#recipe-grid .recipe-card').forEach(card => {
            const title = card.querySelector('.card-title')?.textContent.trim() || '';
            const match = titles.has(title);
            card.classList.toggle('m-chip-hidden', !match);
            if (match) shown++;
        });

        let empty = document.getElementById('mobile-chip-empty');
        if (shown === 0) {
            if (!empty) {
                empty = document.createElement('div');
                empty.id = 'mobile-chip-empty';
                document.getElementById('recipe-grid')?.after(empty);
            }
            empty.textContent = `No ${name} recipes yet.`;
        } else if (empty) {
            empty.remove();
        }
    }

    // ---------- "Reposition" moves into the ⋯ menu ----------
    // The Reposition button is hidden on phones (mobile.css). This adds a
    // menu item that just clicks that hidden button, so recipes.js still
    // does all the actual repositioning.
    function addRepositionItem(card) {
        const menu = card.querySelector('.card-menu-dropdown');
        const btn = card.querySelector('.card-reposition-btn');
        if (!menu || !btn || menu.querySelector('.m-reposition-item')) return;
        // cards without a photo have nothing to reposition
        if (!card.querySelector('img.card-img')) return;

        const item = document.createElement('div');
        item.className = 'card-menu-item m-reposition-item';
        item.innerHTML = `<svg class="card-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4v16M7 9l5-5 5 5M7 15l5 5 5-5"/></svg>Reposition`;
        item.addEventListener('click', e => {
            e.stopPropagation();
            menu.classList.add('hidden');
            btn.click();
        });
        const del = menu.querySelector('.card-menu-item.delete');
        menu.insertBefore(item, del || null);
    }

    function watchCardsForMenu() {
        const grid = document.getElementById('recipe-grid');
        if (!grid) return;
        const addAll = () => grid.querySelectorAll('.recipe-card').forEach(addRepositionItem);
        addAll();
        new MutationObserver(addAll).observe(grid, { childList: true });
    }

    // ---------- account page: name goes under "Account details" ----------
    // Moves the Preferred name box from beside the photo down into the
    // Account details list (above Username). Moved back on a laptop.
    let nameHome = null;

    function arrangeAccountPage() {
        const nameBox = document.querySelector('#tab-my-account .settings-profile-info-column');
        const username = document.getElementById('profile-username');
        const detailsSection = username && username.closest('.settings-section');
        if (!nameBox || !detailsSection) return;

        if (PHONE.matches) {
            if (nameHome) return; // already moved
            nameHome = document.createComment('preferred name lives here on laptop');
            nameBox.parentNode.insertBefore(nameHome, nameBox);
            const firstRow = detailsSection.querySelector('.settings-detail-row');
            detailsSection.insertBefore(nameBox, firstRow);
            nameBox.classList.add('m-moved-name');
        } else if (nameHome) {
            nameHome.parentNode.insertBefore(nameBox, nameHome);
            nameHome.remove();
            nameHome = null;
            nameBox.classList.remove('m-moved-name');
        }
    }

    // ---------- no flashing when a recipe opens (phone AND laptop) ----------
    // The panel used to slide in still showing the last recipe (or blanks)
    // and then swap once the new one loaded. Now the inside of the panel
    // stays hidden until the recipe is loaded, then fades in. This wraps
    // app.js's openExistingRecipe instead of changing it.
    function smoothRecipeOpen() {
        const original = window.openExistingRecipe;
        if (typeof original !== 'function' || original.mSmooth) return;

        const wrapped = async function (...args) {
            const panel = document.getElementById('recipe-side-panel');
            if (panel) panel.classList.add('m-loading');
            try {
                return await original.apply(this, args);
            } finally {
                // next frame so the new values are in place before it fades in
                requestAnimationFrame(() => panel && panel.classList.remove('m-loading'));
            }
        };
        wrapped.mSmooth = true;
        window.openExistingRecipe = wrapped;
    }
    smoothRecipeOpen();

    // ---------- "Copy to…" gets a plus icon (phone AND laptop) ----------
    // It used the same icon as Duplicate. Cards get rebuilt all the time, so
    // this watches for new menus and swaps the icon on each one.
    const PLUS_SVG = '<svg class="card-menu-icon m-plus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

    function plusIconFor(root) {
        if (!root.querySelectorAll) return;
        root.querySelectorAll('.card-menu-item').forEach(item => {
            if (!/^\s*Copy to/i.test(item.textContent)) return;
            const img = item.querySelector('img.card-menu-icon');
            if (img) img.outerHTML = PLUS_SVG;
        });
    }

    function watchMenuIcons() {
        plusIconFor(document);
        new MutationObserver(changes => {
            for (const change of changes) {
                change.addedNodes.forEach(node => {
                    if (node.nodeType === 1) plusIconFor(node.parentNode || node);
                });
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.body) watchMenuIcons();
    else document.addEventListener('DOMContentLoaded', watchMenuIcons);

    // ---------- turn on / off ----------
    function setup() {
        arrangeAccountPage();

        // everything below is for the main page only
        if (!document.getElementById('recipe-grid')) return;

        if (!PHONE.matches) {
            document.body.classList.remove('m-tabs');
            return;
        }
        if (!built) {
            buildTabBar();
            buildChipRow();
            watchCardsForMenu();
            built = true;
        }
        document.body.classList.add('m-tabs');
        showTab(savedTab() === 'account' ? 'recipes' : savedTab());
    }

    // rotating a tablet or resizing the window can cross 768px
    PHONE.addEventListener('change', setup);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
