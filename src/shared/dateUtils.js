const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

function cleanTimeText(text) {
  return String(text || "")
    .replace(/\u00b7/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRelativeTime(text, now = new Date()) {
  const cleanText = cleanTimeText(text).toLowerCase();
  const match = cleanText.match(/^(\d+)\s*(s|m|h|d|sec|secs|min|mins|hr|hrs|hour|hours|day|days)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const unit = match[2];
  if (unit.startsWith("s")) return new Date(now.getTime() - value * 1000);
  if (unit.startsWith("m")) return new Date(now.getTime() - value * MINUTE_MS);
  if (unit === "h" || unit.startsWith("hr") || unit.startsWith("hour")) {
    return new Date(now.getTime() - value * HOUR_MS);
  }
  if (unit === "d" || unit.startsWith("day")) {
    return new Date(now.getTime() - value * DAY_MS);
  }

  return null;
}

export function parseAbsoluteXDate(text, now = new Date()) {
  const cleanText = cleanTimeText(text);
  const match = cleanText.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const explicitYear = match[3] ? Number(match[3]) : null;
  if (month === undefined || !Number.isFinite(day) || day < 1 || day > 31) return null;

  let year = explicitYear || now.getFullYear();
  let date = new Date(year, month, day, 12, 0, 0, 0);

  if (!explicitYear && date.getTime() > now.getTime() + DAY_MS) {
    year -= 1;
    date = new Date(year, month, day, 12, 0, 0, 0);
  }

  return date;
}

export function parseXTimeText(text, now = new Date()) {
  return parseRelativeTime(text, now) || parseAbsoluteXDate(text, now);
}

export function diffDays(dateA, dateB = new Date()) {
  const start = dateA instanceof Date ? dateA : new Date(dateA);
  const end = dateB instanceof Date ? dateB : new Date(dateB);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

export function toIsoString(date) {
  const value = date instanceof Date ? date : new Date(date);
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}
