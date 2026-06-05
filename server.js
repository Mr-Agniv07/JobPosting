require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const { Job, connectDB } = require("./src/db");
const { runScrape } = require("./src/scrape");
const { esc } = require("./src/util");

const app = express();
const PORT = process.env.PORT || 4000;
const RF = (process.env.RESUMEFORGE_URL || "https://your-resumeforge-url").replace(/\/$/, "");

app.use(express.static("public"));

const FIELDS = {
  engineering: "Engineering / Tech", medical: "Medical", legal: "Legal",
  teaching: "Teaching", finance: "Finance", business: "Business",
  design: "Design", sales: "Sales / Marketing", general: "Other",
};

// ── ResumeForge deep link ──────────────────────────────────
// Carries the job context into the builder, with the JD preloaded so the user
// lands on a form already set to "Tailor to this job". JD is capped to keep the
// URL a sane length — the first part of a JD holds the keywords that matter.
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

function jobCard(j) {
  const loc = j.remote ? "🌐 Remote" : esc(j.location || "—");
  return `<a class="card" href="/job/${j._id}">
    <div class="card-top">
      <span class="card-field">${esc(FIELDS[j.field] || "Other")}</span>
      ${j.remote ? '<span class="card-remote">Remote</span>' : ""}
    </div>
    <h2 class="card-title">${esc(j.title)}</h2>
    <div class="card-co">${esc(j.company || "")}</div>
    <div class="card-loc">${loc}</div>
  </a>`;
}

// ── Listings ───────────────────────────────────────────────
app.get("/", async (req, res) => {
  const q = (req.query.q || "").trim();
  const field = (req.query.field || "").trim();
  const filter = {};
  if (q) filter.$text = { $search: q };
  if (field && FIELDS[field]) filter.field = field;

  const jobs = await Job.find(filter).sort({ createdAt: -1 }).limit(60).lean();
  const total = await Job.estimatedDocumentCount();

  const chips = Object.entries(FIELDS)
    .map(([k, v]) => `<a class="chip ${field === k ? "on" : ""}" href="/?field=${k}">${esc(v)}</a>`)
    .join("");

  const body = `
  <section class="hero">
    <h1>Fresher jobs &amp; internships</h1>
    <p>${total.toLocaleString("en-IN")} entry-level openings, refreshed daily. Find one, then build a resume tailored to it.</p>
    <form class="search" method="get" action="/">
      <input name="q" value="${esc(q)}" placeholder="Search role, company, skill…"/>
      <button type="submit">Search</button>
    </form>
    <div class="chips"><a class="chip ${!field ? "on" : ""}" href="/">All</a>${chips}</div>
  </section>
  <section class="grid">
    ${jobs.length ? jobs.map(jobCard).join("") : '<p class="empty">No jobs yet — the scraper runs on a schedule. Check back shortly.</p>'}
  </section>`;

  res.send(layout({
    title: "FresherJobs — entry-level jobs & internships in India",
    desc: "Free board of fresher jobs and internships aggregated from public company career pages. Build a resume tailored to any job in 30 seconds.",
    body,
  }));
});

// ── Job detail ─────────────────────────────────────────────
app.get("/job/:id", async (req, res) => {
  const job = await Job.findById(req.params.id).lean().catch(() => null);
  if (!job) {
    return res.status(404).send(layout({ title: "Job not found", body: '<section class="hero"><h1>Job not found</h1><p><a href="/">← Back to all jobs</a></p></section>' }));
  }

  const link = rfLink(job);
  const descHtml = esc(job.description || "").replace(/\n/g, "<br/>");
  const body = `
  <section class="detail">
    <a class="back" href="/">← All jobs</a>
    <span class="card-field">${esc(FIELDS[job.field] || "Other")}</span>
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
});

// ── JSON API + health ──────────────────────────────────────
app.get("/api/jobs", async (req, res) => {
  const jobs = await Job.find({}).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ count: jobs.length, jobs });
});

app.get("/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ── Boot: connect, serve, schedule scraping ────────────────
(async () => {
  await connectDB(process.env.MONGO_URI);
  app.listen(PORT, () => console.log(`✅ FresherJobs board running on port ${PORT}`));

  const expr = process.env.SCRAPE_CRON || "0 */3 * * *";
  cron.schedule(expr, () => runScrape().catch((e) => console.error("scrape error:", e.message)));

  // Kick one scrape shortly after boot so a fresh deploy isn't empty.
  runScrape().catch((e) => console.error("initial scrape failed:", e.message));
})();
