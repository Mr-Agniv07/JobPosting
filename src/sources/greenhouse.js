// Greenhouse public job board API — legal, structured, no scraping hacks.
//   Board info:  https://boards-api.greenhouse.io/v1/boards/{token}
//   Jobs:        https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
// `content=true` includes the full HTML job description (entity-escaped).

const { stripHtml, truncate, mapField } = require("../util");
const { isFresher } = require("../fresherFilter");

const API = "https://boards-api.greenhouse.io/v1/boards";

async function fetchBoardName(token) {
  try {
    const r = await fetch(`${API}/${token}`);
    if (!r.ok) return token;
    const j = await r.json();
    return j.name || token;
  } catch {
    return token;
  }
}

// Returns an array of normalized, fresher-only job objects for one board token.
async function fetchGreenhouse(token) {
  const company = await fetchBoardName(token);
  const r = await fetch(`${API}/${token}/jobs?content=true`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();

  const out = [];
  for (const j of data.jobs || []) {
    const title = (j.title || "").trim();
    const desc = stripHtml(j.content || "");
    if (!isFresher(title, desc)) continue;

    const location = j.location?.name || "";
    out.push({
      source: "greenhouse",
      sourceId: String(j.id),
      title,
      company,
      location,
      url: j.absolute_url || "",
      description: truncate(desc, 8000),
      field: mapField(title),
      remote: /remote/i.test(location),
      postedAt: j.updated_at ? new Date(j.updated_at) : undefined,
    });
  }
  return out;
}

module.exports = { fetchGreenhouse };
