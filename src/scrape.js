require("dotenv").config();
const { Job, connectDB } = require("./db");
const { fetchGreenhouse } = require("./sources/greenhouse");

function greenhouseBoards() {
  return (process.env.GREENHOUSE_BOARDS ||
    "stripe,airbnb,dropbox,figma,discord,reddit,coinbase,robinhood,databricks")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

// Runs all configured sources. Each source is isolated in try/catch so one
// failing board never aborts the whole run.
async function runScrape() {
  console.log("⏳ Scrape started:", new Date().toISOString());
  let seen = 0, added = 0;

  for (const token of greenhouseBoards()) {
    try {
      const jobs = await fetchGreenhouse(token);
      const n = await upsertJobs(jobs);
      seen += jobs.length;
      added += n;
      console.log(`  greenhouse/${token}: ${jobs.length} fresher jobs (${n} new)`);
    } catch (e) {
      console.warn(`  greenhouse/${token}: failed — ${e.message}`);
    }
  }

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
