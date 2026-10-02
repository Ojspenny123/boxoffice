/**
 * Puzzle view. The guess box stays put when clues unlock; clues grow beneath it.
 * A finished actor replaces the guess box with a result card in the same slot.
 */

import { awardsLine, birthDecade, formatCountdown, formatMoney } from "./format.js";
import { cluesUnlocked, lossMessage, winMessage, wrongGuesses } from "./game.js";
import { nextLondonMidnight } from "./daily.js";

const CLUE_META = [
  { key: "nationality", tint: "blue", label: "Nationality", icon: flagIcon },
  { key: "decade", tint: "pink", label: "Birth decade", icon: cakeIcon },
  { key: "awards", tint: "yellow", label: "Awards", icon: trophyIcon },
  { key: "costar", tint: "purple", label: "Co-star", icon: peopleIcon },
];

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function announce(message) {
  const live = document.getElementById("live");
  if (live) live.textContent = message;
}

export function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

export function burstConfetti() {
  if (prefersReducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  const colors = ["#7C3AED", "#FFC933", "#FF4D8D", "#3B82F6", "#16C06B"];
  for (let i = 0; i < 36; i += 1) {
    const piece = document.createElement("i");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.15}s`;
    piece.style.transform = `rotate(${Math.random() * 80 - 40}deg)`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1400);
}

export function setStreak(count) {
  const number = document.getElementById("streak-count");
  const pill = document.getElementById("streak-pill");
  if (number) number.textContent = String(count);
  if (pill) pill.setAttribute("aria-label", `Current streak: ${count} ${count === 1 ? "day" : "days"}`);
}

export function setTaglineVisible(visible) {
  const tagline = document.getElementById("tagline");
  if (tagline) tagline.hidden = !visible;
}

export function renderLoading(root) {
  root.innerHTML = `<p class="loading">Dealing today's actors…</p>`;
}

export function renderError(root, message) {
  root.innerHTML = `<div class="card error-card"><h2>Something went wrong</h2><p>${escapeHtml(message)}</p></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function posterNode(film) {
  const img = document.createElement("img");
  img.className = "poster";
  img.alt = "";
  img.width = 32;
  img.height = 48;
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  if (film.poster) img.src = film.poster;
  const fallback = () => {
    const span = document.createElement("span");
    span.className = "poster fallback";
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = clapperMini();
    img.replaceWith(span);
  };
  img.addEventListener("error", fallback);
  if (!film.poster) {
    const span = document.createElement("span");
    span.className = "poster fallback";
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = clapperMini();
    return span;
  }
  return img;
}

function highestGross(films) {
  let best = 0;
  for (const film of films) {
    if (film.gross > best) best = film.gross;
  }
  return best;
}

function fillTable(container, actor) {
  const films = actor.films.slice().sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  const best = highestGross(films);
  const table = document.createElement("table");
  table.className = "film-table";
  table.innerHTML = `
    <caption class="sr-only">Famous films for actor ${container.closest("#puzzle") ? "" : ""}. The actor's name is hidden.</caption>
    <thead>
      <tr>
        <th scope="col">Year</th>
        <th scope="col">Film</th>
        <th scope="col">Budget</th>
        <th scope="col">Gross</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const caption = table.querySelector("caption");
  caption.textContent = "Famous films. The actor's name is hidden. Gross means worldwide gross.";
  const body = table.querySelector("tbody");
  for (const film of films) {
    const row = document.createElement("tr");
    const year = document.createElement("td");
    year.className = "year";
    year.textContent = String(film.year);

    const filmCell = document.createElement("td");
    filmCell.className = "film";
    const wrap = document.createElement("div");
    wrap.className = "film-cell";
    wrap.appendChild(posterNode(film));
    const copy = document.createElement("div");
    copy.className = "film-copy";
    const title = document.createElement("span");
    title.className = "film-title";
    title.textContent = film.title;
    copy.appendChild(title);
    if (film.character) {
      const character = document.createElement("span");
      character.className = "character";
      character.textContent = film.character;
      copy.appendChild(character);
    }
    wrap.appendChild(copy);
    filmCell.appendChild(wrap);

    const budget = document.createElement("td");
    budget.className = "money";
    budget.textContent = formatMoney(film.budget);

    const gross = document.createElement("td");
    gross.className = "money gross";
    gross.textContent = formatMoney(film.gross);
    if (best > 0 && film.gross === best) {
      gross.classList.add("best");
      const note = document.createElement("span");
      note.className = "sr-only";
      note.textContent = " Highest worldwide gross.";
      gross.appendChild(note);
    }

    row.append(year, filmCell, budget, gross);
    body.appendChild(row);
  }
  container.replaceChildren(table);
}

function clueText(actor, index) {
  if (index === 0) return `${actor.flag} ${actor.nationality}`.trim();
  if (index === 1) return birthDecade(actor.birthYear);
  if (index === 2) return awardsLine(actor.awards.wins, actor.awards.nominations);
  return actor.costar;
}

function cluePlaceholder(index, isNext) {
  const number = index + 1;
  if (isNext) return `Clue ${number} unlocks after your next wrong guess`;
  return `Clue ${number} unlocks after more wrong guesses`;
}

function renderClueItem(actor, index, unlocked, animate) {
  const meta = CLUE_META[index];
  if (!unlocked) {
    const nextLocked = index === cluesUnlocked({ guesses: [], status: "playing" });
    return el(`
      <li class="clue locked" data-clue="${index}">
        <p>${escapeHtml(cluePlaceholder(index, false))}</p>
      </li>
    `);
  }
  const item = el(`
    <li class="clue ${meta.tint}${animate ? " clue-in" : ""}" data-clue="${index}">
      <span class="clue-icon" aria-hidden="true">${meta.icon()}</span>
      <div>
        <p class="clue-label">${meta.label}</p>
        <p class="clue-value"></p>
      </div>
    </li>
  `);
  item.querySelector(".clue-value").textContent = clueText(actor, index);
  return item;
}

function syncClues(list, actor, round, animateIndex) {
  const open = cluesUnlocked(round);
  const items = [];
  for (let i = 0; i < CLUE_META.length; i += 1) {
    if (i < open) {
      items.push(renderClueItem(actor, i, true, animateIndex === i));
    } else {
      const isNext = i === open;
      const locked = el(`<li class="clue locked" data-clue="${i}"><p></p></li>`);
      locked.querySelector("p").textContent = cluePlaceholder(i, isNext);
      items.push(locked);
    }
  }
  list.replaceChildren(...items);
}

function dotRow(round) {
  const used = round.guesses.length;
  const wrong = wrongGuesses(round).length;
  const row = document.createElement("div");
  row.className = "dots";
  const label =
    round.status === "won"
      ? `Solved in ${used} ${used === 1 ? "guess" : "guesses"}`
      : round.status === "lost"
        ? "5 guesses used"
        : `${used} of 5 guesses used`;
  row.setAttribute("role", "img");
  row.setAttribute("aria-label", label);
  for (let i = 0; i < 5; i += 1) {
    const dot = document.createElement("span");
    dot.className = "dot";
    if (i < wrong) dot.classList.add("used", "wrong");
    else if (round.status === "won" && i === used - 1) dot.classList.add("used", "right");
    else if (i < used) dot.classList.add("used");
    row.appendChild(dot);
  }
  return row;
}

function statusText(round) {
  if (round.status === "won") {
    const n = round.guesses.length;
    return `Solved in ${n} ${n === 1 ? "guess" : "guesses"}`;
  }
  if (round.status === "lost") return "5 guesses used";
  return `Guess ${round.guesses.length + 1} of 5`;
}

function photoElement(actor, className) {
  const img = document.createElement("img");
  img.className = className;
  img.alt = "";
  img.width = 84;
  img.height = 112;
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  const fallback = document.createElement("span");
  fallback.className = `${className} fallback`;
  fallback.setAttribute("aria-hidden", "true");
  fallback.innerHTML = clapperMini();
  if (!actor.photo) return fallback;
  img.src = actor.photo;
  img.addEventListener("error", () => img.replaceWith(fallback));
  return img;
}

function resultCard(actor, round, onNext, isLast) {
  const won = round.status === "won";
  const card = document.createElement("article");
  card.className = `result ${won ? "win" : "loss"}${prefersReducedMotion() ? "" : " pulse"}`;
  card.appendChild(photoElement(actor, "result-photo"));
  const copy = document.createElement("div");
  copy.className = "result-copy";
  const kicker = document.createElement("p");
  kicker.className = "result-kicker";
  kicker.textContent = won ? "It's a match" : "Not this time";
  const name = document.createElement("h2");
  name.className = "result-name";
  name.textContent = actor.name;
  const message = document.createElement("p");
  message.className = "result-msg";
  message.textContent = won ? winMessage(round.guesses.length) : lossMessage();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = isLast ? "See results" : "Next actor";
  button.addEventListener("click", onNext);
  copy.append(kicker, name, message, button);
  card.appendChild(copy);
  return card;
}

function guessForm(handlers) {
  const block = el(`
    <div class="guess-block">
      <form class="guess-form" autocomplete="off">
        <label class="sr-only" for="guess-input">Actor name</label>
        <div class="guess-row">
          <input id="guess-input" class="guess-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggestions" placeholder="Search for an actor" maxlength="80" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
          <button class="btn guess-btn" type="submit">Guess</button>
        </div>
        <ul id="suggestions" class="suggest-list" role="listbox" hidden></ul>
      </form>
      <ul class="chips" aria-label="Wrong guesses"></ul>
      <p class="guess-note" aria-live="polite"></p>
    </div>
  `);
  const form = block.querySelector("form");
  const input = block.querySelector("#guess-input");
  input.addEventListener("focus", () => {
    window.setTimeout(() => {
      input.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }, 280);
  });
  input.addEventListener("input", () => handlers.onInput(input.value));
  input.addEventListener("keydown", (event) => handlers.onKeyDown(event));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onSubmit(input.value);
  });
  return block;
}

/**
 * Mount or update the puzzle. Rebuilding is skipped while the same actor is
 * in progress so the input does not move when a clue opens.
 */
export function showPuzzle(root, view, handlers) {
  let section = root.querySelector("#puzzle");
  const actorChanged = !section || section.dataset.actor !== view.actor.id;
  if (actorChanged) {
    section = el(`
      <section class="puzzle" id="puzzle">
        <div class="status-block">
          <div class="status-copy">
            <p class="actor-label"></p>
            <p class="guess-label"></p>
          </div>
          <div class="dot-slot"></div>
        </div>
        <div class="table-card" id="film-slot"></div>
        <div id="play-slot"></div>
        <ol class="clues" id="clue-list"></ol>
      </section>
    `);
    section.dataset.actor = view.actor.id;
    root.replaceChildren(section);
    fillTable(section.querySelector("#film-slot"), view.actor);
    if (view.round.status === "playing") {
      section.querySelector("#play-slot").appendChild(guessForm(handlers));
    }
  }
  const actorLabel = section.querySelector(".actor-label");
  actorLabel.textContent = `No. ${view.puzzle} · Actor ${view.index + 1} of ${view.total}`;
  section.querySelector(".guess-label").textContent = statusText(view.round);
  section.querySelector(".dot-slot").replaceChildren(dotRow(view.round));

  const play = section.querySelector("#play-slot");
  const finished = view.round.status !== "playing";
  if (finished) {
    play.replaceChildren(resultCard(view.actor, view.round, handlers.onNext, view.index === view.total - 1));
  } else if (!play.querySelector(".guess-block")) {
    play.replaceChildren(guessForm(handlers));
    const input = play.querySelector("#guess-input");
    input.focus();
  } else {
    paintChips(play.querySelector(".chips"), wrongGuesses(view.round));
    const note = play.querySelector(".guess-note");
    if (note) note.textContent = view.note || "";
  }
  syncClues(section.querySelector("#clue-list"), view.actor, view.round, view.animateClue);
  return section.querySelector("#guess-input");
}

function paintChips(list, names) {
  if (!list) return;
  list.replaceChildren(
    ...names.map((name) => {
      const item = document.createElement("li");
      item.className = "chip";
      const icon = document.createElement("span");
      icon.className = "chip-x";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "✕";
      item.append(icon, document.createTextNode(name));
      return item;
    }),
  );
}

export function updateSuggestions(root, actors, activeIndex) {
  const list = root.querySelector("#suggestions");
  const input = root.querySelector("#guess-input");
  if (!list || !input) return;
  list.replaceChildren();
  if (!actors) {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    return;
  }
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  if (actors.length === 0) {
    const item = document.createElement("li");
    item.className = "suggest-empty";
    item.textContent = "No matching actor. Pick a name from the list.";
    list.appendChild(item);
    input.removeAttribute("aria-activedescendant");
    return;
  }
  actors.forEach((actor, index) => {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggest";
    button.setAttribute("role", "option");
    button.id = `suggest-${index}`;
    button.textContent = actor.name;
    if (index === activeIndex) {
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", button.id);
    } else {
      button.setAttribute("aria-selected", "false");
    }
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const handler = updateSuggestions.onPick;
      if (handler) handler(actor);
    });
    item.appendChild(button);
    list.appendChild(item);
  });
  if (activeIndex < 0) input.removeAttribute("aria-activedescendant");
}

export function shakeGuess(root) {
  const block = root.querySelector(".guess-block") || root.querySelector(".guess-form");
  if (!block || prefersReducedMotion()) return;
  block.classList.remove("shake");
  void block.offsetWidth;
  block.classList.add("shake");
}

export function clearGuessInput(root) {
  const input = root.querySelector("#guess-input");
  if (!input) return;
  input.value = "";
  input.focus();
}

export function showResults(root, view, handlers) {
  const section = document.createElement("section");
  section.className = "results";
  const heading = document.createElement("h2");
  heading.className = "results-title";
  heading.textContent = "That's a wrap";
  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = `Box Office No. ${view.puzzle} is in the books.`;
  const list = document.createElement("ol");
  list.className = "recap";
  view.trio.forEach((actor, index) => {
    const round = view.rounds[index];
    const item = document.createElement("li");
    item.className = "recap-card";
    item.appendChild(photoElement(actor, "recap-photo"));
    const copy = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "recap-kicker";
    kicker.textContent =
      round.status === "won"
        ? `Actor ${index + 1} · Got it in ${round.guesses.length}`
        : `Actor ${index + 1} · Missed`;
    const name = document.createElement("p");
    name.className = "recap-name";
    name.textContent = actor.name;
    const squares = document.createElement("p");
    squares.className = "squares";
    squares.textContent = view.squares[index];
    squares.setAttribute("aria-label", squaresLabel(view.squares[index]));
    copy.append(kicker, name, squares);
    item.appendChild(copy);
    list.appendChild(item);
  });
  const share = document.createElement("button");
  share.type = "button";
  share.className = "btn share-btn";
  share.textContent = "Share";
  share.addEventListener("click", handlers.onShare);
  const countdown = document.createElement("p");
  countdown.className = "countdown";
  countdown.id = "countdown";
  section.append(heading, lede, list, share, countdown);
  root.replaceChildren(section);
  const tick = () => {
    const remaining = nextLondonMidnight().getTime() - Date.now();
    const node = document.getElementById("countdown");
    if (!node) return;
    if (remaining <= 0) {
      node.textContent = "A new puzzle is ready.";
      handlers.onRollover();
      return;
    }
    node.textContent = `Next puzzle in ${formatCountdown(remaining)}`;
  };
  tick();
  window.clearInterval(showResults._timer);
  showResults._timer = window.setInterval(tick, 1000);
}

function squaresLabel(row) {
  const parts = [...row].map((cell) => {
    if (cell === "🟥") return "wrong";
    if (cell === "🟩") return "correct";
    return "unused";
  });
  return parts.join(", ");
}

export function stopCountdown() {
  window.clearInterval(showResults._timer);
}

export function openModal({ title, body, onClose, primaryLabel }) {
  const root = document.getElementById("modal-root");
  root.hidden = false;
  root.replaceChildren();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "modal-title");
  const header = document.createElement("div");
  header.className = "modal-header";
  const heading = document.createElement("h2");
  heading.id = "modal-title";
  heading.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn close-modal";
  close.setAttribute("aria-label", "Close");
  close.textContent = "✕";
  header.append(heading, close);
  const content = document.createElement("div");
  content.className = "modal-body";
  content.appendChild(body);
  dialog.append(header, content);
  if (primaryLabel) {
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "btn modal-primary";
    primary.textContent = primaryLabel;
    primary.addEventListener("click", onClose);
    dialog.appendChild(primary);
  }
  backdrop.appendChild(dialog);
  root.appendChild(backdrop);
  const finish = () => onClose();
  close.addEventListener("click", finish);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) finish();
  });
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button, a, input")].filter((node) => !node.disabled);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", onKey);
  openModal._cleanup = () => document.removeEventListener("keydown", onKey);
  close.focus();
}

export function closeModal() {
  if (openModal._cleanup) openModal._cleanup();
  const root = document.getElementById("modal-root");
  root.hidden = true;
  root.replaceChildren();
}

export function helpBody() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <p class="modal-tagline">Name the actor from their biggest films.</p>
    <ol class="how-list">
      <li>Each day you get three actors. Everyone plays the same three.</li>
      <li>The table shows their best-known films. Year, budget, worldwide gross, and the character they played. The name stays hidden.</li>
      <li>You have five guesses. Type a name and pick someone from the list.</li>
      <li>Every wrong guess unlocks the next clue: nationality, birth decade, Oscars, then a famous co-star.</li>
      <li>Finish all three, win or lose, to keep your streak. Miss a day and it resets.</li>
      <li>Share the emoji grid. It never includes the actor's name.</li>
    </ol>
  `;
  return wrap;
}

export function statsBody(stats) {
  const wrap = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "stat-grid";
  const cards = [
    ["Current streak", stats.currentStreak, ""],
    ["Best streak", stats.bestStreak, ""],
    ["Games played", stats.gamesPlayed, ""],
    ["Win rate", stats.gamesPlayed ? Math.round((stats.wins / stats.gamesPlayed) * 100) : null, "%"],
  ];
  for (const [label, value, suffix] of cards) {
    const card = document.createElement("div");
    card.className = "stat-card";
    const number = document.createElement("p");
    number.className = "stat-num";
    number.dataset.target = value == null ? "" : String(value);
    number.dataset.suffix = suffix;
    number.textContent = value == null ? "—" : "0";
    const name = document.createElement("p");
    name.className = "stat-label";
    name.textContent = label;
    card.append(number, name);
    grid.appendChild(card);
  }
  const note = document.createElement("p");
  note.className = "stat-note";
  note.textContent = "Every actor you finish counts as a game.";
  const dist = document.createElement("div");
  dist.className = "dist";
  dist.setAttribute("role", "img");
  dist.setAttribute("aria-label", distributionLabel(stats));
  const max = Math.max(1, ...stats.distribution);
  const labels = ["1", "2", "3", "4", "5", "X"];
  stats.distribution.forEach((count, index) => {
    const row = document.createElement("div");
    row.className = "dist-row";
    const label = document.createElement("span");
    label.className = "dist-label";
    label.textContent = labels[index];
    const track = document.createElement("div");
    track.className = "dist-track";
    const fill = document.createElement("div");
    fill.className = `dist-fill${index === 5 ? " lost" : ""}`;
    fill.style.width = prefersReducedMotion() ? `${count === 0 ? 0 : Math.max(8, (count / max) * 100)}%` : "0%";
    fill.dataset.width = `${count === 0 ? 0 : Math.max(8, (count / max) * 100)}%`;
    track.appendChild(fill);
    const num = document.createElement("span");
    num.className = "dist-num";
    num.dataset.target = String(count);
    num.textContent = prefersReducedMotion() ? String(count) : "0";
    row.append(label, track, num);
    dist.appendChild(row);
  });
  const legend = document.createElement("p");
  legend.className = "dist-legend";
  legend.textContent = "1–5: solved on that guess. X: missed.";
  wrap.append(grid, note, dist, legend);
  window.requestAnimationFrame(() => animateStats(wrap));
  return wrap;
}

function distributionLabel(stats) {
  const labels = ["guess 1", "guess 2", "guess 3", "guess 4", "guess 5", "lost"];
  return stats.distribution.map((count, index) => `${labels[index]}: ${count}`).join(", ");
}

function animateStats(wrap) {
  const reduce = prefersReducedMotion();
  wrap.querySelectorAll(".stat-num").forEach((node) => {
    if (node.dataset.target === "") return;
    const target = Number(node.dataset.target);
    const suffix = node.dataset.suffix || "";
    if (reduce) {
      node.textContent = `${target}${suffix}`;
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 650);
      const eased = 1 - (1 - t) ** 3;
      node.textContent = `${Math.round(target * eased)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  wrap.querySelectorAll(".dist-num").forEach((node) => {
    const target = Number(node.dataset.target);
    if (reduce) return;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 650);
      node.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  if (!reduce) {
    window.setTimeout(() => {
      wrap.querySelectorAll(".dist-fill").forEach((fill) => {
        fill.style.width = fill.dataset.width || "0%";
      });
    }, 40);
  }
}

function clapperMini() {
  return `<svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true"><rect x="4" y="12" width="24" height="14" rx="2" fill="#C4B5FD"/><path d="M5 12 8 7h4l-3 5Zm6 0 3-5h4l-3 5Zm6 0 3-5h4l-3 5Z" fill="#7C3AED"/></svg>`;
}

function flagIcon() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M5 3h2v18H5zm3 1h11l-2 4 2 4H8z"/></svg>`;
}
function cakeIcon() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 4c.6 0 1 .5.8 1.1L12 7l.8-1.9c.2-.6.8-1.1 1.4-.8.5.2.7.8.5 1.3L14 8H8l-.7-2.4c-.2-.5 0-1.1.5-1.3.6-.3 1.2.2 1.4.8L10 7l-.8-1.9C9 4.5 9.4 4 10 4h2zM6 10h12v2H6zm0 3h12l-1 7H7z"/></svg>`;
}
function trophyIcon() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M7 4h10v2h3v2a4 4 0 0 1-3.2 3.9A6 6 0 0 1 13 15.7V18h2v2H9v-2h2v-2.3a6 6 0 0 1-3.8-3.8A4 4 0 0 1 4 8V6h3zm-1 4V8H5v.2A2 2 0 0 0 6 10zm12-.2V8h-1v2a2 2 0 0 0 1-2.2z"/></svg>`;
}
function peopleIcon() {
  return `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6.5 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM3.5 19c.3-2.4 2.4-4 5.5-4s5.2 1.6 5.5 4H3.5zm8.2 0c-.2-1.2-.4-2.2-.2-3 1.2-.6 2.6-.9 4-.9 2.2 0 3.8 1.1 4.3 3.9h-8.1z"/></svg>`;
}
