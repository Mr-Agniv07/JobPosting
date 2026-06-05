const mongoose = require("mongoose");

// A single scraped job listing. Deduped on (source, sourceId) so re-scraping
// updates existing rows instead of creating duplicates.
const jobSchema = new mongoose.Schema(
  {
    source:      { type: String, required: true },           // e.g. "greenhouse"
    sourceId:    { type: String, required: true },           // unique id within that source
    title:       { type: String, required: true },
    company:     { type: String, default: "" },
    location:    { type: String, default: "" },
    url:         { type: String, default: "" },              // original apply link
    description: { type: String, default: "" },              // plain text, capped
    field:       { type: String, default: "general" },       // mapped to a ResumeForge profession
    remote:      { type: Boolean, default: false },
    postedAt:    { type: Date },
    fetchedAt:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

jobSchema.index({ source: 1, sourceId: 1 }, { unique: true });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ title: "text", company: "text" });

const Job = mongoose.model("Job", jobSchema);

async function connectDB(uri) {
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log("✅ MongoDB connected");
}

module.exports = { Job, connectDB };
