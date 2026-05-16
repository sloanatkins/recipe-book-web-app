import { describe, it, expect, vi } from "vitest";
import { checkUrl, isPrivateIp, fetchPage } from "../src/fetchPage.js";
import { htmlResponse } from "./helpers.js";

describe("checkUrl", () => {
  it("allows normal recipe links", () => {
    expect(checkUrl("https://www.allrecipes.com/recipe/123/").hostname).toBe("www.allrecipes.com");
  });

  it.each([
    "ftp://example.com/x",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost:8080/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.20.0.1/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://printer.local/",
    "http://intranet/",
    "https://user:pass@example.com/",
    "https://example.com:8443/",
    "not a url",
  ])("blocks %s", (bad) => {
    expect(() => checkUrl(bad)).toThrow();
  });
});

describe("isPrivateIp", () => {
  it("knows public from private", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("172.15.0.1")).toBe(false);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
  });
});

describe("fetchPage", () => {
  it("returns the html and final url", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<p>hi</p>"));
    const res = await fetchPage("https://example.com/r", { fetchImpl });
    expect(res.html).toBe("<p>hi</p>");
    expect(res.finalUrl).toBe("https://example.com/r");
  });

  it("follows a safe redirect", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/new" } }))
      .mockResolvedValueOnce(htmlResponse("<p>moved</p>"));
    const res = await fetchPage("https://example.com/old", { fetchImpl });
    expect(res.finalUrl).toBe("https://example.com/new");
  });

  it("refuses a redirect into a private address", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })
    );
    await expect(fetchPage("https://evil.example.com/", { fetchImpl })).rejects.toMatchObject({ code: "bad_url" });
  });

  it("gives up after too many redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    await expect(fetchPage("https://example.com/", { fetchImpl })).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it("explains blocked sites", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("nope", 403));
    await expect(fetchPage("https://example.com/", { fetchImpl })).rejects.toMatchObject({ code: "blocked" });
  });

  it("rejects things that aren't web pages", async () => {
    const fetchImpl = vi.fn(async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }));
    await expect(fetchPage("https://example.com/a.pdf", { fetchImpl })).rejects.toMatchObject({ code: "not_html" });
  });

  it("stops reading huge pages at the cap", async () => {
    // stream it in 10 chunks so the cap has something to cut
    const chunk = new TextEncoder().encode("a".repeat(5_000));
    let sent = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (sent++ < 10) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => htmlResponse(stream));
    const res = await fetchPage("https://example.com/", { fetchImpl, maxBytes: 10_000 });
    expect(res.html.length).toBeLessThan(50_000);
  });
});
