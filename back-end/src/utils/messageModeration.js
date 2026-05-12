const CONTACT_DETAIL_WARNING =
  "For your safety, please keep contact details inside the protected exchange flow.";

const CHAT_ALLOWED_STATUSES = new Set(["in_discussion", "in_progress"]);

const arabicDigitMap = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

const normalizeDigits = (content) =>
  content.replace(/[٠-٩۰-۹]/g, (digit) => arabicDigitMap[digit] || digit);

const blockedPatterns = [
  /(?:\+?\d[\s().-]*){7,}/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b[a-z0-9._%+-]+\s+(?:at|@)\s+[a-z0-9.-]+\s+(?:dot|\.)\s+[a-z]{2,}\b/i,
  /\b(?:whats?app|telegram|instagram|facebook|snapchat|snap|discord)\b/i,
  /\b(?:wa\.me|t\.me)\b/i,
  /(^|[^\w])@[a-z0-9_.]{2,}/i,
  /\b(?:https?:\/\/|www\.)/i,
  /\b[a-z0-9-]+\s*\.\s*(?:com|net|org)\b/i,
  /\b(?:street|st\.?|road|avenue|building|apartment|floor|block|landmark|address)\b/i,
  /(?:شارع|عمارة|شقة|دور|عنوان|لوكيشن|مكان|واتساب|تليجرام|انستا|فيسبوك)/,
];

const containsBlockedContactDetails = (content) => {
  const normalized = normalizeDigits(content).toLowerCase();
  return blockedPatterns.some((pattern) => pattern.test(normalized));
};

module.exports = {
  CHAT_ALLOWED_STATUSES,
  CONTACT_DETAIL_WARNING,
  containsBlockedContactDetails,
};
