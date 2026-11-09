import { describe, it, expect, vi } from "vitest";
import { matchCuisine, cleanCuisineList } from "../src/cuisine.js";
import { buildMessages } from "../src/groq.js";
import { createHandler } from "../src/index.js";
import { baseEnv, importRequest, fixture, htmlResponse, groqResponse, goodModelRecipe } from "./helpers.js";

// the kind of list the app actually sends
const MINE = ["Dessert", "Mains", "Drinks", "Sauces", "Sides", "Snacks", "Italian"];

describe("matchCuisine", () => {
  it("matches exact names, ignoring case", () => {
    expect(matchCuisine("drinks", MINE)).toBe("Drinks");
    expect(matchCuisine("Italian", MINE)).toBe("Italian");
  });

  it("matches singular and plural", () => {
    expect(matchCuisine("Drink", MINE)).toBe("Drinks");
    expect(matchCuisine("Desserts", MINE)).toBe("Dessert");
  });

  it("matches common synonyms", () => {
    expect(matchCuisine("Main Course", MINE)).toBe("Mains");
    expect(matchCuisine("Cocktail", MINE)).toBe("Drinks");
    expect(matchCuisine("Appetizer", MINE)).toBe("Snacks");
    expect(matchCuisine("Side Dish", MINE)).toBe("Sides");
  });

  it("tries each candidate in order and skips ones that don't fit", () => {
    expect(matchCuisine(["American", "Dessert"], MINE)).toBe("Dessert");
  });

  it("returns null instead of inventing one", () => {
    expect(matchCuisine("Cuban", MINE)).toBeNull();
    expect(matchCuisine(null, MINE)).toBeNull();
    expect(matchCuisine("Drinks", [])).toBeNull();
  });
});

describe("cleanCuisineList", () => {
  it("drops junk, blanks and duplicates and caps the length", () => {
    expect(cleanCuisineList([" Drinks ", "drinks", "", 5, null, "Mains"])).toEqual(["Drinks", "Mains"]);
    expect(cleanCuisineList("Drinks")).toEqual([]);
    expect(cleanCuisineList(Array.from({ length: 80 }, (_, i) => `C${i}`))).toHaveLength(50);
  });
});

describe("prompt", () => {
  it("sends the list only when there is one", () => {
    const withList = buildMessages({ type: "text", text: "x", cuisines: ["Drinks"] });
    expect(withList.at(-1).content).toBe('Allowed categories for "cuisine": ["Drinks"]');
    const without = buildMessages({ type: "text", text: "x" });
    expect(without).toHaveLength(2);
  });
});

describe("import picks from the user's list", () => {
  const verifyToken = async () => ({ uid: "u1" });

  it("uses the site's category for JSON-LD recipes (no AI)", async () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Brownies","recipeCategory":"Desserts","recipeCuisine":"American","recipeIngredient":["1 cup sugar"],"recipeInstructions":["Bake."]}</script>`;
    const handle = createHandler({ verifyToken, fetchImpl: async () => htmlResponse(html) });
    const res = await handle(
      importRequest({ type: "url", url: "https://example.com/brownies", cuisines: MINE }),
      baseEnv()
    );
    expect((await res.json()).recipe.cuisine).toBe("Dessert");
  });

  it("passes the list to the model and keeps its pick", async () => {
    const groqFetch = vi.fn(async () => groqResponse(JSON.stringify({ ...goodModelRecipe, cuisine: "Drinks" })));
    const handle = createHandler({ verifyToken, groqFetch });
    const res = await handle(importRequest({ type: "text", text: "x".repeat(100), cuisines: MINE }), baseEnv());
    expect((await res.json()).recipe.cuisine).toBe("Drinks");
    const sent = JSON.parse(groqFetch.mock.calls[0][1].body);
    expect(sent.messages.at(-1).content).toMatch(/"Drinks"/);
  });

  it("throws away a model answer that isn't on the list", async () => {
    const groqFetch = vi.fn(async () => groqResponse(JSON.stringify({ ...goodModelRecipe, cuisine: "Cuban" })));
    const handle = createHandler({ verifyToken, groqFetch });
    const res = await handle(importRequest({ type: "text", text: "x".repeat(100), cuisines: MINE }), baseEnv());
    expect((await res.json()).recipe.cuisine).toBeNull();
  });

  it("still works for an older app that sends no list", async () => {
    const handle = createHandler({ verifyToken, fetchImpl: async () => htmlResponse(fixture("jsonld-graph.html")) });
    const res = await handle(importRequest({ type: "url", url: "https://example.com/pasta" }), baseEnv());
    expect((await res.json()).recipe.cuisine).toBe("Italian");
  });
});
