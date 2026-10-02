/**
 * Box Office boot. Wires the daily deal, local progress, and the view.
 * Answers stay out of the document title and the URL.
 */

import { decodeActor } from "./codec.js";
import { dealForDate, londonDate, puzzleNumber } from "./daily.js";
import { applyGuess, cluesUnlocked, exactActor, freshRound, shareSquares, suggest } from "./game.js";
import { buildShareText, gameUrl, shareResult } from "./share.js";
import { createStorage, recordCompletion, withEffectiveStreak } from "./storage.js";
import {
  announce,
  burstConfetti,
  clearGuessInput,
  closeModal,
  helpBody,
  openModal,
  renderError,
  renderLoading,
  setStreak,
  setTaglineVisible,
  shakeGuess,
  showPuzzle,
  showResults,
  statsBody,
  stopCountdown,
  updateSuggestions,
  showToast,
} from "./ui.js";
import { versionLabel } from "./version.js";

const state = {
  actors: [],
  trio: [],
  progress: null,
  stats: null,
  today: "",
  suggestions: null,
  active: -1,
  note: "",
  animateClue: null,
  modal: null,
};

const store = createStorage(localStorage);

function freshProgress(today, puzzle, trio) {
  return {
    date: today,
    puzzle,
    ids: trio.map((actor) => actor.id).join(","),
    index: 0,
    complete: false,
    recorded: false,
    rounds: trio.map((actor) => freshRound(actor.id)),
  };
}

function currentActor() {
  return state.trio[state.progress.index];
}

function currentRound() {
  return state.progress.rounds[state.progress.index];
}

function persist() {
  store.saveProgress(state.progress);
  store.saveStats(state.stats);
}

function displayedStats() {
  return withEffectiveStreak(state.stats, state.today);
}

function refreshChrome() {
  const stats = displayedStats();
  setStreak(stats.currentStreak);
  setTaglineVisible(!state.progress.complete && state.progress.index === 0);
}

function paint() {
  refreshChrome();
  const root = document.getElementById("app");
  if (state.progress.complete) {
    stopCountdown();
    showResults(
      root,
      {
        puzzle: state.progress.puzzle,
        trio: state.trio,
        rounds: state.progress.rounds,
        squares: state.progress.rounds.map(shareSquares),
      },
      { onShare: onShare, onRollover: () => window.location.reload() },
    );
    return;
  }
  showPuzzle(
    root,
    {
      puzzle: state.progress.puzzle,
      actor: currentActor(),
      round: currentRound(),
      index: state.progress.index,
      total: state.trio.length,
      note: state.note,
      animateClue: state.animateClue,
    },
    {
      onInput: onInput,
      onKeyDown: onKeyDown,
      onSubmit: onSubmit,
      onNext: onNext,
    },
  );
  updateSuggestions.onPick = (actor) => pick(actor.name);
  state.animateClue = null;
}

function onInput(value) {
  state.note = "";
  const note = document.querySelector(".guess-note");
  if (note) note.textContent = "";
  state.active = -1;
  const query = value.trim();
  state.suggestions = query ? suggest(state.actors, query, 6) : null;
  updateSuggestions(document.getElementById("app"), state.suggestions, state.active);
}

function onKeyDown(event) {
  const list = state.suggestions;
  if (event.key === "Escape") {
    state.suggestions = null;
    state.active = -1;
    updateSuggestions(document.getElementById("app"), null, -1);
    return;
  }
  if (!list || list.length === 0) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.active = Math.min(list.length - 1, state.active + 1);
    updateSuggestions(document.getElementById("app"), list, state.active);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.active = Math.max(0, state.active - 1);
    updateSuggestions(document.getElementById("app"), list, state.active);
  }
}

function onSubmit(value) {
  if (state.active >= 0 && state.suggestions?.[state.active]) {
    pick(state.suggestions[state.active].name);
    return;
  }
  const exact = exactActor(state.actors, value);
  if (exact) {
    pick(exact.name);
    return;
  }
  state.note = value.trim()
    ? "Pick an actor from the list."
    : "Type a name, then pick a suggestion.";
  state.suggestions = value.trim() ? suggest(state.actors, value, 6) : null;
  state.active = -1;
  shakeGuess(document.getElementById("app"));
  paint();
  const input = document.getElementById("guess-input");
  if (input) {
    input.value = value;
    input.focus();
  }
  updateSuggestions(document.getElementById("app"), state.suggestions, state.active);
}

function pick(name) {
  const before = cluesUnlocked(currentRound());
  const result = applyGuess(currentRound(), currentActor(), name);
  const root = document.getElementById("app");
  if (!result.ok) {
    state.note = result.reason === "duplicate" ? "You already tried that name." : "Pick an actor from the list.";
    shakeGuess(root);
    paint();
    const input = document.getElementById("guess-input");
    if (input) {
      input.value = name;
      input.focus();
    }
    return;
  }
  state.progress.rounds[state.progress.index] = result.round;
  state.suggestions = null;
  state.active = -1;
  state.note = "";
  const after = cluesUnlocked(result.round);
  state.animateClue = after > before ? after - 1 : null;
  if (result.correct) {
    burstConfetti();
    announce(`${winText(result.round)} ${currentActor().name}.`);
  } else if (result.round.status === "lost") {
    shakeGuess(root);
    announce(`Out of guesses. It was ${currentActor().name}.`);
  } else {
    shakeGuess(root);
    announce(`Wrong. ${after > before ? `Clue ${after} unlocked.` : ""}`.trim());
  }
  // Stats count as soon as the third actor is finished, even before the results screen.
  recordIfDayDone();
  persist();
  paint();
  if (result.round.status === "playing") {
    clearGuessInput(root);
    updateSuggestions(root, null, -1);
  }
}

function winText(round) {
  return round.guesses.length === 1 ? "Correct on the first guess." : `Correct in ${round.guesses.length} guesses.`;
}

function recordIfDayDone() {
  const done = state.progress.rounds.every((round) => round.status !== "playing");
  if (!done || state.progress.recorded) return;
  state.stats = recordCompletion(state.stats, state.today, state.progress.rounds);
  state.progress.recorded = true;
}

function onNext() {
  if (currentRound().status === "playing") return;
  if (state.progress.index < state.trio.length - 1) {
    state.progress.index += 1;
    state.note = "";
    state.animateClue = null;
    persist();
    paint();
    const input = document.getElementById("guess-input");
    if (input) input.focus();
    return;
  }
  state.progress.complete = true;
  recordIfDayDone();
  persist();
  paint();
}

async function onShare() {
  const stats = displayedStats();
  const text = buildShareText({
    puzzle: state.progress.puzzle,
    streak: stats.currentStreak,
    rounds: state.progress.rounds,
    url: gameUrl(),
  });
  try {
    const outcome = await shareResult(text);
    if (outcome === "copied") showToast("Copied!");
  } catch {
    showToast("Could not copy");
  }
}

function openHelp(forceMark) {
  state.modal = "help";
  openModal({
    title: "How to play",
    body: helpBody(),
    primaryLabel: "Let's play",
    onClose: () => {
      closeModal();
      store.markHelpSeen();
      state.modal = null;
      if (forceMark) document.getElementById("help-btn")?.focus();
    },
  });
}

function openStats() {
  state.modal = "stats";
  const opener = document.getElementById("stats-btn");
  openModal({
    title: "Stats",
    body: statsBody(displayedStats()),
    onClose: () => {
      closeModal();
      state.modal = null;
      opener?.focus();
    },
  });
}

function bindChrome() {
  document.getElementById("help-btn").addEventListener("click", () => openHelp(false));
  document.getElementById("stats-btn").addEventListener("click", openStats);
  document.getElementById("version-label").textContent = versionLabel();
}

async function boot() {
  bindChrome();
  const root = document.getElementById("app");
  renderLoading(root);
  try {
    const response = await fetch("data/actors.json");
    if (!response.ok) throw new Error("The actor list could not be loaded.");
    const payload = await response.json();
    state.actors = (payload.actors || []).map(decodeActor).filter((actor) => actor.name);
    if (state.actors.length < 3) throw new Error("The actor list is not ready yet.");
    state.today = londonDate();
    state.trio = dealForDate(state.actors, state.today);
    const puzzle = puzzleNumber(state.today);
    const saved = store.loadProgress();
    const ids = state.trio.map((actor) => actor.id).join(",");
    if (saved && saved.date === state.today && saved.ids === ids) state.progress = saved;
    else state.progress = freshProgress(state.today, puzzle, state.trio);
    state.stats = store.loadStats();
    recordIfDayDone();
    if (state.progress.recorded) persist();
    paint();
    if (!store.helpSeen()) openHelp(true);
  } catch (error) {
    renderError(root, error.message || "The puzzle could not be loaded.");
  }
}

boot();
