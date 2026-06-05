// Heuristic: is this job appropriate for a fresher / entry-level candidate?
// Keyword-based and deliberately tunable — adjust the patterns as you learn
// which roles your audience actually wants.

// Strong "this is entry-level" signals.
const INCLUDE = /\b(freshers?|fresh\s*graduate|graduate|trainee|intern(ship)?|entry[\s-]?level|junior|jr\.?|campus|off[\s-]?campus|early[\s-]?career|new\s*grad|walk[\s-]?in|(0|1)\s*(to|[–-])?\s*[12]\s*years?|up\s*to\s*2\s*years?|no\s+(prior\s+)?experience|associate(?!\s+director|\s+vice|\s+principal))\b/i;

// Strong "this is senior" signals — if present in the TITLE, reject outright.
const EXCLUDE_TITLE = /\b(senior|sr\.?|staff|principal|lead|manager|head|director|\bvp\b|vice\s*president|architect|chief|expert)\b/i;

// Experience demands that disqualify a fresher, anywhere in the text.
const EXCLUDE_EXP = /\b([3-9]|1[0-9])\s*\+?\s*years?\b|\bminimum\s+(of\s+)?[3-9]\s*years\b/i;

function isFresher(title = "", description = "") {
  if (EXCLUDE_TITLE.test(title)) return false;     // senior in the title → out
  if (INCLUDE.test(title)) return true;            // fresher word in title → in

  const hay = `${title}\n${description}`;
  if (EXCLUDE_EXP.test(hay)) return false;          // "5+ years required" → out
  return INCLUDE.test(hay);                         // fresher signals in body → in
}

module.exports = { isFresher };
