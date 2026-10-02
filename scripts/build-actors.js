/**
 * Build data/actors.json from scripts/actors-seed.json.
 *
 * With TMDB_API_KEY in .env, each actor's films are chosen from TMDB:
 * vote count at least 5,000, no documentaries, TV movies, shorts, cameos,
 * or "self" roles, then the top 8–10 by popularity, sorted by year.
 * Budget and worldwide gross come from the movie details endpoint.
 *
 * Without a key, the curated films in the seed are used so the game can
 * still ship. Photos and posters are filled from the Wikipedia REST API.
 * Re-run with a TMDB key to refresh the file from the source of truth.
 *
 * Names, alternate spellings, photo URLs, and locked clues are base64.
 * That only deters casual spoiling.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(root, "scripts", "actors-seed.json");
const outPath = path.join(root, "data", "actors.json");
const reportPath = path.join(root, "data", "build-report.md");
const cachePath = path.join(root, "scripts", ".cache", "images.json");

const MIN_VOTES = 5000;
const DOC_GENRE = 99;
const TV_MOVIE_GENRE = 10770;
const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const USER_AGENT = "BoxOffice/1.0 (https://github.com/Ojspenny123/boxoffice; actor puzzle data)";

const args = new Set(process.argv.slice(2));
const skipImages = args.has("--no-images");

function loadEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function encodeText(value) {
  return Buffer.from(String(value ?? ""), "utf8").toString("base64");
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actorNames(seed) {
  return [seed.name, ...(seed.alts || [])].filter((name) => name && name.length >= 3);
}

function titleHasActor(title, seed) {
  const haystack = fold(title);
  return actorNames(seed).some((name) => haystack.includes(fold(name)));
}

function isSelfRole(character) {
  const role = fold(character);
  if (!role) return false;
  if (/^(self|himself|herself|themselves|cameo)$/.test(role)) return true;
  return /\b(himself|herself|themselves|archive footage|uncredited|cameo)\b/.test(role);
}

function maskCharacter(character, seed) {
  let text = String(character || "").trim();
  const names = actorNames(seed).slice().sort((a, b) => b.length - a.length);
  for (const name of names) {
    text = text.replace(new RegExp(escapeRegExp(name), "gi"), "—");
  }
  text = text.replace(/\s+/g, " ").trim();
  return text || "—";
}

function idFor(name) {
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `p${(hash >>> 0).toString(36)}`;
}

function moneyOrNull(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number);
}

function urlSpoils(url, seed) {
  if (!url) return false;
  let haystack = url;
  try {
    haystack = decodeURIComponent(url);
  } catch {
    haystack = url;
  }
  const folded = fold(haystack).replace(/[_\s+.-]+/g, "");
  return actorNames(seed).some((name) => folded.includes(fold(name).replace(/\s+/g, "")));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let gate = Promise.resolve();
function throttle(ms) {
  const run = gate.then(() => sleep(ms));
  gate = run.catch(() => {});
  return run;
}

async function fetchJson(url, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    await throttle(90);
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (response.status === 429 || response.status >= 500) {
      await sleep(400 * attempt);
      continue;
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  }
  return null;
}

function loadCache() {
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache));
}

async function wikiImage(cache, title, year) {
  const key = year ? `${title}::${year}` : title;
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
  const candidates = year
    ? [title, `${title} (${year} film)`, `${title} (film)`, `${title} (${year})`]
    : [title, `${title} (actor)`, `${title} (actress)`];
  let found = "";
  for (const candidate of candidates) {
    const slug = encodeURIComponent(candidate.replace(/ /g, "_"));
    const data = await fetchJson(`${WIKI}${slug}`);
    if (!data || data.type === "disambiguation" || !data.thumbnail?.source) continue;
    const description = fold(data.description || "");
    if (!year && /politician|singer|football|soccer/.test(description) && !/actor|actress/.test(description)) {
      continue;
    }
    found = data.thumbnail.source;
    break;
  }
  cache[key] = found;
  return found;
}

let tmdbTokens = 30;
setInterval(() => {
  tmdbTokens = 30;
}, 10_000).unref?.();

async function tmdb(pathname, params = {}) {
  while (tmdbTokens <= 0) await sleep(200);
  tmdbTokens -= 1;
  const url = new URL(`https://api.themoviedb.org/3${pathname}`);
  url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 429) {
    await sleep(1500);
    tmdbTokens = 0;
    return tmdb(pathname, params);
  }
  if (!response.ok) throw new Error(`TMDB ${response.status} ${pathname}`);
  return response.json();
}

async function findPerson(seed) {
  if (seed.tmdbId) {
    return tmdb(`/person/${seed.tmdbId}`, { append_to_response: "movie_credits" });
  }
  const search = await tmdb("/search/person", { query: seed.name });
  const results = search.results || [];
  const exact = results.filter((person) => fold(person.name) === fold(seed.name));
  const pool = (exact.length ? exact : results).slice().sort((a, b) => b.popularity - a.popularity);
  const match = pool.find((person) => person.known_for_department === "Acting") || pool[0];
  if (!match) throw new Error(`No TMDB match for ${seed.name}`);
  return tmdb(`/person/${match.id}`, { append_to_response: "movie_credits" });
}

async function filmsFromTmdb(seed) {
  const person = await findPerson(seed);
  const credits = (person.movie_credits?.cast || []).filter((credit) => {
    if ((credit.vote_count || 0) < MIN_VOTES) return false;
    const genres = credit.genre_ids || [];
    if (genres.includes(DOC_GENRE) || genres.includes(TV_MOVIE_GENRE)) return false;
    if (isSelfRole(credit.character)) return false;
    if (titleHasActor(credit.title || credit.original_title || "", seed)) return false;
    if (!credit.release_date) return false;
    return true;
  });
  credits.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const detailed = [];
  for (const credit of credits.slice(0, 18)) {
    const movie = await tmdb(`/movie/${credit.id}`);
    const genres = (movie.genres || []).map((genre) => genre.id);
    if (genres.includes(DOC_GENRE) || genres.includes(TV_MOVIE_GENRE)) continue;
    if (movie.runtime && movie.runtime > 0 && movie.runtime < 40) continue;
    if (isSelfRole(credit.character)) continue;
    const gross = moneyOrNull(movie.revenue);
    if (!gross) continue;
    detailed.push({
      popularity: credit.popularity || movie.popularity || 0,
      year: Number(String(movie.release_date || credit.release_date).slice(0, 4)),
      title: movie.title || credit.title,
      character: maskCharacter(credit.character, seed),
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w185${movie.poster_path}` : "",
      budget: moneyOrNull(movie.budget),
      gross,
    });
  }
  detailed.sort((a, b) => b.popularity - a.popularity);
  const chosen = detailed.slice(0, 10).sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  const photo = person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : "";
  const birthYear = person.birthday ? Number(String(person.birthday).slice(0, 4)) : seed.birthYear;
  return { films: chosen, photo, birthYear, tmdbName: person.name };
}

function filmsFromSeed(seed) {
  const films = (seed.films || [])
    .filter((film) => film?.title && !titleHasActor(film.title, seed))
    .map((film) => ({
      year: Number(film.year),
      title: film.title,
      character: maskCharacter(film.character, seed),
      poster: film.poster || "",
      budget: moneyOrNull(film.budget),
      gross: moneyOrNull(film.gross),
      fame: Number(film.gross) || 0,
    }));
  films.sort((a, b) => b.fame - a.fame);
  return films
    .slice(0, 10)
    .map(({ fame, ...film }) => film)
    .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
}

function packActor(seed, films, photo, birthYear) {
  return {
    id: idFor(seed.name),
    tier: seed.tier,
    name: encodeText(seed.name),
    alts: (seed.alts || []).map(encodeText),
    photo: encodeText(photo || ""),
    nationality: encodeText(seed.nationality || ""),
    flag: encodeText(seed.flag || ""),
    birthYear: birthYear || seed.birthYear,
    awards: {
      wins: Number(seed.oscarWins) || 0,
      nominations: Number(seed.oscarNominations) || 0,
    },
    costar: encodeText(seed.costar || ""),
    films: films.map((film) => ({
      year: film.year,
      title: film.title,
      character: film.character,
      poster: film.poster && !urlSpoils(film.poster, seed) ? film.poster : "",
      budget: film.budget,
      gross: film.gross,
    })),
  };
}

function reportFor(rows, source) {
  const lines = [
    "# Box Office data report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Source: ${source}`,
    "",
    "Awards and co-stars are hand-curated. TMDB budget and revenue figures are not always accurate; zeros are stored as missing and shown as an em dash.",
    "",
    "## Needs a look",
    "",
  ];
  let flags = 0;
  for (const row of rows) {
    const notes = [];
    if (row.films.length < 8) notes.push(`only ${row.films.length} films`);
    const missingBudget = row.films.filter((film) => film.budget == null).map((film) => film.title);
    const missingGross = row.films.filter((film) => film.gross == null).map((film) => film.title);
    const missingPosters = row.films.filter((film) => !film.poster).length;
    if (missingBudget.length) notes.push(`missing budget: ${missingBudget.join(", ")}`);
    if (missingGross.length) notes.push(`missing gross: ${missingGross.join(", ")}`);
    if (!row.photo) notes.push("missing photo");
    if (missingPosters) notes.push(`${missingPosters} missing poster${missingPosters === 1 ? "" : "s"}`);
    if (!row.costar) notes.push("missing co-star");
    if (row.awards.wins == null || row.awards.nominations == null) notes.push("missing awards");
    if (row.note) notes.push(row.note);
    if (!notes.length) continue;
    flags += 1;
    lines.push(`- **${row.label}** (tier ${row.tier}): ${notes.join("; ")}`);
  }
  if (!flags) lines.push("- None.");
  lines.push("", `Actors written: ${rows.length}`, "");
  return lines.join("\n");
}

async function mapPool(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return output;
}

async function main() {
  loadEnv();
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const useTmdb = Boolean(process.env.TMDB_API_KEY);
  const cache = loadCache();
  const source = useTmdb ? "tmdb" : "curated-seed";
  console.log(`Building ${seed.length} actors via ${source}${skipImages ? " (no images)" : ""}`);

  const built = [];
  for (const person of seed) {
    let films = [];
    let photo = "";
    let birthYear = person.birthYear;
    let note = "";
    if (useTmdb) {
      try {
        const remote = await filmsFromTmdb(person);
        birthYear = remote.birthYear || birthYear;
        photo = remote.photo;
        if (remote.films.length >= 8) films = remote.films;
        else {
          note = `TMDB returned ${remote.films.length} qualifying films; kept the curated list`;
          films = filmsFromSeed(person);
          if (remote.photo) photo = remote.photo;
        }
      } catch (error) {
        note = `TMDB failed (${error.message}); kept the curated list`;
        films = filmsFromSeed(person);
      }
    } else {
      films = filmsFromSeed(person);
      note = "Curated films (TMDB_API_KEY not set)";
    }
    built.push({ person, films, photo, birthYear, note });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  if (!skipImages) {
    const jobs = [];
    for (const row of built) {
      if (!row.photo) jobs.push({ kind: "actor", row, title: row.person.wiki || row.person.name });
      for (const film of row.films) {
        if (!film.poster) jobs.push({ kind: "film", row, film, title: film.title, year: film.year });
      }
    }
    console.log(`Looking up ${jobs.length} images`);
    let done = 0;
    await mapPool(jobs, 3, async (job) => {
      const image = await wikiImage(cache, job.title, job.kind === "film" ? job.year : null);
      if (job.kind === "actor") job.row.photo = image;
      else job.film.poster = image;
      done += 1;
      if (done % 25 === 0) {
        saveCache(cache);
        console.log(`  ${done}/${jobs.length}`);
      }
    });
    saveCache(cache);
  }

  const actors = built
    .map((row) => {
      const packed = packActor(row.person, row.films, row.photo, row.birthYear);
      return { packed, row };
    })
    .sort((a, b) => a.packed.tier - b.packed.tier || a.row.person.name.localeCompare(b.row.person.name))
    .map((entry) => entry.packed);

  const reportRows = built.map((row) => ({
    label: row.person.name,
    tier: row.person.tier,
    films: row.films,
    photo: row.photo,
    costar: row.person.costar,
    awards: { wins: row.person.oscarWins, nominations: row.person.oscarNominations },
    note: row.note,
  }));

  const payload = {
    version: "1.0.0",
    source,
    generatedAt: new Date().toISOString(),
    actors,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(reportPath, reportFor(reportRows, source));
  console.log(`Wrote ${actors.length} actors to ${path.relative(root, outPath)}`);
  console.log(`Report: ${path.relative(root, reportPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
