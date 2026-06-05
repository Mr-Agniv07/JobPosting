// Ashby public job board API — legal, structured.
//   https://api.ashbyhq.com/posting-api/job-board/{token}
// Returns { jobs: [...] }.

const { stripHtml, truncate, mapField, companyName } = require("../util");
const { isFresher } = require("../fresherFilter");

const API = "https://api.ashbyhq.com/posting-api/job-board";

async function fetchAshby(token) {
  const r = await fetch(`${API}/${token}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();

  const out = [];
  for (const j of data.jobs || []) {
    if (j.isListed === false) continue;
    const title = (j.title || "").trim();
    const desc = j.descriptionPlain || stripHtml(j.descriptionHtml || "");
    if (!isFresher(title, desc)) continue;

    const location = j.location || "";
    out.push({
      source: "ashby",
      sourceId: String(j.id),
      title,
      company: companyName(token),
      location,
      url: j.jobUrl || j.applyUrl || "",
      description: truncate(desc, 8000),
      field: mapField(title),
      remote: !!j.isRemote || /remote/i.test(j.workplaceType || "") || /remote/i.test(location),
      postedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
    });
  }
  return out;
}

module.exports = { fetchAshby };
