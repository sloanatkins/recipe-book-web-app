// Most big recipe sites (NYT Cooking, Allrecipes, basically anything on
// WordPress with a recipe plugin) embed a schema.org Recipe as JSON-LD for
// Google. If it's there we can skip the model completely: free, instant,
// and no chance of the AI making something up.

const LD_JSON_RE =
  /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

export function extractRecipeFromHtml(html, pageUrl = null) {
  if (typeof html !== "string") return null;

  for (const match of html.matchAll(LD_JSON_RE)) {
    let data;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue; // some sites ship broken JSON-LD, just skip that block
    }
    const node = findRecipeNode(data);
    if (node) return normalizeRecipeNode(node, pageUrl);
  }
  return null;
}

// JSON-LD can be a single object, an array, or wrapped in @graph
function findRecipeNode(data, depth = 0) {
  if (!data || depth > 5) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const type = data["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("Recipe")) return data;

  if (data["@graph"]) return findRecipeNode(data["@graph"], depth + 1);
  return null;
}

export function normalizeRecipeNode(node, pageUrl = null) {
  return {
    title: cleanText(node.name),
    servings: parseYield(node.recipeYield),
    minutes:
      parseIsoDuration(node.totalTime) ||
      sumOrNull(parseIsoDuration(node.prepTime), parseIsoDuration(node.cookTime)),
    cuisine: firstString(node.recipeCuisine),
    ingredients: [
      {
        section: null,
        items: toArray(node.recipeIngredient || node.ingredients)
          .map(cleanText)
          .filter(Boolean),
      },
    ],
    instructions: parseInstructions(node.recipeInstructions),
    imageUrl: parseImage(node.image),
    sourceUrl: pageUrl,
  };
}

// "PT1H30M" -> 90. Returns null if it can't make sense of it.
export function parseIsoDuration(value) {
  if (typeof value !== "string") return null;
  const m = value
    .trim()
    .match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x ? parseFloat(x) : 0));
  const total = Math.round(d * 1440 + h * 60 + min + s / 60);
  return total > 0 ? total : null;
}

// yield shows up as 4, "4", "4 servings", ["4", "4 servings"], "Makes 24 cookies"
export function parseYield(value) {
  for (const v of toArray(value)) {
    if (typeof v === "number" && v > 0) return Math.round(v);
    if (typeof v === "string") {
      const m = v.match(/\d+/);
      if (m) return parseInt(m[0], 10);
    }
  }
  return null;
}

// instructions are the messiest part: a string, a list of strings, HowToStep
// objects, or HowToSection objects with steps inside them
export function parseInstructions(value) {
  const steps = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string") {
      // one big string, sometimes with <p> or newlines between steps
      cleanText(v.replace(/<\/(p|li)>|<br\s*\/?>/gi, "\n"))
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => steps.push(s));
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") {
      if (v.itemListElement) return walk(v.itemListElement); // HowToSection
      if (v.text) return walk(v.text);
      if (v.name) return walk(v.name);
    }
  };
  walk(value);
  return steps;
}

function parseImage(value) {
  for (const v of toArray(value)) {
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    if (v && typeof v === "object" && typeof v.url === "string") return v.url;
  }
  return null;
}

// Turns a page into plain text for the model when there's no JSON-LD.
// Blogs put 2000 words of life story before the recipe, so if the text is long
// we start a bit before the first "Ingredients" instead of at the top.
export function htmlToText(html, maxChars = 12000) {
  let text = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  if (text.length <= maxChars) return text;
  const idx = text.search(/ingredients/i);
  const start = idx > 1500 ? idx - 1500 : 0;
  return text.slice(start, start + maxChars);
}

function cleanText(v) {
  if (typeof v !== "string") return "";
  return decodeEntities(v.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function decodeEntities(s) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾", deg: "°" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return named[code.toLowerCase()] ?? whole;
  });
}

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function firstString(v) {
  const s = toArray(v).find((x) => typeof x === "string" && x.trim());
  return s ? s.trim() : null;
}

function sumOrNull(a, b) {
  if (a == null && b == null) return null;
  return (a || 0) + (b || 0);
}
