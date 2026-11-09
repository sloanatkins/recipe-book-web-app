// Picks the best photo for a recipe from a web page.
// Tries, in order:
//   1. the photo in the page's recipe data (JSON-LD)
//   2. the page's share image (og:image / og:image:secure_url)
//   3. the Twitter share image
//   4. <link rel="image_src">
// Relative links ("/wp-content/...", "//cdn...") get turned into full ones,
// and obvious non-photos (logos, icons, tracking pixels, svgs) get skipped.
import { decodeEntities } from "./jsonld.js";

const NOT_A_PHOTO = /(^data:|\.svg(\?|$)|logo|favicon|sprite|avatar|placeholder|blank\.gif|pixel|spacer|gravatar)/i;

// turns whatever shape the recipe data uses into a list of link strings
export function imageCandidatesFromLd(value) {
  const out = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") {
      walk(v.url);
      walk(v.contentUrl);
      if (!v.url && !v.contentUrl) walk(v["@id"]);
    }
  };
  walk(value);
  return out;
}

// reads every <meta> and <link> tag no matter what order its attributes are in
function readTags(html) {
  const metas = [];
  const links = [];
  const attrs = (tag) => {
    const a = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      a[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
    }
    return a;
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) metas.push(attrs(m[0]));
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) links.push(attrs(m[0]));
  return { metas, links };
}

function metaContent(metas, ...names) {
  for (const name of names) {
    const hit = metas.find((a) => (a.property || a.name || "").toLowerCase() === name && a.content);
    if (hit) return hit.content;
  }
  return null;
}

// "/img/x.jpg" or "//cdn.site.com/x.jpg" -> full https link, junk -> null
export function toFullImageUrl(raw, pageUrl) {
  if (typeof raw !== "string") return null;
  const cleaned = decodeEntities(raw.trim());
  if (!cleaned || NOT_A_PHOTO.test(cleaned)) return null;
  try {
    const u = new URL(cleaned, pageUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export function pickRecipeImage(html, pageUrl, ldImage = null) {
  const { metas, links } = readTags(html || "");
  const candidates = [
    ...imageCandidatesFromLd(ldImage),
    metaContent(metas, "og:image:secure_url", "og:image", "og:image:url"),
    metaContent(metas, "twitter:image", "twitter:image:src"),
    links.find((a) => (a.rel || "").toLowerCase() === "image_src")?.href,
  ];
  for (const c of candidates) {
    const url = toFullImageUrl(c, pageUrl);
    if (url) return url;
  }
  return null;
}
