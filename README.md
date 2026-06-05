# FresherJobs — entry-level jobs board (ResumeForge funnel)

A standalone job board that aggregates **fresher / entry-level** openings from
**public company career boards** (Greenhouse to start) and funnels candidates to
the [ResumeForge](../resumeforge-fullstack) CV builder — each job links into the
builder with its description **preloaded** for instant JD-tailored resumes.

This is an **independent project** from ResumeForge. The only coupling is the
deep link: `RESUMEFORGE_URL/?role=...&field=...&jd=...&utm_source=jobboard`,
which the ResumeForge builder reads via its `applyUrlPrefill()` bridge.

## Why these sources?

Big job sites (LinkedIn, Naukri, Indeed) **prohibit scraping** and block it.
Instead we use legal, structured, free endpoints:

- **Greenhouse** public board API (`boards-api.greenhouse.io`) — implemented.
- Lever / Ashby public boards, free job APIs (Arbeitnow, Remotive), RSS — easy
  to add later as new files under `src/sources/`.

> Realistic expectation: this gives **broad, fresh coverage** of the configured
> sources — not "every job on the internet." Widen coverage by adding more
> board tokens and sources over time.

## Setup

```bash
npm install
cp .env.example .env     # then fill in the values
npm run scrape           # one-off: pull jobs into MongoDB
npm run dev              # run the board locally (also scrapes on a schedule)
```

Requires **Node 18+** (uses global `fetch`).

### Required env

| Var | What |
|---|---|
| `MONGO_URI` | MongoDB connection (free Atlas cluster is fine) |
| `RESUMEFORGE_URL` | Public URL where the ResumeForge **builder (index.html)** is served — deep links point here |
| `GREENHOUSE_BOARDS` | Comma-separated company board tokens to pull from |
| `SCRAPE_CRON` | Cron expression for re-scraping (default every 3h) |
| `PORT` | Default 4000 |

### Finding Greenhouse board tokens

If a company's careers page is `https://boards.greenhouse.io/acme`, the token is
`acme`. Add tokens of companies that hire freshers in India to `GREENHOUSE_BOARDS`.

## How it works

```
cron → src/scrape.js → src/sources/greenhouse.js   (fetch + fresher filter)
                     → MongoDB (Job, deduped on source+sourceId)
server.js → SEO-rendered listing (/) + detail (/job/:id) pages
          → each job → "Build a tailored resume" → ResumeForge deep link
```

- **Fresher filter:** `src/fresherFilter.js` — keyword heuristics, fully tunable.
- **Field mapping:** `src/util.js` `mapField()` maps a job title to a ResumeForge
  profession so the builder opens on the right field.

## Adding a new source

Create `src/sources/<name>.js` exporting a function that returns normalized job
objects (`source, sourceId, title, company, location, url, description, field,
remote, postedAt`), then call it from `src/scrape.js`.

## Deploy

Deploy as its own service (e.g. a separate Render web service) on its own
domain/subdomain. Set the env vars above. The built-in cron keeps jobs fresh;
no separate worker needed for the MVP.
