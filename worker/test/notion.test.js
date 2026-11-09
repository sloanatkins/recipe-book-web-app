import { describe, it, expect, vi } from "vitest";
import { isNotionUrl, extractNotionPageId, notionRecordMapToText, fetchNotionPage } from "../src/notion.js";
import { createHandler } from "../src/index.js";
import { baseEnv, importRequest, groqResponse } from "./helpers.js";

const PAGE_URL = "https://some-workspace-123.notion.site/Mai-Tai-187f18f069da803d9098c7b65840a166?pvs=73";
const PAGE_ID = "187f18f0-69da-803d-9098-c7b65840a166";

// made-up blocks in the shape Notion's page-data endpoint returns
const block = (id, type, text, extra = {}) => ({
  [id]: { value: { id, type, alive: true, properties: text ? { title: [[text]] } : undefined, ...extra } },
});

function fakeRecordMap({ nested = false } = {}) {
  const blocks = {
    ...block(PAGE_ID, "page", "Mai Tai", {
      content: ["h1", "i1", "i2", "i3", "h2", "s1", "s2", "img", "tog"],
      format: { page_cover: "https://example.com/maitai.jpg" },
    }),
    ...block("h1", "sub_header", "Ingredients"),
    ...block("i1", "bulleted_list", "2 oz aged rum"),
    ...block("i2", "bulleted_list", "3/4 oz lime juice"),
    ...block("i3", "bulleted_list", "1/2 oz orgeat"),
    ...block("h2", "sub_header", "Steps"),
    ...block("s1", "numbered_list", "Shake with ice."),
    ...block("s2", "numbered_list", "Strain over crushed ice."),
    ...block("img", "image", null),
    ...block("tog", "toggle", "Garnish", { content: ["g1"] }),
    ...block("g1", "text", "Mint sprig and a lime wheel"),
  };
  if (nested) {
    for (const k of Object.keys(blocks)) blocks[k] = { value: { value: blocks[k].value, role: "reader" } };
  }
  return { block: blocks };
}

describe("notion links", () => {
  it("recognizes notion urls", () => {
    expect(isNotionUrl(PAGE_URL)).toBe(true);
    expect(isNotionUrl("https://www.notion.so/abc")).toBe(true);
    expect(isNotionUrl("https://notnotion.site/x")).toBe(false);
    expect(isNotionUrl("https://www.allrecipes.com/x")).toBe(false);
  });

  it("pulls the page id out of the slug", () => {
    expect(extractNotionPageId(PAGE_URL)).toBe(PAGE_ID);
    expect(extractNotionPageId("https://www.notion.so/no-id-here")).toBeNull();
  });

  it("turns blocks into readable text in order", () => {
    const { title, text, imageUrl } = notionRecordMapToText(fakeRecordMap(), PAGE_ID);
    expect(title).toBe("Mai Tai");
    expect(imageUrl).toBe("https://example.com/maitai.jpg");
    expect(text.split("\n")).toEqual([
      "Mai Tai",
      "## Ingredients",
      "- 2 oz aged rum",
      "- 3/4 oz lime juice",
      "- 1/2 oz orgeat",
      "## Steps",
      "1. Shake with ice.",
      "2. Strain over crushed ice.",
      "Garnish",
      "Mint sprig and a lime wheel",
    ]);
  });

  it("handles the newer double-wrapped block format", () => {
    const { text } = notionRecordMapToText(fakeRecordMap({ nested: true }), PAGE_ID);
    expect(text).toMatch(/2 oz aged rum/);
  });

  it("falls back to notion.so when the site host fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(Response.json({ recordMap: fakeRecordMap() }));
    const page = await fetchNotionPage(PAGE_URL, { fetchImpl });
    expect(page.title).toBe("Mai Tai");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://www.notion.so/api/v3/loadCachedPageChunk");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).page.id).toBe(PAGE_ID);
  });

  it("explains private pages", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ recordMap: { block: {} } }));
    await expect(fetchNotionPage(PAGE_URL, { fetchImpl })).rejects.toMatchObject({ code: "page_unreadable" });
  });

  it("imports a notion page end to end through the model", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ recordMap: fakeRecordMap() }));
    const groqFetch = vi.fn(async () =>
      groqResponse(
        JSON.stringify({
          title: "Mai Tai",
          servings: 1,
          minutes: null,
          cuisine: null,
          ingredients: [{ section: null, items: ["2 oz aged rum", "3/4 oz lime juice", "1/2 oz orgeat"] }],
          instructions: ["Shake with ice.", "Strain over crushed ice."],
        })
      )
    );
    const handle = createHandler({ verifyToken: async () => ({ uid: "u1" }), fetchImpl, groqFetch });
    const res = await handle(importRequest({ type: "url", url: PAGE_URL }), baseEnv());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.recipe.title).toBe("Mai Tai");
    expect(body.recipe.imageUrl).toBe("https://example.com/maitai.jpg");
    expect(body.recipe.sourceUrl).toBe(PAGE_URL);
    const sent = JSON.parse(groqFetch.mock.calls[0][1].body);
    expect(sent.messages[1].content).toMatch(/- 2 oz aged rum/);
  });
});

describe("notion database properties", () => {
  const COLL = "coll-1";
  const pageWithProps = () => ({
    block: {
      [PAGE_ID]: {
        value: {
          id: PAGE_ID,
          type: "page",
          parent_table: "collection",
          parent_id: COLL,
          properties: {
            title: [["Mojito"]],
            "a%3Bx": [["1"]],
            "Zq{t": [["5 min"]],
            dt: [["‣", [["d", { start_date: "2026-11-05" }]]]],
          },
          content: ["i1"],
        },
      },
      i1: { value: { id: "i1", type: "bulleted_list", properties: { title: [["10 mint leaves"]] } } },
    },
  });
  const schema = { "a%3Bx": { name: "Servings", type: "number" }, "Zq{t": { name: "Time", type: "text" }, dt: { name: "Made on", type: "date" } };

  it("puts named properties right under the title", () => {
    const rm = { ...pageWithProps(), collection: { [COLL]: { value: { id: COLL, schema } } } };
    const { text } = notionRecordMapToText(rm, PAGE_ID);
    expect(text.split("\n")).toEqual(["Mojito", "Servings: 1", "Time: 5 min", "- 10 mint leaves"]);
  });

  it("fetches the database schema when the page chunk doesn't include it", async () => {
    const fetchImpl = vi.fn(async (url) =>
      url.endsWith("loadCachedPageChunk")
        ? Response.json({ recordMap: pageWithProps() })
        : Response.json({ recordMap: { collection: { [COLL]: { value: { value: { id: COLL, schema }, role: "reader" } } } } })
    );
    const page = await fetchNotionPage(PAGE_URL, { fetchImpl });
    expect(page.text).toMatch(/Servings: 1\nTime: 5 min/);
    expect(fetchImpl.mock.calls[1][0]).toBe("https://some-workspace-123.notion.site/api/v3/syncRecordValues");
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).requests[0].pointer).toEqual({ table: "collection", id: COLL });
  });

  it("still sends the values if the schema can't be loaded", async () => {
    const fetchImpl = vi.fn(async (url) =>
      url.endsWith("loadCachedPageChunk") ? Response.json({ recordMap: pageWithProps() }) : new Response("no", { status: 500 })
    );
    const page = await fetchNotionPage(PAGE_URL, { fetchImpl });
    expect(page.text).toMatch(/Property: 1\nProperty: 5 min/);
  });
});
