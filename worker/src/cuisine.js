// Picks one of the user's own cuisines for a recipe. Their "cuisines" are
// really categories (Drinks, Mains, Dessert...), so a free guess like
// "Cuban" never lined up with anything. Now the model gets the list and has
// to choose, and this file double checks the answer and handles sites whose
// recipe data says "Main Course" when the user's list says "Mains".

// words that mean the same bucket. a candidate and an option match if they
// land in the same group.
const SYNONYM_GROUPS = [
  ["main", "mains", "main course", "main courses", "main dish", "main dishes", "entree", "entrees", "dinner", "dinners"],
  ["dessert", "desserts", "sweet", "sweets", "baking", "baked goods"],
  ["drink", "drinks", "cocktail", "cocktails", "beverage", "beverages", "mocktail", "mocktails"],
  ["side", "sides", "side dish", "side dishes"],
  ["snack", "snacks", "appetizer", "appetizers", "starter", "starters", "hors d oeuvres"],
  ["sauce", "sauces", "condiment", "condiments", "dressing", "dressings", "dip", "dips"],
  ["breakfast", "brunch", "breakfasts"],
  ["soup", "soups", "stew", "stews"],
  ["salad", "salads"],
  ["bread", "breads"],
];

function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é -> e
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// crude singular so "Desserts" and "dessert" line up
function singular(s) {
  return s.replace(/ies$/, "y").replace(/(?<!s)s$/, "");
}

function groupOf(n) {
  return SYNONYM_GROUPS.findIndex((g) => g.includes(n) || g.includes(singular(n)));
}

// cleans up whatever list the browser sent
export function cleanCuisineList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const name = item.trim().slice(0, 60);
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    out.push(name);
    if (out.length >= 50) break;
  }
  return out;
}

// candidates: things the recipe might be (model answer, site cuisine, site
// category). returns the matching option's exact name, or null.
export function matchCuisine(candidates, options) {
  if (!options?.length) return null;
  const opts = options.map((name) => ({ name, n: norm(name) }));
  const cands = (Array.isArray(candidates) ? candidates : [candidates])
    .filter((c) => typeof c === "string" && c.trim())
    .map(norm);

  // exact first, then plural/singular, then synonyms
  for (const c of cands) {
    const hit = opts.find((o) => o.n === c);
    if (hit) return hit.name;
  }
  for (const c of cands) {
    const hit = opts.find((o) => singular(o.n) === singular(c));
    if (hit) return hit.name;
  }
  for (const c of cands) {
    const g = groupOf(c);
    if (g === -1) continue;
    const hit = opts.find((o) => groupOf(o.n) === g);
    if (hit) return hit.name;
  }
  return null;
}
