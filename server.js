require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const { Job, connectDB } = require("./src/db");
const { runScrape } = require("./src/scrape");
const { esc } = require("./src/util");

const app = express();
const PORT = process.env.PORT || 4000;
const RF = (process.env.RESUMEFORGE_URL || "https://your-resumeforge-url").replace(/\/$/, "");
const PER_PAGE = 24;

const FIELD_META = {
  engineering: { label: "Engineering / Tech",   emoji: "⚙️" },
  medical:     { label: "Medical / Healthcare", emoji: "🩺" },
  legal:       { label: "Legal",                emoji: "⚖️" },
  teaching:    { label: "Teaching",             emoji: "📚" },
  finance:     { label: "Finance",              emoji: "📊" },
  business:    { label: "Business / Mgmt",      emoji: "💼" },
  design:      { label: "Design",               emoji: "🎨" },
  sales:       { label: "Sales / Marketing",    emoji: "📈" },
  general:     { label: "Other",                emoji: "✨" },
};
const fieldLabel = (f) => (FIELD_META[f]?.label || "Other");

// ── ResumeForge deep link ──────────────────────────────────
function rfLink(job) {
  const p = new URLSearchParams({
    role: job.title || "",
    field: job.field || "general",
    jd: (job.description || "").slice(0, 3000),
    utm_source: "jobboard",
    utm_medium: "job_cta",
  });
  return `${RF}/?${p.toString()}`;
}

// ── Layout ─────────────────────────────────────────────────
function layout({ title, desc, body }) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || "")}"/>
<link rel="stylesheet" href="/styles.css"/>
</head><body>
<header class="nav">
  <a href="/" class="logo">Fresher<span>Jobs</span></a>
  <a class="nav-cta" href="${RF}" target="_blank" rel="noopener">Build your resume →</a>
</header>
${body}
<footer class="foot">
  <p>FresherJobs aggregates entry-level openings from public company career boards.
  Found a role? <a href="${RF}" target="_blank" rel="noopener">Build a tailored resume in 30s →</a></p>
</footer>
</body></html>`;
}

function searchBar(q = "", field = "") {
  return `<form class="search" method="get" action="/">
    ${field ? `<input type="hidden" name="field" value="${esc(field)}"/>` : ""}
    <input name="q" value="${esc(q)}" placeholder="Search role, company, skill…"/>
    <button type="submit">Search</button>
  </form>`;
}

function jobCard(j) {
  const loc = j.remote ? "🌐 Remote" : esc(j.location || "—");
  return `<a class="card" href="/job/${j._id}">
    <div class="card-top">
      <span class="card-field">${esc(fieldLabel(j.field))}</span>
      ${j.remote ? '<span class="card-remote">Remote</span>' : ""}
    </div>
    <h2 class="card-title">${esc(j.title)}</h2>
    <div class="card-co">${esc(j.company || "")}</div>
    <div class="card-loc">${loc}</div>
  </a>`;
}

// ── Category landing (no jobs loaded — pick a category first) ──
function renderLanding(countMap, total) {
  const tiles = Object.entries(FIELD_META)
    .map(([k, m]) => {
      const n = countMap[k] || 0;
      return `<a class="cat ${n ? "" : "cat-empty"}" href="/?field=${k}">
        <span class="cat-emoji">${m.emoji}</span>
        <span class="cat-name">${esc(m.label)}</span>
        <span class="cat-count">${n} ${n === 1 ? "job" : "jobs"}</span>
      </a>`;
    })
    .join("");

  const body = `
  <section class="hero">
    <h1>Fresher jobs &amp; internships</h1>
    <p>${total.toLocaleString("en-IN")} entry-level openings across India, refreshed daily.<br/>Pick a category to explore — then build a resume tailored to any job.</p>
    ${searchBar()}
  </section>
  <section class="cats">
    <div class="cats-label">Browse by category</div>
    <div class="cats-grid">${tiles}</div>
  </section>`;

  return layout({
    title: "FresherJobs — entry-level jobs & internships in India",
    desc: "Free board of fresher jobs and internships from public company career pages. Pick a category and build a resume tailored to any job in 30 seconds.",
    body,
  });
}

// ── Paginated listing for one category or a search ──────────
function renderListing({ jobs, total, page, q, field }) {
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const heading = q
    ? `Results for “${esc(q)}”`
    : `${FIELD_META[field]?.emoji || ""} ${esc(fieldLabel(field))} jobs`;

  const qs = (p) => {
    const u = new URLSearchParams();
    if (field) u.set("field", field);
    if (q) u.set("q", q);
    u.set("page", p);
    return "/?" + u.toString();
  };
  const pager = pages > 1
    ? `<div class="pager">
        ${page > 1 ? `<a class="pg" href="${qs(page - 1)}">← Prev</a>` : `<span class="pg pg-off">← Prev</span>`}
        <span class="pg-info">Page ${page} of ${pages}</span>
        ${page < pages ? `<a class="pg" href="${qs(page + 1)}">Next →</a>` : `<span class="pg pg-off">Next →</span>`}
      </div>`
    : "";

  const body = `
  <section class="list-head">
    <a class="back" href="/">← All categories</a>
    <h1>${heading}</h1>
    <p class="list-count">${total.toLocaleString("en-IN")} ${total === 1 ? "opening" : "openings"}</p>
    ${searchBar(q, field)}
  </section>
  <section class="grid">
    ${jobs.length ? jobs.map(jobCard).join("") : '<p class="empty">No jobs in this category yet — check back soon.</p>'}
  </section>
  ${pager}`;

  return layout({
    title: `${q ? `“${q}”` : fieldLabel(field)} jobs — FresherJobs`,
    desc: `Browse ${fieldLabel(field)} fresher jobs and internships. Build a tailored resume for any role in 30 seconds.`,
    body,
  });
}

// ── Routes ─────────────────────────────────────────────────
app.use(express.static("public"));

app.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const field = (req.query.field || "").trim();
    const browsing = !!(q || (field && FIELD_META[field]));

    // Landing: categories only, no job list (load jobs after a category click)
    if (!browsing) {
      const [counts, total] = await Promise.all([
        Job.aggregate([{ $group: { _id: "$field", n: { $sum: 1 } } }]),
        Job.estimatedDocumentCount(),
      ]);
      const countMap = Object.fromEntries(counts.map((c) => [c._id, c.n]));
      return res.send(renderLanding(countMap, total));
    }

    // Listing: filtered + paginated
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filter = {};
    if (q) filter.$text = { $search: q };
    if (field && FIELD_META[field]) filter.field = field;

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean(),
      Job.countDocuments(filter),
    ]);
    return res.send(renderListing({ jobs, total, page, q, field }));
  } catch (e) {
    console.error("listing error:", e.message);
    res.status(503).send(layout({ title: "FresherJobs", body: '<section class="hero"><h1>Just a moment…</h1><p>Loading jobs — if this persists, the database may still be connecting. Please refresh shortly.</p></section>' }));
  }
});

app.get("/job/:id", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).lean().catch(() => null);
    if (!job) {
      return res.status(404).send(layout({ title: "Job not found", body: '<section class="list-head"><a class="back" href="/">← All categories</a><h1>Job not found</h1></section>' }));
    }
    const link = rfLink(job);
    const descHtml = esc(job.description || "").replace(/\n/g, "<br/>");
    const body = `
    <section class="detail">
      <a class="back" href="/?field=${esc(job.field)}">← ${esc(fieldLabel(job.field))} jobs</a>
      <span class="card-field">${esc(fieldLabel(job.field))}</span>
      <h1>${esc(job.title)}</h1>
      <div class="detail-meta">
        <strong>${esc(job.company || "")}</strong>
        <span>${job.remote ? "🌐 Remote" : esc(job.location || "")}</span>
      </div>

      <div class="cta-box">
        <div>
          <div class="cta-title">Applying for this role?</div>
          <div class="cta-sub">Generate a resume tailored to this exact job — the description is preloaded for you.</div>
        </div>
        <a class="cta-btn" href="${link}" target="_blank" rel="noopener">✦ Build a tailored resume →</a>
      </div>

      <div class="detail-actions">
        <a class="apply" href="${esc(job.url)}" target="_blank" rel="noopener">Apply on company site ↗</a>
      </div>

      <h3>Job description</h3>
      <div class="detail-desc">${descHtml}</div>
    </section>`;

    res.send(layout({
      title: `${job.title} at ${job.company} — FresherJobs`,
      desc: (job.description || "").slice(0, 155),
      body,
    }));
  } catch (e) {
    console.error("detail error:", e.message);
    res.status(503).send(layout({ title: "FresherJobs", body: '<section class="list-head"><h1>Just a moment…</h1></section>' }));
  }
});

app.get("/api/jobs", async (req, res) => {
  const jobs = await Job.find({}).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ count: jobs.length, jobs });
});

app.get("/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ── Boot: serve first, then connect + schedule scraping ────
app.listen(PORT, () => console.log(`✅ FresherJobs board running on port ${PORT}`));

connectDB(process.env.MONGO_URI)
  .then(() => {
    const expr = process.env.SCRAPE_CRON || "0 */3 * * *";
    cron.schedule(expr, () => runScrape().catch((e) => console.error("scrape error:", e.message)));
    runScrape().catch((e) => console.error("initial scrape failed:", e.message));
  })
  .catch((e) => {
    console.error("❌ MongoDB connection failed:", e.message);
    console.error("   Check: MONGO_URI is set, password is URL-encoded, and Atlas Network Access allows 0.0.0.0/0.");
  });

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e?.message || e));
