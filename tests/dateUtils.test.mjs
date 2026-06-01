import assert from "node:assert/strict";
import test from "node:test";

import { parseXTimeText } from "../src/shared/dateUtils.js";

const now = new Date("2026-06-01T12:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1000;

function assertLocalDateParts(date, year, monthIndex, day) {
  assert.ok(date instanceof Date);
  assert.equal(date.getFullYear(), year);
  assert.equal(date.getMonth(), monthIndex);
  assert.equal(date.getDate(), day);
}

test("parses extended relative X time strings", () => {
  assert.equal(parseXTimeText("1w", now).getTime(), now.getTime() - 7 * dayMs);
  assert.equal(parseXTimeText("2 months ago", now).getTime(), now.getTime() - 60 * dayMs);
  assert.equal(parseXTimeText("1 年前", now).getTime(), now.getTime() - 365 * dayMs);
});

test("parses English month-year and localized month-day strings", () => {
  assertLocalDateParts(parseXTimeText("Mar 2025", now), 2025, 2, 1);
  assertLocalDateParts(parseXTimeText("5月30日", now), 2026, 4, 30);
  assertLocalDateParts(parseXTimeText("2025年5月30日", now), 2025, 4, 30);
});

test("infers previous year for future month-day dates", () => {
  assertLocalDateParts(parseXTimeText("Dec 31", now), 2025, 11, 31);
});
