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
  const cleanText = cleanTimeText(text)
    .toLowerCase()
    .replace(/\s+ago$/, "")
    .replace(/前$/, "")
    .trim();
  const match = cleanText.match(/^(\d+)\s*(s|m|h|d|w|mo|y|sec|secs|min|mins|hr|hrs|hour|hours|day|days|wk|wks|week|weeks|mon|mons|month|months|yr|yrs|year|years|秒|秒钟|秒鐘|分|分钟|分鐘|小时|小時|时|時|天|日|周|週|星期|个月|個月|年)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const unit = match[2];
  if (unit.startsWith("s") || unit.startsWith("秒")) return new Date(now.getTime() - value * 1000);
  if (unit === "m" || unit.startsWith("min") || unit === "分" || unit === "分钟" || unit === "分鐘") {
    return new Date(now.getTime() - value * MINUTE_MS);
  }
  if (unit === "h" || unit.startsWith("hr") || unit.startsWith("hour") || unit === "小时" || unit === "小時" || unit === "时" || unit === "時") {
    return new Date(now.getTime() - value * HOUR_MS);
  }
  if (unit === "d" || unit.startsWith("day") || unit === "天" || unit === "日") {
    return new Date(now.getTime() - value * DAY_MS);
  }
  if (unit === "w" || unit.startsWith("wk") || unit.startsWith("week") || unit === "周" || unit === "週" || unit === "星期") {
    return new Date(now.getTime() - value * 7 * DAY_MS);
  }
  if (unit === "mo" || unit.startsWith("mon") || unit.startsWith("month") || unit === "个月" || unit === "個月") {
    return new Date(now.getTime() - value * 30 * DAY_MS);
  }
  if (unit === "y" || unit.startsWith("yr") || unit.startsWith("year") || unit === "年") {
    return new Date(now.getTime() - value * 365 * DAY_MS);
  }

  return null;
}

export function parseAbsoluteXDate(text, now = new Date()) {
  const cleanText = cleanTimeText(text);
  const match = cleanText.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (match) {
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

  const monthYearMatch = cleanText.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const month = MONTHS[monthYearMatch[1].toLowerCase()];
    const year = Number(monthYearMatch[2]);
    if (month === undefined || !Number.isFinite(year)) return null;
    return new Date(year, month, 1, 12, 0, 0, 0);
  }

  const localizedMatch = cleanText.match(/^(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号|號)?$/);
  if (localizedMatch) {
    const explicitYear = localizedMatch[1] ? Number(localizedMatch[1]) : null;
    const month = Number(localizedMatch[2]) - 1;
    const day = Number(localizedMatch[3]);
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;

    let year = explicitYear || now.getFullYear();
    let date = new Date(year, month, day, 12, 0, 0, 0);
    if (!explicitYear && date.getTime() > now.getTime() + DAY_MS) {
      year -= 1;
      date = new Date(year, month, day, 12, 0, 0, 0);
    }

    return date;
  }

  return null;
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
