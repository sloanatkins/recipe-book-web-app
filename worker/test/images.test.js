import { describe, it, expect } from "vitest";
import { pickRecipeImage, toFullImageUrl, imageCandidatesFromLd } from "../src/images.js";

const PAGE = "https://www.example-recipes.com/pasta/creamy-cajun";

describe("picking the recipe photo", () => {
  it("uses the photo from the recipe data first", () => {
    const html = '<meta property="og:image" content="https://cdn.x.com/share.jpg">';
    expect(pickRecipeImage(html, PAGE, "https://cdn.x.com/recipe.jpg")).toBe("https://cdn.x.com/recipe.jpg");
  });

  it("understands photo objects and lists in the recipe data", () => {
    expect(pickRecipeImage("", PAGE, [{ "@type": "ImageObject", url: "https://cdn.x.com/a.jpg" }])).toBe("https://cdn.x.com/a.jpg");
    expect(pickRecipeImage("", PAGE, { contentUrl: "https://cdn.x.com/b.jpg" })).toBe("https://cdn.x.com/b.jpg");
    expect(imageCandidatesFromLd([["https://a/1.jpg"], { url: ["https://a/2.jpg"] }])).toEqual(["https://a/1.jpg", "https://a/2.jpg"]);
  });

  it("turns relative links into full ones", () => {
    expect(pickRecipeImage("", PAGE, "/wp-content/uploads/pasta.jpg")).toBe("https://www.example-recipes.com/wp-content/uploads/pasta.jpg");
    expect(pickRecipeImage("", PAGE, "//cdn.x.com/pasta.jpg")).toBe("https://cdn.x.com/pasta.jpg");
  });

  it("falls back to the share image when the recipe data has none", () => {
    const html = '<head><meta content="https://cdn.x.com/share.jpg" property="og:image"></head>';
    expect(pickRecipeImage(html, PAGE, null)).toBe("https://cdn.x.com/share.jpg");
  });

  it("reads share tags written with name= and single quotes", () => {
    expect(pickRecipeImage("<meta name='og:image' content='https://cdn.x.com/n.jpg'>", PAGE)).toBe("https://cdn.x.com/n.jpg");
  });

  it("prefers the https version of the share image", () => {
    const html = '<meta property="og:image" content="http://x.com/a.jpg"><meta property="og:image:secure_url" content="https://x.com/a.jpg">';
    expect(pickRecipeImage(html, PAGE)).toBe("https://x.com/a.jpg");
  });

  it("then tries the twitter image and image_src", () => {
    expect(pickRecipeImage('<meta name="twitter:image" content="https://x.com/t.jpg">', PAGE)).toBe("https://x.com/t.jpg");
    expect(pickRecipeImage('<link rel="image_src" href="/i/l.jpg">', PAGE)).toBe("https://www.example-recipes.com/i/l.jpg");
  });

  it("skips logos, icons, svgs and tracking pixels", () => {
    const html = '<meta property="og:image" content="https://x.com/site-logo.png"><meta name="twitter:image" content="https://x.com/food.jpg">';
    expect(pickRecipeImage(html, PAGE, "https://x.com/icon.svg")).toBe("https://x.com/food.jpg");
    expect(toFullImageUrl("data:image/gif;base64,R0lGOD", PAGE)).toBeNull();
    expect(toFullImageUrl("https://x.com/pixel.gif", PAGE)).toBeNull();
  });

  it("decodes &amp; in links", () => {
    expect(pickRecipeImage('<meta property="og:image" content="https://x.com/a.jpg?w=800&amp;h=600">', PAGE)).toBe("https://x.com/a.jpg?w=800&h=600");
  });

  it("gives null when there's no photo anywhere", () => {
    expect(pickRecipeImage("<html><body>no pics</body></html>", PAGE)).toBeNull();
  });
});
