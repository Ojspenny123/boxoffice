/**
 * localStorage progress, streaks, and stats.
 * Every key starts with "boxoffice_". A finished day cannot be replayed.
 * A day counts toward the streak only when all three actors are finished.
 */

import { addDays } from "./daily.js";

export const KEYS = {
  progress: "boxoffice_progress",
  stats: "boxoffice_stats",
  help: "boxoffice_help_seen",
};

export function emptyStats() {
  return {
    currentStreak: 0,
    bestStreak: 0,
    lastCompletedDate: null,
    gamesPlayed: 0,
    wins: 0,
    distribution: [0, 0, 0, 0, 0, 0],
  };
}

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function normalizeStats(raw) {
  const base = emptyStats();
  if (!raw || typeof raw !== "object") return base;
  const distribution = Array.isArray(raw.distribution) ? raw.distribution.slice(0, 6) : [];
  while (distribution.length < 6) distribution.push(0);
  return {
    currentStreak: Number(raw.currentStreak) || 0,
    bestStreak: Number(raw.bestStreak) || 0,
    lastCompletedDate: typeof raw.lastCompletedDate === "string" ? raw.lastCompletedDate : null,
    gamesPlayed: Number(raw.gamesPlayed) || 0,
    wins: Number(raw.wins) || 0,
    distribution: distribution.map((n) => Number(n) || 0),
  };
}

/** The streak survives today and yesterday. A missed London day displays as 0. */
export function effectiveStreak(stats, today) {
  const last = stats.lastCompletedDate;
  if (!last) return 0;
  if (last === today || last === addDays(today, -1)) return stats.currentStreak;
  return 0;
}

export function withEffectiveStreak(stats, today) {
  return { ...stats, currentStreak: effectiveStreak(stats, today) };
}

/**
 * Record a finished day. Each actor is one game in the distribution.
 * Calling this twice for the same date does not double-count.
 */
export function recordCompletion(stats, today, rounds) {
  const current = normalizeStats(stats);
  if (current.lastCompletedDate === today) return current;
  const continued = current.lastCompletedDate === addDays(today, -1);
  const streak = continued ? current.currentStreak + 1 : 1;
  const distribution = current.distribution.slice();
  let wins = current.wins;
  for (const round of rounds) {
    if (round.status === "won") {
      wins += 1;
      const bin = Math.min(5, Math.max(1, round.guesses.length)) - 1;
      distribution[bin] += 1;
    } else {
      distribution[5] += 1;
    }
  }
  return {
    currentStreak: streak,
    bestStreak: Math.max(current.bestStreak, streak),
    lastCompletedDate: today,
    gamesPlayed: current.gamesPlayed + rounds.length,
    wins,
    distribution,
  };
}

export function createStorage(storage) {
  return {
    loadProgress() {
      const saved = readJson(storage, KEYS.progress);
      if (!saved || typeof saved !== "object" || !Array.isArray(saved.rounds)) return null;
      return saved;
    },
    saveProgress(progress) {
      writeJson(storage, KEYS.progress, progress);
    },
    loadStats() {
      return normalizeStats(readJson(storage, KEYS.stats));
    },
    saveStats(stats) {
      writeJson(storage, KEYS.stats, normalizeStats(stats));
    },
    helpSeen() {
      return storage.getItem(KEYS.help) === "1";
    },
    markHelpSeen() {
      storage.setItem(KEYS.help, "1");
    },
  };
}
