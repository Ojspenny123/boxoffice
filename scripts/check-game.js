/**
 * Logic checks for Box Office v1. Run with: node scripts/check-game.js
 * Uses a fake clock and an in-memory store. No network.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeActor } from "../js/codec.js";
import { LAUNCH_DATE, addDays, dealForDate, londonDate, nextLondonMidnight, puzzleNumber } from "../js/daily.js";
import { applyGuess, exactActor, fold, freshRound, shareSquares, suggest } from "../js/game.js";
import { awardsLine, birthDecade, formatCountdown, formatMoney } from "../js/format.js";
import { buildShareText } from "../js/share.js";
import { createStorage, effectiveStreak, emptyStats, recordCompletion } from "../js/storage.js";
import { VERSION, versionLabel } from "../js/version.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

assert(VERSION === "1.0.0", "version constant");
assert(versionLabel() === "v1.0", "footer version label");
assert(formatMoney(null) === "—", "null money");
assert(formatMoney(0) === "—", "zero money");
assert(formatMoney(185_000_000) === "$185M", "millions");
assert(formatMoney(1_200_000_000) === "$1.2B", "billions");
assert(formatMoney(2_000_000_000) === "$2B", "round billions");
assert(formatMoney(2_200_000_000) === "$2.2B", "decimal billions");
assert(birthDecade(1956) === "1950s", "decade");
assert(awardsLine(2, 5) === "2 Oscar wins, 5 nominations", "awards");
assert(awardsLine(0, 0) === "No Oscar wins or nominations", "no oscars");
assert(formatCountdown(3_661_000).startsWith("1h 01m"), "countdown");

assert(fold("Penélope") === "penelope", "accents");
assert(puzzleNumber(LAUNCH_DATE) === 1, "puzzle 1 is launch day");
assert(puzzleNumber("2026-10-03") === 2, "next day is puzzle 2");
assert(londonDate(new Date("2026-10-02T00:30:00Z")) === "2026-10-02", "london date after midnight BST");

const sample = [
  { id: "a", tier: 1, name: "Tom Hanks", alts: ["Thomas Hanks"] },
  { id: "b", tier: 1, name: "Meryl Streep", alts: [] },
  { id: "c", tier: 2, name: "Emma Stone", alts: [] },
  { id: "d", tier: 2, name: "Penélope Cruz", alts: ["Penelope Cruz"] },
  { id: "e", tier: 3, name: "Saoirse Ronan", alts: [] },
  { id: "f", tier: 3, name: "Oscar Isaac", alts: [] },
];
const hits = suggest(sample, "pen", 6);
assert(hits.length === 1 && hits[0].name === "Penélope Cruz", "accent-insensitive suggest");
assert(suggest(sample, "tom", 6).length === 1, "partial match");
assert(suggest(sample, "zzzz", 6).length === 0, "no match");
assert(exactActor(sample, "penelope cruz")?.name === "Penélope Cruz", "exact alt");
assert(exactActor(sample, "tom") === null, "partial is not an exact submit");

let round = freshRound("a");
let step = applyGuess(round, sample[0], "Meryl Streep");
assert(step.ok && !step.correct && step.round.guesses.length === 1, "wrong guess counts");
step = applyGuess(step.round, sample[0], "Meryl Streep");
assert(!step.ok && step.reason === "duplicate", "duplicate ignored");
round = freshRound("a");
for (let i = 0; i < 5; i += 1) round = applyGuess(round, sample[0], `Nobody ${i}`).round;
assert(round.status === "lost" && shareSquares(round) === "🟥🟥🟥🟥🟥", "five wrongs lose");
round = freshRound("a");
round = applyGuess(round, sample[0], "Thomas Hanks").round;
assert(round.status === "won" && shareSquares(round) === "🟩⬜⬜⬜⬜", "alt spelling wins");
round = freshRound("a");
round = applyGuess(round, sample[0], "Nope").round;
round = applyGuess(round, sample[0], "Tom Hanks").round;
assert(shareSquares(round) === "🟥🟩⬜⬜⬜", "win on guess 2");

const pool = [];
for (let tier = 1; tier <= 3; tier += 1) {
  for (let i = 0; i < 20; i += 1) pool.push({ id: `t${tier}-${i}`, tier, name: `Actor ${tier}-${i}` });
}
const first = dealForDate(pool, LAUNCH_DATE);
const second = dealForDate(pool, addDays(LAUNCH_DATE, 1));
assert(first.map((a) => a.tier).join() === "1,2,3", "one of each tier");
assert(dealForDate(pool, LAUNCH_DATE).map((a) => a.id).join() === first.map((a) => a.id).join(), "deal is stable");
assert(first.map((a) => a.id).join() !== second.map((a) => a.id).join(), "next day changes");
const seen = new Set();
let repeatAt = -1;
for (let day = 0; day < 20; day += 1) {
  const id = dealForDate(pool, addDays(LAUNCH_DATE, day))[0].id;
  if (seen.has(id)) {
    repeatAt = day;
    break;
  }
  seen.add(id);
}
assert(repeatAt === -1, "tier 1 does not repeat inside a 20-day cycle");

const store = createStorage(memoryStorage());
let stats = emptyStats();
const rounds = [
  { status: "won", guesses: ["A"] },
  { status: "won", guesses: ["A", "B"] },
  { status: "lost", guesses: ["A", "B", "C", "D", "E"] },
];
stats = recordCompletion(stats, "2026-10-02", rounds);
assert(stats.currentStreak === 1 && stats.gamesPlayed === 3 && stats.wins === 2, "first day stats");
assert(stats.distribution[0] === 1 && stats.distribution[1] === 1 && stats.distribution[5] === 1, "distribution bins");
stats = recordCompletion(stats, "2026-10-02", rounds);
assert(stats.gamesPlayed === 3, "same day does not double count");
stats = recordCompletion(stats, "2026-10-03", rounds);
assert(stats.currentStreak === 2, "consecutive day extends streak");
assert(effectiveStreak(stats, "2026-10-05") === 0, "a missed day shows streak 0");
const afterGap = recordCompletion(stats, "2026-10-05", rounds);
assert(afterGap.currentStreak === 1 && afterGap.bestStreak === 2, "gap starts a new streak and keeps the best");
store.saveStats(stats);
assert(store.loadStats().bestStreak === 2, "stats round-trip");

const text = buildShareText({ puzzle: 42, streak: 5, rounds, url: "https://example.com/" });
assert(text.startsWith("Box Office #42 🎬 Streak: 5"), "share header");
assert(text.includes("Actor 1: 🟩⬜⬜⬜⬜"), "share row 1");
assert(text.includes("Actor 3: 🟥🟥🟥🟥🟥"), "share row 3");
assert(!text.includes("Tom Hanks"), "share has no actor name");
assert(text.endsWith("https://example.com/"), "share url");

const midnight = nextLondonMidnight(new Date("2026-10-02T12:00:00Z"));
assert(londonDate(new Date(midnight.getTime() - 1000)) === "2026-10-02", "just before London midnight");
assert(londonDate(midnight) === "2026-10-03", "London midnight rolls the day");

const dataPath = path.join(root, "data", "actors.json");
if (fs.existsSync(dataPath)) {
  const rawText = fs.readFileSync(dataPath, "utf8");
  const payload = JSON.parse(rawText);
  const actors = payload.actors.map(decodeActor);
  assert(actors.length >= 60, `at least 60 actors, got ${actors.length}`);
  for (const tier of [1, 2, 3]) {
    assert(actors.filter((actor) => actor.tier === tier).length >= 20, `tier ${tier} has 20`);
  }
  const ids = new Set();
  for (const actor of actors) {
    assert(actor.name && !rawText.includes(`"${actor.name}"`), `name hidden for ${actor.id}`);
    assert(!ids.has(actor.id), `unique id ${actor.id}`);
    ids.add(actor.id);
    assert(actor.films.length >= 8 && actor.films.length <= 10, `${actor.name} film count ${actor.films.length}`);
    const years = actor.films.map((film) => film.year);
    const sorted = years.slice().sort((a, b) => a - b);
    assert(years.join() === sorted.join(), `${actor.name} films sorted by year`);
    const withGross = actor.films.filter((film) => film.gross > 0);
    assert(withGross.length >= 8, `${actor.name} has 8 known grosses`);
    for (const film of actor.films) {
      const title = fold(film.title);
      assert(!title.includes(fold(actor.name)), `${actor.name} not in title ${film.title}`);
      if (film.gross === 0 || film.budget === 0) assert(false, `zero money stored for ${film.title}`);
    }
    assert(actor.nationality && actor.flag && actor.costar && actor.birthYear, `clues present for ${actor.name}`);
  }
  console.log(`actors.json OK (${actors.length} actors, source ${payload.source})`);
} else {
  console.log("actors.json not built yet — logic checks only");
}

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("All checks passed");
