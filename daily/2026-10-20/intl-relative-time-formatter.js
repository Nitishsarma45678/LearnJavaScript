/*
 * Practice: Intl Relative Time Formatter
 *
 * What: Build a "time ago" helper ("3 hours ago", "in 2 days") using the
 * built-in Intl.RelativeTimeFormat, plus Intl.PluralRules for counted nouns.
 *
 * Why it matters: Hand-rolled strings like `${n} days ago` break for
 * "1 days", for "yesterday", and for every non-English locale. The Intl APIs
 * ship locale data with the runtime, so no library is needed.
 *
 * Key ideas:
 *   - Pick the largest unit whose threshold the difference reaches.
 *   - Sign carries direction: negative = past, positive = future.
 *   - numeric: "auto" lets the formatter say "yesterday" / "tomorrow".
 *   - PluralRules.select(n) returns a category ("one", "other", ...) that
 *     you map to word forms — never `n === 1 ? ... : ...`.
 */

const UNITS = [
  ["year", 365 * 24 * 3600 * 1000],
  ["month", 30 * 24 * 3600 * 1000],
  ["week", 7 * 24 * 3600 * 1000],
  ["day", 24 * 3600 * 1000],
  ["hour", 3600 * 1000],
  ["minute", 60 * 1000],
  ["second", 1000],
];

function timeAgo(date, { now = Date.now(), locale = "en", numeric = "auto" } = {}) {
  const diff = new Date(date).getTime() - new Date(now).getTime();
  if (Number.isNaN(diff)) throw new RangeError("Invalid date");

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "second") {
      // Math.trunc keeps "59 minutes" from rounding up to "1 hour" early
      return rtf.format(Math.trunc(diff / ms), unit);
    }
  }
}

function pluralize(count, forms, locale = "en") {
  const category = new Intl.PluralRules(locale).select(count);
  const word = forms[category] ?? forms.other;
  return `${new Intl.NumberFormat(locale).format(count)} ${word}`;
}

// ---------------------------------------------------------------------------
const assert = require("node:assert/strict");

const NOW = new Date("2026-10-20T12:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms);
const later = (ms) => new Date(NOW.getTime() + ms);
const H = 3600 * 1000;
const D = 24 * H;

assert.equal(timeAgo(ago(5 * 1000), { now: NOW }), "5 seconds ago");
assert.equal(timeAgo(NOW, { now: NOW }), "now");
assert.equal(timeAgo(ago(59 * 60 * 1000), { now: NOW }), "59 minutes ago");
assert.equal(timeAgo(ago(3 * H), { now: NOW }), "3 hours ago");
assert.equal(timeAgo(ago(D), { now: NOW }), "yesterday");
assert.equal(timeAgo(later(D), { now: NOW }), "tomorrow");
assert.equal(timeAgo(later(2 * D), { now: NOW }), "in 2 days");
assert.equal(timeAgo(ago(14 * D), { now: NOW }), "2 weeks ago");
assert.equal(timeAgo(ago(400 * D), { now: NOW }), "last year");

// numeric: "always" disables the friendly words
assert.equal(timeAgo(ago(D), { now: NOW, numeric: "always" }), "1 day ago");

// Other locales come for free (checked loosely: ICU data can vary slightly)
assert.match(timeAgo(later(3 * D), { now: NOW, locale: "es" }), /3 días/);
assert.match(timeAgo(ago(2 * H), { now: NOW, locale: "de" }), /2 Stunden/);

assert.throws(() => timeAgo("not a date", { now: NOW }), RangeError);

// Plural rules
const files = { one: "file", other: "files" };
assert.equal(pluralize(1, files), "1 file");
assert.equal(pluralize(0, files), "0 files");
assert.equal(pluralize(1500, files), "1,500 files");
assert.equal(new Intl.PluralRules("ar").select(2), "two"); // Arabic has a dual form
assert.equal(new Intl.PluralRules("en", { type: "ordinal" }).select(22), "two"); // 22nd

console.log("✓ Intl Relative Time Formatter: all checks passed");
