// Lever public postings API — legal, structured, plain-text descriptions.
//   https://api.lever.co/v0/postings/{token}?mode=json
// Returns an array of postings.

const { truncate, mapField, companyName } = require("../util");
const { isFresher } = require("../fresherFilter");

const API = "https://api.lever.co/v0/postings";

async function fetchLever(token) {
  const r = await fetch(`${API}/${token}?mode=json`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) return [];

  const out = [];
  for (const j of data) {
    const title = (j.text || "").trim();
    const desc = [j.descriptionPlain, j.additionalPlain].filter(Boolean).join("\n\n").trim();
    if (!isFresher(title, desc)) continue;

    const cats = j.categories || {};
    const location = cats.location || (cats.allLocations || []).join(", ") || "";
    out.push({
      source: "lever",
      sourceId: String(j.id),
      title,
      company: companyName(token),
      location,
      url: j.hostedUrl || j.applyUrl || "",
      description: truncate(desc, 8000),
      field: mapField(title),
      remote: /remote/i.test(j.workplaceType || "") || /remote/i.test(location),
      postedAt: j.createdAt ? new Date(j.createdAt) : undefined,
    });
  }
  return out;
}

module.exports = { fetchLever };
