require("dotenv").config();
const { Job, connectDB } = require("./db");
const { fetchGreenhouse } = require("./sources/greenhouse");
const { fetchLever } = require("./sources/lever");
const { fetchAshby } = require("./sources/ashby");
const { fetchAdzuna } = require("./sources/adzuna");

function tokens(envVar, fallback) {
  return (process.env[envVar] || fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Each source: [label, fetchFn, list of board tokens].
function sources() {
  return [
    ["greenhouse", fetchGreenhouse, tokens("GREENHOUSE_BOARDS", "groww,phonepe,postman,slice,druva")],
    ["lever",      fetchLever,      tokens("LEVER_BOARDS", "paytm,cred,meesho,zeta,mindtickle,porter,fi,fampay,hevodata")],
    ["ashby",      fetchAshby,      tokens("ASHBY_BOARDS", "scaler,atlan")],
  ];
}

// Upsert by (source, sourceId): updates existing rows, inserts new ones.
async function upsertJobs(jobs) {
  let added = 0;
  for (const job of jobs) {
    const res = await Job.updateOne(
      { source: job.source, sourceId: job.sourceId },
      { $set: { ...job, fetchedAt: new Date() } },
      { upsert: true }
    );
    if (res.upsertedCount) added++;
  }
  return added;
}

// Runs every source × every token. Each board is isolated in try/catch so one
// failing board never aborts the whole run.
async function runScrape() {
  console.log("⏳ Scrape started:", new Date().toISOString());
  let seen = 0, added = 0;

  for (const [label, fn, list] of sources()) {
    for (const token of list) {
      try {
        const jobs = await fn(token);
        const n = await upsertJobs(jobs);
        seen += jobs.length;
        added += n;
        console.log(`  ${label}/${token}: ${jobs.length} fresher jobs (${n} new)`);
      } catch (e) {
        console.warn(`  ${label}/${token}: failed — ${e.message}`);
      }
    }
  }

  // Adzuna aggregator — one call, internally runs several searches. Skips
  // silently if ADZUNA_APP_ID/KEY aren't set.
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    try {
      const jobs = await fetchAdzuna();
      const n = await upsertJobs(jobs);
      seen += jobs.length;
      added += n;
      console.log(`  adzuna: ${jobs.length} fresher jobs (${n} new)`);
    } catch (e) {
      console.warn(`  adzuna: failed — ${e.message}`);
    }
  } else {
    console.log("  adzuna: skipped (set ADZUNA_APP_ID + ADZUNA_APP_KEY to enable)");
  }

  // Prune stale listings not refreshed in 21 days (filled, expired, or from a
  // source token you've since removed). Keeps the board fresh automatically.
  const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const pruned = await Job.deleteMany({ fetchedAt: { $lt: cutoff } });
  if (pruned.deletedCount) console.log(`🧹 Pruned ${pruned.deletedCount} stale jobs.`);

  console.log(`✅ Scrape done: ${seen} fresher jobs seen, ${added} new added.`);
  return { seen, added };
}

// Allow standalone run:  npm run scrape
if (require.main === module) {
  (async () => {
    await connectDB(process.env.MONGO_URI);
    await runScrape();
    process.exit(0);
  })();
}

module.exports = { runScrape };
