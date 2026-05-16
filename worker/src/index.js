import { verifyFirebaseToken } from "./auth.js";
import { fetchPage, ImportError } from "./fetchPage.js";
import { extractRecipeFromHtml, htmlToText, decodeEntities } from "./jsonld.js";
import { buildMessages, callGroq } from "./groq.js";
import { validateRecipe } from "./schema.js";
import { checkUserLimit, recordUserImport, checkGlobalModelLimit, recordModelCall } from "./limits.js";

// POST /import
//   Authorization: Bearer <firebase id token>
//   body: { "type": "url", "url": "https://..." }
//      or { "type": "images", "images": ["data:image/jpeg;base64,...", ...] }  (max 3)
//      or { "type": "text", "text": "..." }   (text pulled out of a PDF in the browser)
//
// returns { recipe, source: "jsonld" | "ai", remaining }
// or      { error: { code, message } }
//
// Nothing gets saved here. The app shows the result for review and only
// writes to Firestore when the user hits Save.

const MAX_BODY_BYTES = 13_000_000;
const MAX_IMAGE_CHARS = 4_000_000; // groq's limit for base64 images is about 4MB
const MAX_TEXT_CHARS = 15_000;
const MIN_PAGE_TEXT = 200;

export function createHandler(deps = {}) {
  return async function handle(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowed.includes(origin) ? 204 : 403, headers: cors });
    }

    const reply = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    const fail = (status, code, message) => reply(status, { error: { code, message } });

    const path = new URL(request.url).pathname;
    if (path !== "/import") return fail(404, "not_found", "Not found.");
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");
    if (origin && !allowed.includes(origin)) return fail(403, "bad_origin", "This site can't use the importer.");

    // ---- who is this ----
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let uid;
    try {
      const verify = deps.verifyToken || ((t) => verifyFirebaseToken(t, env.FIREBASE_PROJECT_ID));
      ({ uid } = await verify(token));
    } catch {
      return fail(401, "unauthorized", "Please sign in again.");
    }

    // ---- read + sanity check the body ----
    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY_BYTES) return fail(413, "too_large", "That upload is too big.");
    let body;
    try {
      body = await request.json();
    } catch {
      return fail(400, "bad_request", "Couldn't read that request.");
    }

    // ---- per user daily cap ----
    const userLimit = Number(env.USER_DAILY_LIMIT || 25);
    const usage = await checkUserLimit(env.USAGE, uid, userLimit);
    if (!usage.allowed) {
      return fail(429, "daily_limit", `You've hit today's limit of ${userLimit} imports. It resets at midnight UTC.`);
    }
    await recordUserImport(env.USAGE, uid);
    const remaining = Math.max(0, userLimit - usage.used - 1);

    try {
      const result = await runImport(body, env, deps);
      return reply(200, { ...result, remaining });
    } catch (err) {
      if (err instanceof ImportError) return fail(err.status, err.code, err.message);
      console.error("unexpected import error", err);
      return fail(500, "server_error", "Something went wrong on our end.");
    }
  };
}

async function runImport(body, env, deps) {
  if (!body || typeof body !== "object") throw new ImportError("bad_request", "Couldn't read that request.");

  if (body.type === "url") {
    const { html, finalUrl } = await fetchPage(body.url, { fetchImpl: deps.fetchImpl || fetch });

    // 1) free path: the site's own structured data
    const fromLd = extractRecipeFromHtml(html, finalUrl);
    if (fromLd) {
      const checked = validateRecipe(fromLd);
      if (checked.ok) return { recipe: checked.recipe, source: "jsonld" };
      // bad JSON-LD (it happens), fall through to the model
    }

    // 2) model path using the page text
    const text = htmlToText(html);
    if (text.length < MIN_PAGE_TEXT) {
      throw new ImportError("page_unreadable", "Couldn't read a recipe from that page. Try a screenshot instead.", 422);
    }
    const recipe = await askModel({ type: "text", text }, env, deps);
    return {
      recipe: { ...recipe, sourceUrl: finalUrl, imageUrl: recipe.imageUrl || findOgImage(html) },
      source: "ai",
    };
  }

  if (body.type === "images") {
    const images = body.images;
    if (!Array.isArray(images) || images.length < 1 || images.length > 3) {
      throw new ImportError("bad_request", "Send between 1 and 3 photos.");
    }
    for (const img of images) {
      if (typeof img !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(img)) {
        throw new ImportError("bad_image", "Photos need to be JPG, PNG or WebP.");
      }
      if (img.length > MAX_IMAGE_CHARS) {
        throw new ImportError("too_large", "One of those photos is too big.", 413);
      }
    }
    return { recipe: await askModel({ type: "images", images }, env, deps), source: "ai" };
  }

  if (body.type === "text") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 50) throw new ImportError("bad_request", "There isn't enough text to find a recipe in.");
    return { recipe: await askModel({ type: "text", text: text.slice(0, MAX_TEXT_CHARS) }, env, deps), source: "ai" };
  }

  throw new ImportError("bad_request", "Unknown import type.");
}

// Calls the model, validates, and retries once with the validation error if
// the first answer doesn't fit the schema.
async function askModel(input, env, deps) {
  let retryReason = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const globalLimit = Number(env.GLOBAL_DAILY_MODEL_LIMIT || 300);
    const g = await checkGlobalModelLimit(env.USAGE, globalLimit);
    if (!g.allowed) {
      throw new ImportError("app_daily_limit", "The importer is resting for today. Try again tomorrow.", 503);
    }
    await recordModelCall(env.USAGE);

    const res = await callGroq({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
      messages: buildMessages(input, retryReason),
      fetchImpl: deps.groqFetch || fetch,
    });

    if (!res.ok) {
      if (res.code === "model_bad_json" && attempt === 0) {
        retryReason = "response was not valid JSON";
        continue;
      }
      const msg =
        res.code === "model_rate_limited"
          ? "The AI is busy right now. Try again in a minute."
          : "The AI couldn't process that right now.";
      throw new ImportError(res.code, msg, 502);
    }

    if (res.json && res.json.error === "not_a_recipe") {
      throw new ImportError("not_a_recipe", "That doesn't look like a recipe.", 422);
    }

    const checked = validateRecipe(res.json);
    if (checked.ok) return checked.recipe;
    retryReason = checked.error;
  }

  throw new ImportError("couldnt_parse", "Couldn't turn that into a recipe. Try a clearer photo or a different link.", 422);
}

function findOgImage(html) {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!m) return null;
  const url = decodeEntities(m[1]);
  return /^https?:\/\//.test(url) ? url : null;
}

function corsHeaders(origin, allowed) {
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

const handler = createHandler();
export default { fetch: (request, env) => handler(request, env) };
