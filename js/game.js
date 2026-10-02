/**
 * Guess rules. The autocomplete list is the full actor pool, so it never
 * narrows the field to today's trio.
 */

export const GUESSES_PER_ACTOR = 5;
export const CLUE_COUNT = 4;

export function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function namesOf(actor) {
  return [actor.name, ...(actor.alts || [])].filter(Boolean);
}

export function isCorrect(actor, guess) {
  const target = fold(guess);
  if (!target) return false;
  return namesOf(actor).some((name) => fold(name) === target);
}

/**
 * Suggestions match any part of the canonical name or an alternate spelling.
 * Accent and case are ignored. At most `limit` hits, prefix matches first.
 */
export function suggest(actors, query, limit = 6) {
  const needle = fold(query);
  if (!needle) return [];
  const hits = [];
  for (const actor of actors) {
    let best = null;
    for (const name of namesOf(actor)) {
      const folded = fold(name);
      const at = folded.indexOf(needle);
      if (at === -1) continue;
      const score = (at === 0 ? 0 : 1) * 1000 + at;
      if (best === null || score < best) best = score;
    }
    if (best !== null) hits.push({ actor, score: best });
  }
  hits.sort((a, b) => a.score - b.score || a.actor.name.localeCompare(b.actor.name));
  return hits.slice(0, limit).map((hit) => hit.actor);
}

/** A typed name can be submitted only when it matches exactly one actor. */
export function exactActor(actors, query) {
  const needle = fold(query);
  if (!needle) return null;
  const hits = actors.filter((actor) => namesOf(actor).some((name) => fold(name) === needle));
  return hits.length === 1 ? hits[0] : null;
}

export function wrongGuesses(round) {
  if (!round) return [];
  if (round.status === "won") return round.guesses.slice(0, -1);
  return round.guesses.slice();
}

export function cluesUnlocked(round) {
  return Math.min(CLUE_COUNT, wrongGuesses(round).length);
}

export function freshRound(actorId) {
  return { id: actorId, guesses: [], status: "playing" };
}

/**
 * Apply a picked actor. Free text never reaches this function.
 * Returns { ok:false, reason } or { ok:true, round, correct }.
 */
export function applyGuess(round, actor, guessName) {
  if (!round || round.status !== "playing") {
    return { ok: false, reason: "closed" };
  }
  const cleaned = String(guessName || "").trim();
  if (!cleaned) return { ok: false, reason: "empty" };
  if (round.guesses.some((guess) => fold(guess) === fold(cleaned))) {
    return { ok: false, reason: "duplicate" };
  }
  const correct = isCorrect(actor, cleaned);
  const canonical = correct ? actor.name : cleaned;
  const guesses = [...round.guesses, canonical];
  if (correct) return { ok: true, correct: true, round: { ...round, guesses, status: "won" } };
  if (guesses.length >= GUESSES_PER_ACTOR) {
    return { ok: true, correct: false, round: { ...round, guesses, status: "lost" } };
  }
  return { ok: true, correct: false, round: { ...round, guesses, status: "playing" } };
}

export function winMessage(guessCount) {
  if (guessCount <= 1) return "First try! You know your stars.";
  if (guessCount === 2) return "Yes! Two guesses and done.";
  if (guessCount === 3) return "That's the one.";
  if (guessCount === 4) return "You got there.";
  return "Right on the last guess.";
}

export function lossMessage() {
  return "Not this time. Five guesses gone, and the next actor is a fresh start.";
}

export function shareSquares(round) {
  const cells = [];
  if (round.status === "won") {
    for (let i = 0; i < round.guesses.length - 1; i += 1) cells.push("🟥");
    cells.push("🟩");
  } else {
    for (let i = 0; i < round.guesses.length; i += 1) cells.push("🟥");
  }
  while (cells.length < GUESSES_PER_ACTOR) cells.push("⬜");
  return cells.join("");
}
