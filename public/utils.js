// ================================
// SHARED HELPERS
// ================================

// Escape text before putting it into innerHTML. Anything another user can type
// (recipe titles, teamspace names, display names) goes through this so it shows
// up as text instead of running as HTML.
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Only allow image sources we expect: our own files, https links, and the
// base64 images the app stores. Anything else falls back to the placeholder.
function safeImageSrc(value, fallback = '') {
    if (typeof value !== 'string' || value === '') return fallback;
    if (value.startsWith('data:image/') || value.startsWith('https://') || value.startsWith('Images/')) {
        return escapeHtml(value);
    }
    return fallback;
}

// Cuisine icons can be stored as raw SVG markup. Strip anything in it that
// could run code (scripts, event handlers, javascript: links) before we
// render it.
function sanitizeSvg(svgString) {
    if (typeof svgString !== 'string') return '';
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return '';

    svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(el => el.remove());
    [svg, ...svg.querySelectorAll('*')].forEach(el => {
        [...el.attributes].forEach(attr => {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && !value.startsWith('#'))) {
                el.removeAttribute(attr.name);
            }
        });
    });
    return new XMLSerializer().serializeToString(svg);
}

// Older profiles saved the user's email in Firestore, where every signed-in
// user could read it. Remove it the next time that person signs in.
async function removeStoredEmail(uid, profileData) {
    if (!profileData || !('email' in profileData)) return;
    try {
        await firebase.firestore().collection('users').doc(uid).update({
            email: firebase.firestore.FieldValue.delete()
        });
        delete profileData.email;
        console.log('Removed stored email from profile');
    } catch (error) {
        console.warn('Could not remove stored email:', error);
    }
}
