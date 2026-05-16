import { describe, it, expect, vi } from "vitest";
import { parseModelJson, buildMessages, callGroq } from "../src/groq.js";
import { checkUserLimit, recordUserImport, checkGlobalModelLimit, recordModelCall } from "../src/limits.js";
import { fakeKV, groqResponse } from "./helpers.js";

describe("parseModelJson", () => {
  it("parses plain JSON", () => {
    expect(parseModelJson('{"title":"x"}')).toEqual({ title: "x" });
  });
  it("ignores a <think> block from reasoning models", () => {
    expect(parseModelJson('<think>hmm {not json}</think>\n{"title":"x"}')).toEqual({ title: "x" });
  });
  it("handles ```json fences", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("returns null for junk", () => {
    expect(parseModelJson("sorry, I can't")).toBeNull();
    expect(parseModelJson('{"a":')).toBeNull();
  });
});

describe("buildMessages", () => {
  it("sends images as image_url parts", () => {
    const m = buildMessages({ type: "images", images: ["data:image/png;base64,AAA"] });
    expect(m[1].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAA" } });
  });
  it("wraps page text in content tags and adds the retry note", () => {
    const m = buildMessages({ type: "text", text: "1 cup rice" }, "title: Required");
    expect(m[1].content).toMatch(/<content>\n1 cup rice\n<\/content>/);
    expect(m[2].content).toMatch(/title: Required/);
  });
});

describe("callGroq", () => {
  it("sends a capped, json mode request with the key in the header", async () => {
    const fetchImpl = vi.fn(async () => groqResponse('{"title":"x"}'));
    const res = await callGroq({ apiKey: "k", model: "m", messages: [], fetchImpl });
    expect(res).toMatchObject({ ok: true, json: { title: "x" } });
    const [, init] = fetchImpl.mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(sent.max_completion_tokens).toBe(2000);
    expect(sent.response_format).toEqual({ type: "json_object" });
  });

  it("maps 429 to a rate limit code", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
    expect(await callGroq({ apiKey: "k", model: "m", messages: [], fetchImpl })).toEqual({
      ok: false,
      code: "model_rate_limited",
    });
  });
});

describe("daily limits", () => {
  it("lets a user through until the cap, then stops them", async () => {
    const kv = fakeKV();
    const now = Date.UTC(2026, 10, 5, 12);
    for (let i = 0; i < 3; i++) {
      expect((await checkUserLimit(kv, "u1", 3, now)).allowed).toBe(true);
      await recordUserImport(kv, "u1", now);
    }
    expect((await checkUserLimit(kv, "u1", 3, now)).allowed).toBe(false);
    // someone else isn't affected
    expect((await checkUserLimit(kv, "u2", 3, now)).allowed).toBe(true);
  });

  it("resets the next UTC day", async () => {
    const kv = fakeKV();
    const today = Date.UTC(2026, 10, 5, 23, 59);
    await recordUserImport(kv, "u1", today);
    expect((await checkUserLimit(kv, "u1", 1, today)).allowed).toBe(false);
    expect((await checkUserLimit(kv, "u1", 1, today + 120_000)).allowed).toBe(true);
  });

  it("tracks global model calls separately", async () => {
    const kv = fakeKV();
    await recordModelCall(kv);
    await recordModelCall(kv);
    expect((await checkGlobalModelLimit(kv, 2)).allowed).toBe(false);
  });
});
