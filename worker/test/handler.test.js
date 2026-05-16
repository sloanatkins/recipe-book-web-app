import { describe, it, expect, vi } from "vitest";
import { createHandler } from "../src/index.js";
import { baseEnv, importRequest, fixture, htmlResponse, groqResponse, goodModelRecipe } from "./helpers.js";

// the token check is tested on its own in auth.test.js, so here it's faked
const verifyToken = async (t) => {
  if (t === "good-token") return { uid: "user-1" };
  throw new Error("bad");
};

function setup({ pages = {}, groqReplies = [] } = {}) {
  const fetchImpl = vi.fn(async (url) => {
    const page = pages[url];
    if (!page) return htmlResponse("missing", 404);
    return typeof page === "string" ? htmlResponse(page) : page;
  });
  const groqFetch = vi.fn(async () => {
    const next = groqReplies.shift();
    if (!next) throw new Error("groq was called more times than expected");
    return next;
  });
  const handle = createHandler({ verifyToken, fetchImpl, groqFetch });
  return { handle, fetchImpl, groqFetch };
}

describe("POST /import", () => {
  it("uses JSON-LD and never calls the model when a site has it", async () => {
    const { handle, groqFetch } = setup({ pages: { "https://example.com/pasta": fixture("jsonld-graph.html") } });
    const res = await handle(importRequest({ type: "url", url: "https://example.com/pasta" }), baseEnv());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("jsonld");
    expect(body.recipe.title).toBe("Lemon Garlic Pasta & Herbs");
    expect(body.remaining).toBe(24);
    expect(groqFetch).not.toHaveBeenCalled();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://recipe-book-e3d63.web.app");
  });

  it("falls back to the model for pages without JSON-LD and keeps the source link + og:image", async () => {
    const { handle, groqFetch } = setup({
      pages: { "https://blog.example.com/banana": fixture("no-jsonld.html") },
      groqReplies: [groqResponse(JSON.stringify(goodModelRecipe))],
    });
    const res = await handle(importRequest({ type: "url", url: "https://blog.example.com/banana" }), baseEnv());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("ai");
    expect(body.recipe.sourceUrl).toBe("https://blog.example.com/banana");
    expect(body.recipe.imageUrl).toBe("https://example.com/banana.jpg");
    expect(groqFetch).toHaveBeenCalledTimes(1);
    // the page text (not raw html) is what got sent
    const sent = JSON.parse(groqFetch.mock.calls[0][1].body);
    expect(sent.messages[1].content).toMatch(/3 ripe bananas/);
    expect(sent.messages[1].content).not.toMatch(/<li>/);
  });

  it("tells you to try a screenshot when a page has no readable text", async () => {
    const { handle, groqFetch } = setup({ pages: { "https://social.example.com/p/1": fixture("login-wall.html") } });
    const res = await handle(importRequest({ type: "url", url: "https://social.example.com/p/1" }), baseEnv());
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("page_unreadable");
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it("parses photos with the model", async () => {
    const { handle, groqFetch } = setup({ groqReplies: [groqResponse(JSON.stringify(goodModelRecipe))] });
    const res = await handle(
      importRequest({ type: "images", images: ["data:image/jpeg;base64,/9j/AAAA"] }),
      baseEnv()
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse(groqFetch.mock.calls[0][1].body);
    expect(sent.messages[1].content[1].type).toBe("image_url");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const { handle, groqFetch } = setup({
      groqReplies: [
        groqResponse(JSON.stringify({ ...goodModelRecipe, title: "" })),
        groqResponse(JSON.stringify(goodModelRecipe)),
      ],
    });
    const res = await handle(importRequest({ type: "text", text: "x".repeat(100) }), baseEnv());
    expect(res.status).toBe(200);
    expect(groqFetch).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(groqFetch.mock.calls[1][1].body);
    expect(retry.messages.at(-1).content).toMatch(/title/);
  });

  it("gives up after two bad answers instead of saving junk", async () => {
    const bad = JSON.stringify({ title: "x", ingredients: [], instructions: [] });
    const { handle } = setup({ groqReplies: [groqResponse(bad), groqResponse(bad)] });
    const res = await handle(importRequest({ type: "text", text: "x".repeat(100) }), baseEnv());
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("couldnt_parse");
  });

  it("reports when the content isn't a recipe", async () => {
    const { handle } = setup({ groqReplies: [groqResponse('{"error":"not_a_recipe"}')] });
    const res = await handle(importRequest({ type: "text", text: "my grocery receipt ".repeat(10) }), baseEnv());
    expect((await res.json()).error.code).toBe("not_a_recipe");
  });

  it("rejects requests without a valid login", async () => {
    const { handle } = setup();
    const res = await handle(importRequest({ type: "text", text: "x" }, { token: "nope" }), baseEnv());
    expect(res.status).toBe(401);
  });

  it("rejects other websites", async () => {
    const { handle } = setup();
    const res = await handle(importRequest({ type: "text", text: "x" }, { origin: "https://evil.example" }), baseEnv());
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("enforces the per user daily limit", async () => {
    const { handle } = setup({ pages: { "https://example.com/pasta": fixture("jsonld-graph.html") } });
    const env = baseEnv({ USER_DAILY_LIMIT: "2" });
    const req = () => importRequest({ type: "url", url: "https://example.com/pasta" });
    expect((await handle(req(), env)).status).toBe(200);
    expect((await handle(req(), env)).status).toBe(200);
    const third = await handle(req(), env);
    expect(third.status).toBe(429);
    expect((await third.json()).error.code).toBe("daily_limit");
  });

  it("stops calling the model once the global cap is hit", async () => {
    const { handle, groqFetch } = setup();
    const env = baseEnv({ GLOBAL_DAILY_MODEL_LIMIT: "0" });
    const res = await handle(importRequest({ type: "text", text: "x".repeat(100) }), env);
    expect(res.status).toBe(503);
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it("validates photo input before spending anything", async () => {
    const { handle, groqFetch } = setup();
    const env = baseEnv();
    const tooMany = await handle(importRequest({ type: "images", images: ["a", "b", "c", "d"] }), env);
    expect(tooMany.status).toBe(400);
    const notImage = await handle(importRequest({ type: "images", images: ["data:text/html;base64,AAA"] }), env);
    expect((await notImage.json()).error.code).toBe("bad_image");
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it("blocks private URLs", async () => {
    const { handle, fetchImpl } = setup();
    const res = await handle(importRequest({ type: "url", url: "http://169.254.169.254/" }), baseEnv());
    expect((await res.json()).error.code).toBe("bad_url");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers CORS preflight only for allowed origins", async () => {
    const { handle } = setup();
    const pre = (origin) =>
      new Request("https://w.example/import", { method: "OPTIONS", headers: { Origin: origin } });
    expect((await handle(pre("http://127.0.0.1:5500"), baseEnv())).status).toBe(204);
    expect((await handle(pre("https://evil.example"), baseEnv())).status).toBe(403);
  });
});
