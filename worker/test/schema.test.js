import { describe, it, expect } from "vitest";
import { validateRecipe, coerceRecipe } from "../src/schema.js";
import { goodModelRecipe } from "./helpers.js";

describe("validateRecipe", () => {
  it("accepts a normal model answer and cleans it up", () => {
    const res = validateRecipe(goodModelRecipe);
    expect(res.ok).toBe(true);
    expect(res.recipe.servings).toBe(8); // "8" -> 8
    expect(res.recipe.instructions[0]).toBe("Preheat oven to 350°F."); // "1." stripped
    expect(res.recipe.imageUrl).toBeNull();
  });

  it("wraps a flat ingredient list in one section", () => {
    const res = validateRecipe({ ...goodModelRecipe, ingredients: ["1 egg", "  2 cups   milk "] });
    expect(res.ok).toBe(true);
    expect(res.recipe.ingredients).toEqual([{ section: null, items: ["1 egg", "2 cups milk"] }]);
  });

  it("turns zero or missing numbers into null instead of failing", () => {
    const res = validateRecipe({ ...goodModelRecipe, servings: 0, minutes: undefined });
    expect(res.ok).toBe(true);
    expect(res.recipe.servings).toBeNull();
    expect(res.recipe.minutes).toBeNull();
  });

  it("splits a string of instructions on newlines", () => {
    const res = validateRecipe({ ...goodModelRecipe, instructions: "1. Mix.\n2. Bake." });
    expect(res.recipe.instructions).toEqual(["Mix.", "Bake."]);
  });

  it("rejects a recipe with no title", () => {
    const res = validateRecipe({ ...goodModelRecipe, title: "  " });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/title/);
  });

  it("rejects a recipe with no ingredients or no steps", () => {
    expect(validateRecipe({ ...goodModelRecipe, ingredients: [] }).ok).toBe(false);
    expect(validateRecipe({ ...goodModelRecipe, instructions: [] }).ok).toBe(false);
  });

  it("drops non http image links instead of trusting them", () => {
    const c = coerceRecipe({ ...goodModelRecipe, imageUrl: "javascript:alert(1)" });
    expect(c.imageUrl).toBeNull();
  });

  it("rejects garbage", () => {
    expect(validateRecipe(null).ok).toBe(false);
    expect(validateRecipe("hello").ok).toBe(false);
  });
});
