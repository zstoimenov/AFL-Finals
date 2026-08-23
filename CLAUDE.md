# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**AFL Finals Tracker** — an installable PWA (React 18 + TypeScript + Vite) that tracks
the AFL under the **2026 top-ten wildcard finals format**, plus a multi-season archive.
It projects the finals bracket from the live ladder, computes mathematical clinch /
elimination locks, runs a Monte-Carlo premiership simulation in a Web Worker, ranks the
week's games by how much there is to watch, and grades its own tipping against the
Squiggle model consensus.

There is **no backend**. Data is static JSON committed into `public/data/` by scheduled
GitHub Actions; the browser only ever reads those files. Deployed to GitHub Pages at
`https://<user>.github.io/AFL-Finals/`.

See `README.md` for the product-level description — it is kept current and is the best
prose explanation of *why* each feature works the way it does.

## Commands

```bash
npm install
npm run dev            # Vite dev server
npm test               # vitest run — 18 files / 165 tests, all domain-level
npm run build          # tsc -b && vite build  → dist/
npm run preview        # serve the production build
npm run fetch-data     # live Squiggle snapshot → public/data/
npm run fetch-history  # past-season archive  → public/data/history/
node scripts/render-icons.mjs   # rasterize icon.svg → icon-192/512.png (Playwright)
```

`npm test` and `npm run build` both run in CI on every push to `main` — run both before
pushing. There is **no ESLint or Prettier config**; match the surrounding style by hand.

## Layout

```
src/
  main.tsx            React root
  App.tsx             all app state, data loading, worker wiring, screen routing
  nav.ts              Route (tab + open game) + hash helpers — the screen truth
  teamSelect.ts       context: "open the team sheet for club X"
  gameSelect.ts       context: "open the game sheet for fixture N"
  useDialog.ts        focus trap / restore / Escape / scroll lock for every dialog
  useOnline.ts        connection state, so a stale stamp says so
  usePullToRefresh.ts the pull gesture behind the header's refresh
  simWorker.ts        Web Worker entry → domain/simulate, posts partial runs
  styles.css          the entire stylesheet (~3k lines, CSS variables, dark + light)
  api/loadData.ts     fetches the static JSON snapshots (fail-soft for history)
  domain/             pure TypeScript — all logic, all tests live here
  components/         presentational React; no data fetching, minimal logic
public/data/          generated snapshots (games/standings/tips/meta + history/)
scripts/              Node ESM data + build scripts (squiggle.mjs is shared)
.github/workflows/    deploy.yml, update-data.yml, fetch-history.yml
```

### Domain modules (`src/domain/`)

| Module | Responsibility |
| --- | --- |
| `types.ts` | Squiggle-shaped `Game` / `Standing` / `Tip` / `Meta` / `Snapshot`, plus `TeamLocks`, `BracketMatch`, `SimResult`, `FinalsFormat`. |
| `teams.ts` | The 18 clubs keyed by **Squiggle team id**, names/abbrevs/colours, `inkOn`, `teamAccent`. |
| `ladder.ts` | Standings sort, remaining games, current H&A round, finals-game filter. |
| `locks.ts` | Conservative clinch/elimination engine (`computeLocks`, `lockLabel`). |
| `bracket.ts` | The 2026 five-week bracket rules: slot participants, wildcard re-seeding, classifying real finals games. |
| `buildBracket.ts` | Assembles the displayable bracket from snapshot + sim + locks. |
| `features.ts` | Predictive features from raw games: kickoff time, opponent-adjusted margins, recency form, head-to-head, rest days, scoring-shot margin. |
| `predict.ts` | Ratings, carry-over prior, home advantage, fixture context, `blendedHomeProb` (model ⊕ Squiggle), `preGameHomeProb`. |
| `simulate.ts` | Seeded Monte Carlo of the remaining season + full finals series. |
| `backtest.ts` | Hindsight-free evaluation harness (hit-rate, Brier, log-loss) with one exported model per generation. |
| `seasonStats.ts` | Per-season model-vs-Squiggle scorecards, cross-season head-to-head. |
| `interest.ts` | Scores "what's worth watching this round" as a sum of explained reasons. |
| `gameDetail.ts` | Assembles everything known about one fixture for the game sheet (hindsight-free). |
| `finalsContext.ts` | The same idea for a bracket *slot* rather than a fixture: head-to-head, form and travel for a matchup that may not be scheduled yet, plus `nextFinal` / `finalsProgress`. |
| `rivalries.ts` | Curated standing rivalries (Squiggle has no rivalry field). |
| `club.ts` | My Club numbers: form, streaks, `winsToGuarantee`, record book, projected path. |
| `season.ts` | The finals-format seam (`top8` vs `top10-wildcard`, cut lines, labels). |
| `venues.ts` | Home-venue sets and interstate-travel detection, derived from games only. |
| `favourite.ts` | The user's club: module-level store + `useFavourite()` + plain `isFavourite()`. |
| `format.ts` | AWST (Australia/Perth, UTC+8, 24-hour) date/time formatting. |

## Architecture rules

**Domain is pure, components are dumb.** Everything computable lives in `src/domain/`
as plain functions over plain data — no React, no DOM, no fetching. Components receive
computed values as props. New logic goes in `domain/` with a test, not inside a
component.

**`App.tsx` owns all state.** Snapshot loading, the archived-season map, the worker,
the selected screen, the selected team and the open game all live there and flow down as
props. There is no state library and no context beyond `TeamSelectContext`,
`GameSelectContext` and the favourite store.

**Archived seasons load on arrival, not at startup.** The four season snapshots are
~400KB and only two screens read them (the hub's scorecards, My Club's record book), so
they're fetched when one of those screens opens. `history/games.json` still loads at
startup — the model's carry-over prior needs it.

**Screens are hash routes.** `src/nav.ts` is the single source of truth for the `Tab`
union, the default screen, live-only screens and `#/<tab>` hashes. Adding a screen means
touching `nav.ts`, `App.tsx`'s `navItems` + render switch, and a component — nothing else.
The season is a header control, **not** part of the route. Renaming a screen means adding
the old name to `nav.ts`'s `RENAMED` map (`bracket` → `finals` is the one entry): saved
links and an installed PWA's start URL must keep resolving, and the old name is never
written again.

An open game sheet *is* part of the route (`#/week/g1234`), so a fixture is linkable and
the back button closes the sheet rather than leaving the app. `routeFromHash` ignores a
game segment it can't read instead of rejecting the whole route, so a stale link still
lands on a real screen. Changing screen always clears the sheet.

**Dialogs use `useDialog`.** Every sheet and popup (`InfoButton`, `ClubPicker`,
`TeamDetail`, `GameDetail`, the More sheet) takes focus on open, traps Tab, restores focus
to whatever opened it, handles Escape and locks background scroll. It only works if the
component mounts and unmounts with the dialog — hence the split-out `InfoModal` /
`MoreSheet` inner components. Don't hand-roll a fifth copy.

**The browser never calls the Squiggle API.** Per Squiggle's usage policy only
`scripts/*.mjs` fetch it, with an identifying `User-Agent` from `scripts/squiggle.mjs`.
Never add a runtime fetch to `api.squiggle.com.au`.

**All fetch paths go through `import.meta.env.BASE_URL`** — the app is served from the
`/AFL-Finals/` sub-path, so absolute `/data/...` URLs break in production.

**History loading is fail-soft.** `loadHistoryIndex` / `loadHistoryCorpus` / `loadSeason`
swallow errors and return empty/null. With no archive the app must behave exactly like a
single-season tracker. Keep that property when touching them.

## Modelling discipline

These are the conventions that make the app defensible; violating them is the main way
to break it in a way tests won't catch.

**No hindsight.** Any function producing a *prediction* for a game takes an explicit
`games` array so the caller can pass only games that started before kickoff
(`gameStart(g) < cutoff`). `preGameHomeProb`, `backtest.evaluate` and `seasonStats` all
rely on this. Never reach for `snapshot.games` inside a scoring path.

**The carry-over prior only sees earlier seasons.** Every caller filters
`history.filter(g => g.year < snapshot.meta.year)` before passing it to
`computeRatings({ history })`. Without history, ratings must stay byte-for-byte identical
to the single-season result.

**Locks are certainties, never likelihoods.** `computeLocks` bounds each team's final
points (min = lose out, max = win out) and treats a points tie as "can pass me", because
percentage isn't bounded. Anything that shows a 🔒, "win and they're in", or
`winsToGuarantee` must route through this engine — a badge is a mathematical guarantee.

**Weights are named exported constants with a rationale comment.** `RATING_WEIGHTS`,
`HOME_ADVANTAGE`, `CONTEXT`, `SQUIGGLE_BLEND`, `PRIOR_EQUIV_GAMES`, `SHOT_WEIGHT`,
`WEIGHTS` (interest). Model weights are justified by the backtest harness; disabled
terms ship at weight `0` (implemented, unit-tested, ready to enable) rather than being
deleted. The `interest.ts` weights are explicitly **editorial**, not fitted — there is no
ground truth for "interesting".

**Interest scores must equal the sum of the reasons shown.** A card's score is
`reasons.reduce(sum)`; never add a hidden term.

**Simulation is deterministic.** `makeRng` (mulberry32) with a fixed seed, so tests and
renders are reproducible. Per-fixture probabilities are computed once outside the
10,000-iteration loop. `simulateSeason` reports partial runs through `opts.onProgress`
(carrying `progress`, 0..1) so the screen can fill in and converge; the callback is
read-only and never touches the RNG stream — a watched run and an unwatched one produce
identical numbers, and a test asserts it.

**Adding a finals format** (e.g. 2028, 19 clubs) starts in `domain/season.ts` +
`scripts/squiggle.mjs:finalsFormatForYear`. `supportsProjectedBracket` is the seam that
decides which seasons get the live bracket/odds versus a plain results view; past
seasons must never be rendered as if they used the current format.

## Data pipeline

- **`update-data.yml`** — daily 13:00 UTC (21:00 AWST). Runs `scripts/fetch-data.mjs`,
  commits `public/data/` as `chore: refresh AFL data snapshot`, then explicitly
  `gh workflow run deploy.yml` (a `GITHUB_TOKEN` push does not trigger `on: push`), only
  from `main`.
- **`fetch-history.yml`** — yearly (mid-January) + `workflow_dispatch` with a years input.
  Runs `scripts/fetch-history.mjs`, writing `history/<year>.json`, `history/games.json`
  (completed-game corpus for the prior) and `history/index.json` (manifest).
- **`deploy.yml`** — on push to `main`: `npm ci`, `npm test`, `npm run build`, publish
  `dist/` to Pages.

Current state of the committed data: live season **2026** (`meta.source: "squiggle"`,
round 24/24), archive holds **2022–2025** real seasons. `scripts/generate-seed.mjs`
produces a deterministic placeholder *live* season (`meta.source: "seed"`, banner in the
UI) and deliberately never fabricates past seasons — fake history would poison the model
and the record book.

**Do not hand-edit `public/data/**`.** It is generated output; regenerate with the
scripts. Both fetch scripts fail soft (non-zero exit leaves the committed snapshot in
place).

`scripts/squiggle.mjs` is the one normaliser for games/standings/tips, so a 2023 game and
a 2026 game are the identical shape. New fields are added there, in `domain/types.ts`, and
as optional (`?: T | null`) so older committed snapshots keep working.

## Tests

- Vitest, `environment: 'node'`, `include: ['src/**/*.test.ts']` — **domain tests only**;
  there is no component/DOM test setup, and `.test.ts` files are excluded from
  `tsconfig.app.json`.
- Tests sit next to their module (`src/domain/locks.test.ts`).
- They build fixtures with small local helpers (`standing()`, `fixture()`) rather than
  importing snapshots — except `backtest.test.ts` / model tests, which read the committed
  `public/data/*.json`. Those assertions are therefore data-sensitive: keep them as
  relative comparisons ("blended beats enriched") rather than hard-coded absolute scores.
- Multi-season tuning:
  ```bash
  node scripts/backtest-years.mjs 2022 2023 2024 2025 2026
  BACKTEST_GAMES=scratch/backtest-games.json npx vitest run src/domain/backtest.test.ts
  ```
  `scratch/` is gitignored and evaluation-only — never ship it as app data.

## Code style

- TypeScript `strict`, plus `noUnusedLocals` / `noUnusedParameters` — an unused import
  fails `npm run build`.
- 2-space indent, single quotes, semicolons, ~90–100 column lines, `type`-only imports
  (`import type { Game } from './types'`).
- Named function exports from domain modules; **default** export for React components.
- Explicit return types on exported domain functions.
- **Every module and exported symbol carries a doc comment explaining *why*, not what.**
  This codebase's comments are unusually prose-heavy and that is deliberate — they record
  the reasoning (why a weight is 0, why locks are conservative, why the nav renders twice).
  Match that register; don't strip it, and don't replace it with restated code.
- Prefer deriving from data over hardcoding (venues, formats, record book). The curated
  exceptions are `teams.ts` and `rivalries.ts`, both justified in their headers.

### UI conventions

- **Identity is never carried by colour alone** — every club colour is paired with a name,
  abbreviation or label; bars and chips carry `aria-label`s naming both teams.
- Dark theme by default with a `prefers-color-scheme: light` override; all colours come
  from CSS variables in `:root` (`--bg`, `--surface`, `--accent`, `--fav`, …). Add a
  variable rather than a literal hex.
- `styles.css` is one file, organised by `/* ---------- section ---------- */` banners;
  add to the matching section.
- Explanatory prose belongs in an `<InfoButton>` popup, not in the screen body.
- The user's club (`domain/favourite`) is highlighted everywhere via `isFavourite()` +
  the `fav` class. `isFavourite` is a plain function on a module-level store; subscribe
  once high in the tree with `useFavourite()` rather than threading a hook down.
- Times are **AWST, 24-hour**, via `domain/format.ts` — never `toLocaleString` inline.
- `localStorage` keys in use: `afl-favourite`, `afl-dismissed`. Every read/write is
  wrapped in `try/catch` (private mode / embedded webviews) with a working fallback.
  Nobody starts out following a club: an absent `afl-favourite` means "never asked", and
  the app asks once on first launch. Declining writes `none`, which is a real answer — so
  the question is asked once, not every launch.
- **Percentages go through `formatProbability`** (`domain/format.ts`), so the same
  simulation isn't rounded three different ways on three screens.
- Anything a `title` tooltip would carry has to exist somewhere a touch device can reach
  it — a visible label, a legend note, or the game/team sheet. `title` is a bonus, never
  the only copy.
- Wide layouts that can't fit a phone (the bracket's five weeks, the ladder's ten columns)
  get a mobile form rather than a horizontal scrollbar: the bracket snaps one week per
  screen with a pager, and the ladder swaps P/W/L/D for a single W–L column.
- Motion is decorative throughout — `@media (prefers-reduced-motion: reduce)` disables it,
  and script-driven smooth scrolling checks `prefersReducedMotion()` from `domain/format`.
- Mobile-first: bottom nav bar on phones, pill row on wide screens — both rendered, CSS
  picks one (no resize listeners, no first-paint flash).

## Git & workflow

- Commit subjects are sentence-style imperatives describing the change from the user's
  point of view ("Add the My Club dashboard, and give the nav a shape per screen size").
  The `chore:` prefix is reserved for the bots' data-refresh commits.
- Work on a feature branch and open a PR against `main`; `main` deploys to production on
  every push.
- Never commit `dist/`, `node_modules/`, `scratch/` (all gitignored).
- Data-refresh commits land on `main` constantly, so rebase/merge before pushing a
  long-running branch; conflicts in `public/data/**` are resolved by taking `main`'s
  version (it is regenerated output).

## Gotchas

- `Game.is_final` is **not** a boolean: `0` = home & away, `1..5` = finals week number
  (normalised in `squiggle.mjs` as `round - lastHomeAwayRound`).
- `Game.complete` is `100` (or `0`) from Squiggle, used truthily throughout.
- Squiggle emits placeholder finals fixtures (`hteamid: 0`, "TBD v TBD"). They are dropped
  in `normaliseGames` and guarded again in `finalsGames` / `upcomingGames` — a placeholder
  slipping through makes the app think finals have started.
- Squiggle tip `confidence` is 0–100 **for the tipped team** and `margin` is the tipped
  team's winning margin; both are folded to the home team's perspective at normalisation.
- Premiership points are 4 per win, 2 per draw (`PTS_PER_WIN`); ladder ties break on
  percentage.
- The Grand Final is played at a neutral venue — pass `neutral = true` to `winProb` for
  the `GF` key so the home bump is disabled.
- The worker is created with `new Worker(new URL('./simWorker.ts', import.meta.url),
  { type: 'module' })` — Vite needs that exact literal form to bundle it.
- The service worker caches `/data/` **network-first**; the header refresh button
  additionally cache-busts with a query string and `cache: 'reload'`.
