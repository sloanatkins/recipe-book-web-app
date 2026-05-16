import { decodeProtectedHeader, importX509, jwtVerify } from "jose";

// Checks a Firebase ID token without the Admin SDK (it doesn't run on
// Workers). Follows Firebase's "verify ID tokens using a third-party JWT
// library" rules: RS256, kid matches Google's current certs, right aud/iss,
// not expired, and a non-empty sub (the user's uid).

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certCache = { certs: null, expires: 0 };

async function getCerts(fetchImpl) {
  const now = Date.now();
  if (certCache.certs && now < certCache.expires) return certCache.certs;

  const res = await fetchImpl(CERTS_URL);
  if (!res.ok) throw new Error("couldn't load firebase certs");
  const certs = await res.json();

  // google says how long to cache them in Cache-Control max-age
  const maxAge = Number((res.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  certCache = { certs, expires: now + maxAge * 1000 };
  return certs;
}

export async function verifyFirebaseToken(token, projectId, { fetchImpl = fetch } = {}) {
  if (!token) throw new Error("missing token");

  const { alg, kid } = decodeProtectedHeader(token);
  if (alg !== "RS256" || !kid) throw new Error("bad token header");

  const certs = await getCerts(fetchImpl);
  const pem = certs[kid];
  if (!pem) throw new Error("unknown key id");

  const key = await importX509(pem, "RS256");
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("no uid in token");
  if (typeof payload.auth_time !== "number" || payload.auth_time > nowSec + 60) {
    throw new Error("bad auth_time");
  }
  return { uid: payload.sub };
}

// only for tests
export function _resetCertCache() {
  certCache = { certs: null, expires: 0 };
}
