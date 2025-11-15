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
                if (action === 'From Scratch') openSidePanel('ingredient');
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
    document.getElementById('recipe-cuisines').value = '';
    document.getElementById('recipe-minutes').value = '';
    document.getElementById('recipe-servings').value = '';
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
        const doc = await db.collection("recipes").doc(id).get();
        const r = doc.data();

        if (!r) {
            console.error("No recipe found:", id);
            isLoadingRecipe = false;
            return;
        }

        document.getElementById("recipe-name").value = r.title || "";
        document.getElementById("recipe-cuisines").value = r.cuisine || "";
        document.getElementById("recipe-minutes").value = r.minutes || "";
        document.getElementById("recipe-servings").value = r.servings || "";
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
    if (recipeCuisines) recipeCuisines.addEventListener("input", e => autoSave("cuisine", e.target.value));
    if (recipeMinutes) recipeMinutes.addEventListener("input", e => autoSave("minutes", parseInt(e.target.value) || 0));
    if (recipeServings) recipeServings.addEventListener("input", e => autoSave("servings", parseInt(e.target.value) || 0));
    if (recipeIngredients) recipeIngredients.addEventListener("input", e => autoSave("ingredients", e.target.value));
    if (recipeInstructions) recipeInstructions.addEventListener("input", e => autoSave("instructions", e.target.value));
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

            const reader = new FileReader();

            reader.onload = event => {
                preview.src = event.target.result;
                preview.classList.add("has-image");
                coverSection.classList.add("has-image");
                modalOverlay.classList.add("hidden");
                autoSave("imageUrl", event.target.result);
            };

            reader.readAsDataURL(file);
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
        initSidePanel();
        initAutoSaveInputs();
        loadRecipes();
        loadCuisines();


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

el("sort-select")?.addEventListener("change", (e) => {
    currentSort = e.target.value;
    loadRecipes();
});


// ================================
// LOAD RECIPES (GRID)
// ================================
// ================================
// LOAD RECIPES (GRID)
// ================================
let isLoadingGrid = false;

function loadRecipes() {
    if (isLoadingGrid) return;
    isLoadingGrid = true;

    let ref = db.collection("recipes");

    if (currentSort === "name") ref = ref.orderBy("title");
    if (currentSort === "rating") ref = ref.orderBy("rating", "desc");
    if (currentSort === "createdAt") ref = ref.orderBy("createdAt", "desc");

    ref.get().then(snapshot => {
        const recipeGrid = document.getElementById("recipe-grid");
        const noRecipes = document.getElementById("no-recipes");

        // clear
        recipeGrid.innerHTML = "";

        // --- FIXED EMPTY STATE LOGIC ---
        if (snapshot.size === 0) {
            noRecipes.classList.remove("hidden");
            recipeGrid.classList.add("hidden");
        } else {
            noRecipes.classList.add("hidden");
            recipeGrid.classList.remove("hidden");
        }
        // --------------------------------

        snapshot.forEach(doc => {
            const id = doc.id;
            const r = doc.data();

            const card = document.createElement("div");
            card.classList.add("recipe-card");

            const filledStars = "★".repeat(r.rating || 0);
            const emptyStars = "☆".repeat(5 - (r.rating || 0));

            card.innerHTML = `
                <div class="card-hover-controls">
                    <button class="card-reposition-btn">Reposition</button>
                    <button class="card-menu-btn">⋯</button>

                    <div class="card-menu-dropdown hidden">
                        <div class="card-menu-item">
                            <img src="star2.png" class="card-menu-icon">
                            Add to Favorites
                        </div>

                        <div class="card-menu-item">
                            <img src="duplicate.png" class="card-menu-icon">
                            Duplicate
                        </div>

                        <div class="card-menu-item delete">
                            <img src="trash.png" class="card-menu-icon">
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
                        <img src="fork-knife-logo.png" class="card-title-icon">
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

            const deleteBtn = card.querySelector(".card-menu-item.delete");
            deleteBtn.addEventListener("click", async function (e) {
                e.stopPropagation();
                dropdown.classList.add("hidden");

                const confirmed = await macConfirm("Delete this recipe? This cannot be undone.");
                if (!confirmed) return;

                await db.collection("recipes").doc(id).delete();
                loadRecipes();
            });

            card.addEventListener("click", function () {
                openExistingRecipe(id);
            });

            recipeGrid.appendChild(card);

            setupCardRepositioning(card, id, r);
        });

        isLoadingGrid = false;

    }).catch(err => {
        console.error("Error loading recipes:", err);
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
        dragging = true;
        startY = e.clientY;
        originalTop = parseFloat(img.style.top || 0);
        img.style.cursor = "grabbing";

        function move(ev) {
            if (!dragging) return;
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
        await finalizeRecipeSave();

        currentDraftId = null;

        const panel = document.querySelector(".side-panel");
        const overlay = document.querySelector(".side-panel-overlay");

        if (panel) panel.classList.remove("open");
        if (overlay) overlay.classList.remove("active");

        loadRecipes();
    }
});


// ================================
// EXPAND PANEL FULLSCREEN
// ================================
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("expand-panel-btn")) {
        document.querySelector(".side-panel").classList.toggle("fullscreen");
    }
});


// ================================
// AUTOSAVE
// ================================
let isCreatingDoc = false;

async function autoSave(field, value) {
    if (isLoadingRecipe) return;

    if (!currentDraftId) {
        if (isCreatingDoc) return;
        isCreatingDoc = true;

        try {
            const docRef = await db.collection("recipes").add({
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
// FINAL SAVE
// ================================
async function finalizeRecipeSave() {
    if (!currentDraftId) return;

    const doc = await db.collection("recipes").doc(currentDraftId).get();
    const existing = doc.data() || {};

    const title = document.getElementById("recipe-name").value.trim();
    const cuisine = document.getElementById("recipe-cuisines").value.trim();
    const minutes = parseInt(document.getElementById("recipe-minutes").value) || 0;
    const servings = parseInt(document.getElementById("recipe-servings").value) || 0;
    const ingredients = document.getElementById("recipe-ingredients").value;
    const instructions = document.getElementById("recipe-instructions").value;
    const rating = document.querySelectorAll('.star-input.active').length;

    const preview = document.getElementById("cover-image-preview");
    const imageUrl = preview.classList.contains("has-image") ? preview.src : "";
    const imagePosition = { top: preview.style.top || "0px" };

    await db.collection("recipes").doc(currentDraftId).set({
        createdAt: existing.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
        title,
        cuisine,
        minutes,
        servings,
        ingredients,
        instructions,
        rating,
        imageUrl,
        imagePosition,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}


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
// CUISINES - CREATE NEW
// ================================
async function createNewCuisine() {
    try {
        const docRef = await db.collection("cuisines").add({
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

// Helper function to create and add a cuisine row
function addCuisineRow(list, id, data, animate = false) {
    const indicator = document.createElement("div");
    indicator.classList.add("cuisine-drop-indicator");

    const row = document.createElement("div");
    row.classList.add("cuisine-row");
    row.setAttribute("draggable", "true");
    row.setAttribute("data-id", id);

    // Start invisible if animating
    if (animate) {
        row.style.opacity = "0";
        row.style.transform = "translateX(-10px)";
    }

    row.innerHTML = `
        <div class="cuisine-dots">
            <img src="dots.png" class="dots-icon">
        </div>

        <div class="cuisine-delete-btn">×</div>

        <div class="cuisine-main">
            <div class="cuisine-count">${data.count || 0}</div>
            <img src="cuisine.png" class="cuisine-row-icon">
            <input class="cuisine-name-input" value="${data.name}">
        </div>

        <div class="cuisine-edit-btn">
            <img src="edit.png" class="edit-icon">
        </div>
    `;

    // Insert at the top (after first indicator if exists)
    if (list.firstChild) {
        list.insertBefore(row, list.firstChild.nextSibling || list.firstChild);
        list.insertBefore(indicator, row);
    } else {
        list.appendChild(indicator);
        list.appendChild(row);
    }

    const editBtn = row.querySelector(".cuisine-edit-btn");
    const deleteBtn = row.querySelector(".cuisine-delete-btn");
    const input = row.querySelector(".cuisine-name-input");

    editBtn.addEventListener("click", () => {
        input.disabled = false;
        input.focus();
        requestAnimationFrame(() => {
            const end = input.value.length;
            input.setSelectionRange(end, end);
        });
    });

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

    input.addEventListener("blur", async () => {
        input.disabled = true;
        await db.collection("cuisines").doc(id).update({
            name: input.value.trim()
        });
    });

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
function loadCuisines() {
    const list = document.getElementById("cuisines-list");
    if (!list) return;

    list.innerHTML = "";

    db.collection("cuisines").orderBy("createdAt", "desc").get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                addCuisineRow(list, doc.id, doc.data(), false); // false = no animation on initial load
            });

            enableDragAndDrop();
        });
}


let dragSrcEl = null;

function enableDragAndDrop() {
    const rows = document.querySelectorAll(".cuisine-row");

    rows.forEach(row => {
        row.addEventListener("dragstart", (e) => {
            dragSrcEl = row;
            row.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            
            // Create a drag image of the entire cuisine pill
            const cuisineMain = row.querySelector(".cuisine-main");
            if (cuisineMain) {
                const clone = cuisineMain.cloneNode(true);
                clone.style.position = "absolute";
                clone.style.top = "-9999px";
                clone.style.background = "#f5f5f5";
                clone.style.padding = "4px 15px";
                clone.style.borderRadius = "5px";
                document.body.appendChild(clone);
                e.dataTransfer.setDragImage(clone, 0, 0);
                setTimeout(() => clone.remove(), 0);
            }
        });

        row.addEventListener("dragend", () => {
            row.classList.remove("dragging");
            // Hide all drop indicators
            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");
        });

        row.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (row === dragSrcEl) {
                // Hide all indicators when hovering over self
                document.querySelectorAll(".cuisine-drop-indicator")
                    .forEach(ind => ind.style.display = "none");
                return;
            }

            // Hide all indicators first
            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");

            const rect = row.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const mouseY = e.clientY;

            // Dragging down (show indicator AFTER this row)
            if (mouseY > midpoint) {
                const indicatorAfter = row.nextElementSibling;
                if (indicatorAfter && indicatorAfter.classList.contains("cuisine-drop-indicator")) {
                    indicatorAfter.style.display = "block";
                    row.dataset.dropPosition = "after";
                }
            } 
            // Dragging up (show indicator BEFORE this row)
            else {
                const indicatorBefore = row.previousElementSibling;
                if (indicatorBefore && indicatorBefore.classList.contains("cuisine-drop-indicator")) {
                    indicatorBefore.style.display = "block";
                    row.dataset.dropPosition = "before";
                }
            }
        });

        // Removed dragleave - let dragover handle everything

        row.addEventListener("drop", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (row === dragSrcEl) return;

            const list = document.getElementById("cuisines-list");
            const draggedIndicator = dragSrcEl.previousElementSibling;
            
            const dropPosition = row.dataset.dropPosition;

            if (dropPosition === "after") {
                // Insert after this row's next sibling (the indicator after)
                const afterIndicator = row.nextElementSibling;
                const afterRow = afterIndicator ? afterIndicator.nextElementSibling : null;
                
                if (afterRow) {
                    // Insert before the next row
                    if (draggedIndicator && draggedIndicator.classList.contains("cuisine-drop-indicator")) {
                        list.insertBefore(draggedIndicator, afterRow);
                    }
                    list.insertBefore(dragSrcEl, afterRow);
                } else {
                    // This is the last row, append to end
                    if (draggedIndicator && draggedIndicator.classList.contains("cuisine-drop-indicator")) {
                        list.appendChild(draggedIndicator);
                    }
                    list.appendChild(dragSrcEl);
                }
            } else {
                // Insert before this row
                if (draggedIndicator && draggedIndicator.classList.contains("cuisine-drop-indicator")) {
                    list.insertBefore(draggedIndicator, row.previousElementSibling || row);
                }
                list.insertBefore(dragSrcEl, row);
            }

            // Hide all indicators
            document.querySelectorAll(".cuisine-drop-indicator")
                .forEach(ind => ind.style.display = "none");

            delete row.dataset.dropPosition;

            await saveNewOrder();
        });
    });
}

async function saveNewOrder() {
    const rows = document.querySelectorAll(".cuisine-row");

    const batch = db.batch();

    rows.forEach((row, index) => {
        const id = row.getAttribute("data-id");
        const ref = db.collection("cuisines").doc(id);
        batch.update(ref, { order: index });
    });

    await batch.commit();
}