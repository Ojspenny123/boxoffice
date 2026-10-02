# Changelog

## V1.0.0 — 2026-10-02

First playable release of Box Office.

- Daily puzzle of three actors, one from each tier, seeded by the Europe/London date. Launch day is 2 October 2026.
- Film table with year, poster, title, character, budget, and worldwide gross. Eight to ten well-known films, oldest first. Missing money shows an em dash.
- Five guesses from an accent-insensitive autocomplete list. Wrong guesses unlock nationality, birth decade, Oscars, and a co-star. A win or a fifth miss reveals the actor, then the next puzzle.
- Results screen with a countdown to the next London midnight, a share button (emoji grid only, no actor names), and a streak that counts only a completed day.
- Stats for the current streak, best streak, games played, win rate, and guess distribution. All of it stays in `localStorage`.
- Light, colourful layout aimed at a 375px screen, centred to about 560px on desktop.
- Curated pool of 60 actors in `scripts/actors-seed.json`, a TMDB build script, and a data report. The shipped `actors.json` uses the curated films because no TMDB key was present for the V1 build.
- Netlify config for a static publish from the project root, with short caching for HTML and the actor file.
