import { describe, it, expect } from "vitest";
import { extractRecipeFromHtml, parseIsoDuration, parseYield, parseInstructions, htmlToText } from "../src/jsonld.js";
import { fixture } from "./helpers.js";

describe("extractRecipeFromHtml", () => {
  it("finds a Recipe inside @graph with HowToSections", () => {
    const r = extractRecipeFromHtml(fixture("jsonld-graph.html"), "https://example.com/pasta");
    expect(r.title).toBe("Lemon Garlic Pasta & Herbs"); // entity decoded
    expect(r.servings).toBe(4);
    expect(r.minutes).toBe(25); // prep 10 + cook 15
    expect(r.cuisine).toBe("Italian");
    expect(r.ingredients[0].items).toHaveLength(5);
    expect(r.ingredients[0].items[4]).toBe("Salt & pepper");
    expect(r.instructions).toHaveLength(4);
    expect(r.instructions[0]).toMatch(/^Boil the spaghetti/);
    expect(r.imageUrl).toBe("https://example.com/img/pasta-1200.jpg");
    expect(r.sourceUrl).toBe("https://example.com/pasta");
  });

  it("handles a top level array and an HTML string of instructions", () => {
    const r = extractRecipeFromHtml(fixture("jsonld-simple.html"));
    expect(r.title).toBe("Overnight Oats");
    expect(r.servings).toBe(2);
    expect(r.minutes).toBe(485);
    expect(r.instructions).toEqual(["Mix everything in a jar.", "Refrigerate overnight."]);
  });

  it("skips a broken JSON-LD block and uses the next one", () => {
    const r = extractRecipeFromHtml(fixture("jsonld-broken.html"));
    expect(r.title).toBe("Toast");
  });

  it("returns null when there's no recipe data", () => {
    expect(extractRecipeFromHtml(fixture("no-jsonld.html"))).toBeNull();
    expect(extractRecipeFromHtml(null)).toBeNull();
  });
});

describe("parseIsoDuration", () => {
  it.each([
    ["PT30M", 30],
    ["PT1H30M", 90],
    ["P1DT2H", 1560],
    ["PT90S", 2],
    ["pt45m", 45],
  ])("%s -> %i", (input, out) => expect(parseIsoDuration(input)).toBe(out));

  it("returns null for junk", () => {
    expect(parseIsoDuration("30 minutes")).toBeNull();
    expect(parseIsoDuration("PT0M")).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });
});

describe("parseYield", () => {
  it("pulls the first number out of the common formats", () => {
    expect(parseYield(4)).toBe(4);
    expect(parseYield("6 servings")).toBe(6);
    expect(parseYield(["12", "12 muffins"])).toBe(12);
    expect(parseYield("Makes 24 cookies")).toBe(24);
    expect(parseYield("a few")).toBeNull();
  });
});

describe("parseInstructions", () => {
  it("flattens plain string arrays and HowToStep objects", () => {
    expect(parseInstructions(["Step one.", { "@type": "HowToStep", text: "Step two." }])).toEqual([
      "Step one.",
      "Step two.",
    ]);
  });
});

describe("htmlToText", () => {
  it("drops scripts and styles and keeps the recipe text", () => {
    const text = htmlToText(fixture("no-jsonld.html"));
    expect(text).not.toMatch(/tracking/);
    expect(text).not.toMatch(/color:red/);
    expect(text).toMatch(/3 ripe bananas/);
    expect(text).toMatch(/350°F/);
  });

  it("starts near Ingredients when the page is long", () => {
    const html = `<p>${"life story ".repeat(3000)}</p><h2>Ingredients</h2><li>1 cup rice</li>`;
    const text = htmlToText(html, 4000);
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toMatch(/1 cup rice/);
  });
});
