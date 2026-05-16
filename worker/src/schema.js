import { z } from "zod";

// This is the one shape every import has to end up in, no matter if it came
// from a site's JSON-LD or from the model. Nothing gets back to the app unless
// it passes this.
const line = z.string().trim().min(1).max(500);

export const RecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  servings: z.number().int().min(1).max(1000).nullable(),
  minutes: z.number().int().min(1).max(10080).nullable(), // a week, for the sourdough people
  cuisine: z.string().trim().min(1).max(60).nullable(),
  ingredients: z
    .array(
      z.object({
        section: z.string().trim().min(1).max(80).nullable(),
        items: z.array(line).min(1).max(100),
      })
    )
    .min(1)
    .max(20),
  instructions: z.array(z.string().trim().min(1).max(2000)).min(1).max(80),
  imageUrl: z.string().url().max(2000).nullable(),
  sourceUrl: z.string().url().max(2000).nullable(),
});

// Models (and recipe sites) get the little stuff wrong constantly: "4" instead
// of 4, "about 30 min", a flat ingredient list with no sections, etc.
// coerce() fixes the boring cases BEFORE validation so we only fail on
// output that's actually bad.
export function coerceRecipe(raw) {
  if (!raw || typeof raw !== "object") return raw;

  const out = { ...raw };
  out.title = typeof raw.title === "string" ? raw.title.trim() : raw.title;
  out.servings = toPositiveInt(raw.servings);
  out.minutes = toPositiveInt(raw.minutes);
  out.cuisine = emptyToNull(raw.cuisine);
  out.imageUrl = isHttpUrl(raw.imageUrl) ? raw.imageUrl : null;
  out.sourceUrl = isHttpUrl(raw.sourceUrl) ? raw.sourceUrl : null;

  // ingredients can show up as ["1 cup flour", ...] or as sections
  if (Array.isArray(raw.ingredients)) {
    if (raw.ingredients.every((x) => typeof x === "string")) {
      out.ingredients = [{ section: null, items: cleanLines(raw.ingredients) }];
    } else {
      out.ingredients = raw.ingredients
        .filter((s) => s && typeof s === "object")
        .map((s) => ({
          section: emptyToNull(s.section),
          items: cleanLines(Array.isArray(s.items) ? s.items : []),
        }))
        .filter((s) => s.items.length > 0);
    }
  }

  if (Array.isArray(raw.instructions)) {
    // strip "1." / "Step 2:" since the app numbers steps itself
    out.instructions = cleanLines(raw.instructions).map((s) =>
      s.replace(/^\s*(step\s*)?\d+\s*[.):-]\s*/i, "").trim()
    ).filter(Boolean);
  } else if (typeof raw.instructions === "string") {
    out.instructions = cleanLines(raw.instructions.split(/\n+/)).map((s) =>
      s.replace(/^\s*(step\s*)?\d+\s*[.):-]\s*/i, "").trim()
    ).filter(Boolean);
  }

  return out;
}

// returns { ok: true, recipe } or { ok: false, error: "readable reason" }
export function validateRecipe(raw) {
  const result = RecipeSchema.safeParse(coerceRecipe(raw));
  if (result.success) return { ok: true, recipe: result.data };

  // short, specific message. this also gets fed back to the model on retry
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: issues };
}

function toPositiveInt(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.round(v);
    return n > 0 ? n : null;
  }
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    if (m) {
      const n = parseInt(m[0], 10);
      return n > 0 ? n : null;
    }
  }
  return null;
}

function emptyToNull(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function cleanLines(arr) {
  return arr
    .filter((x) => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isHttpUrl(v) {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
