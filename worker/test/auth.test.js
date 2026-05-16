import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT, importPKCS8 } from "jose";
import { verifyFirebaseToken, _resetCertCache } from "../src/auth.js";
import { fixture } from "./helpers.js";

// test-only key + self signed cert in fixtures/, standing in for Google's
const PROJECT = "recipe-book-e3d63";
const certJson = { "test-kid": fixture("test-cert.pem") };
const fakeCertFetch = async () =>
  new Response(JSON.stringify(certJson), { headers: { "cache-control": "public, max-age=3600" } });

async function makeToken(overrides = {}, header = {}) {
  const key = await importPKCS8(fixture("test-key-pkcs8.pem"), "RS256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ auth_time: now - 10, ...overrides.claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-kid", ...header })
    .setIssuer(overrides.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(overrides.aud ?? PROJECT)
    .setSubject(overrides.sub ?? "user-123")
    .setIssuedAt(now - 10)
    .setExpirationTime(overrides.exp ?? now + 3600)
    .sign(key);
}

describe("verifyFirebaseToken", () => {
  beforeEach(() => _resetCertCache());

  it("accepts a valid token and returns the uid", async () => {
    const token = await makeToken();
    await expect(verifyFirebaseToken(token, PROJECT, { fetchImpl: fakeCertFetch })).resolves.toEqual({
      uid: "user-123",
    });
  });

  it("rejects a token for another Firebase project", async () => {
    const token = await makeToken({ aud: "someone-elses-app", iss: "https://securetoken.google.com/someone-elses-app" });
    await expect(verifyFirebaseToken(token, PROJECT, { fetchImpl: fakeCertFetch })).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await makeToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyFirebaseToken(token, PROJECT, { fetchImpl: fakeCertFetch })).rejects.toThrow();
  });

  it("rejects an unknown key id", async () => {
    const token = await makeToken({}, { kid: "not-a-google-key" });
    await expect(verifyFirebaseToken(token, PROJECT, { fetchImpl: fakeCertFetch })).rejects.toThrow(/unknown key/);
  });

  it("rejects a token with no uid", async () => {
    const token = await makeToken({ sub: "" });
    await expect(verifyFirebaseToken(token, PROJECT, { fetchImpl: fakeCertFetch })).rejects.toThrow();
  });

  it("rejects garbage", async () => {
    await expect(verifyFirebaseToken("abc.def.ghi", PROJECT, { fetchImpl: fakeCertFetch })).rejects.toThrow();
    await expect(verifyFirebaseToken("", PROJECT, { fetchImpl: fakeCertFetch })).rejects.toThrow();
  });
});
