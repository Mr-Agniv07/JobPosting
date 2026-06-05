// Decode common HTML entities (Greenhouse returns job content HTML-escaped).
function decodeEntities(s = "") {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // decode &amp; last
}

// Turn HTML (possibly entity-escaped) into clean plain text.
function stripHtml(html = "") {
  return decodeEntities(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

function truncate(s = "", n) {
  return s.length > n ? s.slice(0, n) : s;
}

// Escape text for safe insertion into server-rendered HTML.
function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Map a job title to the closest ResumeForge profession (for the deep link).
const FIELD_MAP = [
  [/engineer|developer|software|\bsde\b|programmer|\bdata\b|devops|\bqa\b|tester|frontend|backend|full[\s-]?stack|\bml\b|\bai\b|android|\bios\b|cloud/i, "engineering"],
  [/nurse|doctor|physician|medical|clinical|pharma|healthcare|\bmbbs\b/i, "medical"],
  [/legal|lawyer|advocate|paralegal|counsel|compliance/i, "legal"],
  [/teacher|tutor|faculty|lecturer|professor|education|\btet\b/i, "teaching"],
  [/sales|marketing|business\s+development|\bbd\b|growth|account\s+(executive|manager)/i, "sales"],
  [/account(ant|ing)|finance|financial|audit|\btax\b|\bca\b|\bcfa\b|treasury|book\s*keep/i, "finance"],
  [/design|\bux\b|\bui\b|graphic|creative|visual|product design/i, "design"],
  [/manager|operations|consultant|strategy|product manager|\bpm\b|analyst/i, "business"],
];

function mapField(title = "") {
  for (const [re, f] of FIELD_MAP) if (re.test(title)) return f;
  return "general";
}

// Pretty display names for known board tokens (Lever/Ashby give no clean name).
const COMPANY_NAMES = {
  cred: "CRED", meesho: "Meesho", zeta: "Zeta", mindtickle: "Mindtickle",
  porter: "Porter", fi: "Fi Money", epifi: "Fi Money", phonepe: "PhonePe",
  groww: "Groww", postman: "Postman", slice: "slice", druva: "Druva",
  scaler: "Scaler", navi: "Navi", razorpay: "Razorpay", swiggy: "Swiggy",
};

function companyName(token = "") {
  if (COMPANY_NAMES[token]) return COMPANY_NAMES[token];
  // Title-case the token as a fallback (e.g. "browserstack" → "Browserstack")
  return token.charAt(0).toUpperCase() + token.slice(1);
}

// Does a location string look India-based (or remote, which Indian freshers can take)?
const INDIA_RE = /\b(india|bangalore|bengaluru|mumbai|delhi|gurgaon|gurugram|noida|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|chandigarh|kochi|coimbatore|indore|remote)\b/i;
function looksIndian(location = "") {
  return INDIA_RE.test(location);
}

module.exports = { stripHtml, truncate, esc, mapField, companyName, looksIndian };
