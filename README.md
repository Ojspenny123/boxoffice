# Box Office

Version 1.0.1

Name the actor from their biggest films.

Box Office is a mobile-first daily movie puzzle. Everyone gets the same three actors each day. For each one you see their best-known films, with the name hidden, and you have five guesses. It is a static site: plain HTML, CSS, and JavaScript, with no backend and no framework.

## Play locally

```bash
npm start
```

Open http://127.0.0.1:8080. The first visit shows a short How to play note. Progress, streaks, and stats stay in `localStorage` under keys that start with `boxoffice_`.

```bash
npm run check
```

That runs the logic checks (dates, guesses, streaks, share text, and the actor file) with no network.

## How a day works

The day resets at midnight in Europe/London. Puzzle number 1 is 2 October 2026. The deal is deterministic: each tier has a fixed shuffle, and day N takes the next actor from tier 1, tier 2, and tier 3. An actor is not repeated until that tier's pool wraps.

- Slot 1 is a mega-star (tier 1). Slot 2 is a well-known mid-tier actor. Slot 3 is a harder but still well-known pick.
- Five guesses per actor. You pick a name from the autocomplete list. Free text is not submitted.
- Wrong guesses unlock nationality, birth decade, Oscar wins and nominations, then a famous co-star.
- Finishing all three actors, win or lose, counts the day toward the streak. Missing a full London day resets the current streak. A finished day cannot be replayed.

## Actor data

The hand-curated pool lives in `scripts/actors-seed.json` (60 actors for V1, a larger pool is the later target). `scripts/build-actors.js` writes `data/actors.json` and `data/build-report.md`.

```bash
cp .env.example .env
# put a TMDB v3 key in TMDB_API_KEY
npm run build:actors
```

With `TMDB_API_KEY` set, films come from TMDB person credits plus movie details: vote count at least 5,000, no documentaries, TV movies, shorts, cameos, or self roles, then the top 8–10 by popularity, sorted by year. Budget and worldwide gross come from the movie record. A missing or zero figure is stored as missing and the table shows an em dash.

The file in this repo was built with a TMDB read token. Films, photos, posters, budgets, and worldwide grosses come from TMDB. Awards, nationalities, and co-stars stay hand-curated. An actor with fewer than eight films that have 5,000 votes and a known gross keeps the curated film list, and those titles are matched back to TMDB for posters and money. Read `data/build-report.md` afterwards. It lists anyone below that line, plus films whose budget or gross is missing.

Names and locked clues are base64 in `actors.json`. That only deters casual spoiling. The page title, URL, and autocomplete list do not reveal today's answers.

Do not commit `.env`. The example file is `.env.example`.

## Deployment

Box Office is a static site. `netlify.toml` publishes the project root with no build step. `index.html` is not cached. `data/actors.json` is cached for five minutes. CSS, JavaScript, images, and the favicon are cached for seven days.

### First link

From the project root, with the [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed:

```bash
npm install -g netlify-cli
netlify login
netlify init
```

`netlify init` creates or links a site and writes `.netlify/` (that folder is gitignored). Confirm the publish directory is `.` and that there is no build command.

### Redeploy

```bash
netlify deploy --prod
```

The command prints the live URL. After a data refresh, deploy again so `data/actors.json` updates. HTML and the actor file use short cache headers, so a reload picks up a new deal file without a rename.

### Roll back

1. Open the site in the Netlify dashboard.
2. Go to **Deploys**.
3. Open the last good deploy and choose **Publish deploy**.

That restores the previous static snapshot, including `data/actors.json`, without a git revert. To roll the source back as well, check out the older commit (the V1 tag is `v1.0.0`) and run `netlify deploy --prod` again.

Production was not deployed from the environment that built V1: the Netlify CLI was not installed and no site was linked. Run the first-link steps above, then `netlify deploy --prod`.

## Planned for V2

These are not in the V1 code:

- Dark mode
- Practice mode and an archive of past days
- A leaderboard
