import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = (name) => readFileSync(join(here, "fixtures", name), "utf8");

// tiny in-memory stand-in for Workers KV
export function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
}

export function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

// fake groq reply with whatever content string we want
export function groqResponse(content, status = 200) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 100 } }),
    { status, headers: { "content-type": "application/json" } }
  );
}

export const goodModelRecipe = {
  title: "Grandma's Banana Bread",
  servings: "8",
  minutes: 70,
  cuisine: null,
  ingredients: [{ section: null, items: ["3 ripe bananas", "1/3 cup melted butter", "1 1/2 cups flour"] }],
  instructions: ["1. Preheat oven to 350°F.", "Mash bananas and mix in butter.", "Bake 60 minutes."],
};

export const baseEnv = (overrides = {}) => ({
  FIREBASE_PROJECT_ID: "recipe-book-e3d63",
  ALLOWED_ORIGINS: "https://recipe-book-e3d63.web.app,http://127.0.0.1:5500",
  GROQ_MODEL: "test-model",
  GROQ_API_KEY: "test-key",
  USER_DAILY_LIMIT: "25",
  GLOBAL_DAILY_MODEL_LIMIT: "300",
  USAGE: fakeKV(),
  ...overrides,
});

export function importRequest(body, { origin = "https://recipe-book-e3d63.web.app", token = "good-token" } = {}) {
  return new Request("https://recipe-import.example.workers.dev/import", {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
