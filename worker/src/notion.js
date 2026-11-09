import { ImportError } from "./fetchPage.js";

// Public Notion pages are built by JavaScript in the browser, so fetching the
// page HTML only gets "JavaScript must be enabled". Notion's own web app loads
// the content from an internal endpoint, and that endpoint answers for any
// page that's shared to the web. It's not an official API, so if Notion
// changes it this path fails and the user gets the "try a screenshot" error.

const NOTION_HOST_RE = /(^|\.)notion\.(site|so)$/i;

export function isNotionUrl(url) {
  try {
    return NOTION_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// page ids are the last 32 hex chars in the path, like .../Mai-Tai-187f18f0...
export function extractNotionPageId(url) {
  const path = new URL(url).pathname;
  const m = path.match(/([0-9a-f]{32})(?:[^0-9a-f]|$)/i) || path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (!m) return null;
  const hex = m[1].replace(/-/g, "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function fetchNotionPage(rawUrl, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const url = new URL(rawUrl);
  const pageId = extractNotionPageId(rawUrl);
  if (!pageId) throw new ImportError("page_unreadable", "Couldn't find the page in that Notion link.", 422);

  // try the site's own host first (custom notion.site subdomains), then notion.so
  const hosts = [...new Set([url.hostname, "www.notion.so"])];
  let recordMap = null;
  let workingHost = null;

  for (const host of hosts) {
    try {
      const res = await fetchImpl(`https://${host}/api/v3/loadCachedPageChunk`, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: { id: pageId },
          limit: 100,
          cursor: { stack: [] },
          chunkNumber: 0,
          verticalColumns: false,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.recordMap?.block?.[pageId]) {
        recordMap = data.recordMap;
        workingHost = host;
        break;
      }
    } catch {
      // try the next host
    }
  }

  if (!recordMap) {
    throw new ImportError(
      "page_unreadable",
      "Couldn't read that Notion page. Make sure it's shared to the web, or try a screenshot.",
      422
    );
  }

  // pages in a Notion database keep things like Servings and Time as
  // properties. the property names live on the database ("collection"), which
  // the page chunk doesn't always include, so fetch it if it's missing
  const page = getBlock(recordMap, pageId);
  if (page?.parent_table === "collection" && page.parent_id && !getCollection(recordMap, page.parent_id)) {
    try {
      const res = await fetchImpl(`https://${workingHost}/api/v3/syncRecordValues`, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ pointer: { table: "collection", id: page.parent_id }, version: -1 }] }),
      });
      if (res.ok) {
        const data = await res.json();
        recordMap.collection = { ...(recordMap.collection || {}), ...(data?.recordMap?.collection || {}) };
      }
    } catch {
      // no names, we'll still send the values
    }
  }

  return notionRecordMapToText(recordMap, pageId);
}

function getCollection(recordMap, id) {
  const v = recordMap.collection?.[id]?.value;
  if (!v) return null;
  return v.value && v.value.schema ? v.value : v;
}

// Notion wraps blocks as { value: {...} }, and newer responses nest it once
// more as { value: { value: {...}, role } }. Handle both.
function getBlock(recordMap, id) {
  const entry = recordMap.block?.[id];
  const v = entry?.value;
  if (!v) return null;
  return v.value && v.value.type ? v.value : v;
}

// rich text is [["plain text", [annotations]], ...]
function richText(prop) {
  if (!Array.isArray(prop)) return "";
  return prop.map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : "")).join("").trim();
}

const PREFIX = {
  header: "# ",
  sub_header: "## ",
  sub_sub_header: "### ",
  bulleted_list: "- ",
  to_do: "- ",
  quote: "> ",
};

const SKIP_TYPES = new Set(["image", "video", "file", "pdf", "embed", "bookmark", "divider", "table_of_contents", "page", "collection_view", "collection_view_page"]);

export function notionRecordMapToText(recordMap, pageId) {
  const page = getBlock(recordMap, pageId);
  if (!page) return { title: "", text: "", imageUrl: null };

  const title = richText(page.properties?.title);

  // database properties, like "Servings: 1" or "Time: 5 min"
  const schema = (page.parent_table === "collection" && getCollection(recordMap, page.parent_id)?.schema) || {};
  const propLines = [];
  for (const [key, val] of Object.entries(page.properties || {})) {
    if (key === "title") continue;
    const text = richText(val);
    if (!text || text === "\u2023") continue; // ‣ is how Notion stores dates/mentions, skip those
    const name = schema[key]?.name;
    propLines.push(name ? `${name}: ${text}` : `Property: ${text}`);
  }

  const lines = [];
  const seen = new Set();
  let n = 0;

  const walk = (ids, depth) => {
    if (!Array.isArray(ids) || depth > 6) return;
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = getBlock(recordMap, id);
      if (!b || b.alive === false) continue;

      if (!SKIP_TYPES.has(b.type)) {
        const t = richText(b.properties?.title);
        if (t) {
          if (b.type === "numbered_list") lines.push(`${++n}. ${t}`);
          else {
            n = 0;
            lines.push((PREFIX[b.type] || "") + t);
          }
        }
      }
      // toggles, columns and list items can hold more blocks inside them
      if (b.type !== "page") walk(b.content, depth + 1);
    }
  };
  walk(page.content, 0);

  const cover = page.format?.page_cover;
  const imageUrl = typeof cover === "string" && /^https?:\/\//.test(cover) ? cover : null;

  return { title, text: [title, ...propLines, ...lines].filter(Boolean).join("\n"), imageUrl };
}
