// The worker fetches whatever URL a user pastes, which is how SSRF bugs happen
// (someone pastes http://169.254.169.254/ or an internal hostname and makes
// the server go read it). So: https/http only, no IP literals in private
// ranges, no localhost-ish names, and every redirect hop gets re-checked.

export class ImportError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home.arpa"];

export function checkUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new ImportError("bad_url", "That doesn't look like a link.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImportError("bad_url", "Only http and https links work.");
  }
  if (url.username || url.password) {
    throw new ImportError("bad_url", "Links with a username or password aren't allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new ImportError("bad_url", "That link uses an unusual port.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const singleLabel = !host.includes(".") && !host.includes(":"); // like "intranet"
  if (host === "localhost" || singleLabel || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new ImportError("bad_url", "That link points somewhere private.");
  }
  if (isPrivateIp(host)) {
    throw new ImportError("bad_url", "That link points somewhere private.");
  }
  return url;
}

export function isPrivateIp(host) {
  // IPv4 literal
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier NAT
      (a === 169 && b === 254) ||           // link local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224                              // multicast + reserved
    );
  }
  // IPv6 literal
  if (host.includes(":")) {
    const h = host.toLowerCase();
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
    if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
    if (h.startsWith("::ffff:")) return isPrivateIp(h.slice(7)); // v4 mapped
    return false;
  }
  return false;
}

// Fetches a page as text with a timeout, a size cap and manual redirects
export async function fetchPage(rawUrl, { fetchImpl = fetch, timeoutMs = 8000, maxBytes = 2_000_000 } = {}) {
  let url = checkUrl(rawUrl);

  for (let hop = 0; hop < 4; hop++) {
    let res;
    try {
      res = await fetchImpl(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": "RecipeBookImporter/1.0 (personal recipe app)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      if (err && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new ImportError("fetch_timeout", "That site took too long to respond.", 504);
      }
      throw new ImportError("fetch_failed", "Couldn't reach that site.", 502);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new ImportError("fetch_failed", "That site sent a broken redirect.", 502);
      url = checkUrl(new URL(loc, url).toString()); // re-check every hop
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new ImportError("blocked", "That site blocks imports. Try a screenshot instead.", 422);
    }
    if (!res.ok) {
      throw new ImportError("fetch_failed", `That site returned an error (${res.status}).`, 502);
    }

    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      throw new ImportError("not_html", "That link isn't a web page.", 422);
    }

    return { html: await readCapped(res, maxBytes), finalUrl: url.toString() };
  }
  throw new ImportError("fetch_failed", "Too many redirects.", 502);
}

// read the body but stop at maxBytes so a giant page can't eat the worker
async function readCapped(res, maxBytes) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return text + decoder.decode();
}
