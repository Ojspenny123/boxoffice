/**
 * Daily puzzle deal.
 * The seed is the number of Europe/London civil days since the launch date.
 * Each tier is a fixed shuffle, so an actor is not repeated until that tier's pool wraps.
 */

export const LAUNCH_DATE = "2026-10-02";
export const TIME_ZONE = "Europe/London";

const TIER_SEEDS = { 1: 0xb0c0ff1, 2: 0xb0c0ff2, 3: 0xb0c0ff3 };

export function londonDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  const [ay, am, ad] = fromIso.split("-").map(Number);
  const [by, bm, bd] = toIso.split("-").map(Number);
  const from = Date.UTC(ay, am - 1, ad);
  const to = Date.UTC(by, bm - 1, bd);
  return Math.round((to - from) / 86400000);
}

/** Puzzle #1 is the launch date. Earlier dates clamp to 1. */
export function puzzleNumber(iso) {
  return Math.max(1, daysBetween(LAUNCH_DATE, iso) + 1);
}

export function dayIndex(iso) {
  return Math.max(0, daysBetween(LAUNCH_DATE, iso));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(items, seed) {
  const rng = mulberry32(seed);
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * One actor from each tier. Slot 1 is tier 1 (mega-star), then tier 2, then tier 3.
 * The shuffle seed is constant, so day N and day N+pool never share an actor before the pool wraps.
 */
export function dealForDate(actors, iso) {
  const index = dayIndex(iso);
  const trio = [];
  for (const tier of [1, 2, 3]) {
    const pool = actors.filter((actor) => actor.tier === tier);
    if (pool.length === 0) throw new Error(`No actors in tier ${tier}`);
    const order = seededShuffle(pool, TIER_SEEDS[tier]);
    trio.push(order[index % order.length]);
  }
  return trio;
}

/** UTC instant when the next London civil day begins. */
export function nextLondonMidnight(now = new Date()) {
  const today = londonDate(now);
  let lo = now.getTime();
  let hi = lo + 36 * 60 * 60 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (londonDate(new Date(mid)) === today) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}
