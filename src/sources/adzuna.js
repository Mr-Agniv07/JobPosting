// Adzuna aggregator API — indexes the whole job market (incl. India), free tier.
//   https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id=..&app_key=..
// Returns { results: [ { id, title, description, redirect_url, company, location, created } ] }.
// Descriptions are snippets (Adzuna doesn't expose full JDs), but they carry the
// key role keywords — enough for ResumeForge's JD tailoring.

const { truncate, mapField } = require("../util");
const { isFresher } = require("../fresherFilter");

const BASE = "https://api.adzuna.com/v1/api/jobs";
const stripTags = (s = "") => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function fetchPage(country, what, page, id, key) {
  const p = new URLSearchParams({
    app_id: id,
    app_key: key,
    results_per_page: "50",
    what: what,
    max_days_old: "30",
    sort_by: "date",
    content_type: "application/json",
  });
  const r = await fetch(`${BASE}/${country}/search/${page}?${p.toString()}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// One source call that internally runs several fresher-oriented searches and
// dedupes. Returns [] (silently) if no API key is configured.
async function fetchAdzuna() {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return [];

  const country = process.env.ADZUNA_COUNTRY || "in";
  const queries = (process.env.ADZUNA_QUERIES || "fresher,graduate trainee,entry level,junior,intern")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const pages = parseInt(process.env.ADZUNA_PAGES, 10) || 2;

  const out = [];
  const seen = new Set();

  for (const what of queries) {
    for (let pg = 1; pg <= pages; pg++) {
      let data;
      try {
        data = await fetchPage(country, what, pg, id, key);
      } catch (e) {
        console.warn(`  adzuna "${what}" p${pg}: ${e.message}`);
        break; // stop this query on error (likely rate limit) and move on
      }
      const results = data.results || [];
      for (const j of results) {
        const sid = String(j.id);
        if (seen.has(sid)) continue;
        seen.add(sid);

        const title = stripTags(j.title || "");
        const desc = stripTags(j.description || "");
        if (!isFresher(title, desc)) continue;

        const location = j.location?.display_name || "";
        out.push({
          source: "adzuna",
          sourceId: sid,
          title,
          company: (j.company?.display_name || "").trim(),
          location,
          url: j.redirect_url || "",
          description: truncate(desc, 8000),
          field: mapField(title),
          remote: /remote/i.test(location) || /remote/i.test(title),
          postedAt: j.created ? new Date(j.created) : undefined,
        });
      }
      if (results.length < 50) break; // last page reached
    }
  }
  return out;
}

module.exports = { fetchAdzuna };
