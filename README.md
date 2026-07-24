# AFL Finals Tracker

An installable PWA that tracks the AFL finals under the **2026 top-ten wildcard format**:

- 🗂 **Bracket** — the full five-week bracket (Wildcard Round → Qualifying/Elimination →
  Semis → Prelims → Grand Final), projected from the live ladder until finals begin,
  then filled with real results. Wildcard winners are re-seeded per the AFL rules
  (higher-ranked winner takes the 7 seed).
- 📅 **Fixtures** — upcoming games with win-probability bars from the in-app model,
  plus the Squiggle model-consensus tip where available.
- 🪜 **Ladder** — live standings with the wildcard-bye (top 6) and finals (top 10) cut
  lines, and 🔒 badges when a team's fate is **mathematically settled** (locked into a
  tier, locked to an exact position, or eliminated). The locks engine uses conservative
  points bounds, so a badge is always a true certainty.
- 🏆 **Odds** — premiership projections from a 10,000-run Monte Carlo simulation of the
  remaining season and the entire finals series, including wildcard games and
  re-seeding.

## How data updates

The app never hits the Squiggle API from the browser (per Squiggle's usage policy).
Instead, the **Update AFL data** workflow (`.github/workflows/update-data.yml`) runs
daily, fetches games / standings / tips from [Squiggle](https://squiggle.com.au) with an
identifying User-Agent, and commits the snapshots to `public/data/`. That commit
triggers the Pages deploy, so the published app refreshes automatically — no manual
work during the season.

The repo ships with **generated sample data** (`meta.source = "seed"`, produced by
`scripts/generate-seed.mjs`) so the app renders before the first real fetch. The first
run of the update workflow replaces it with live data.

## Prediction model

Transparent and inspectable (`src/domain/predict.ts`). Each team gets a rating that
blends ladder win ratio, log-scaled percentage, **recency-weighted form**, and an
**opponent-adjusted margin** term that folds in strength of schedule (`features.ts`).
That margin uses **scoring shots** (goals + behinds) when the breakdown is
available — a steadier strength signal than the final score, since goal-kicking
accuracy is noisy. A logistic on the rating gap gives each match probability, plus a
home-ground bump (disabled for the Grand Final) and a per-fixture
**interstate-travel** adjustment derived from each club's home grounds (`venues.ts`).

The in-app model is then **blended ~50/50 with the Squiggle consensus** — its
predicted margin (or confidence) across ~31 models — for the win probability the
app displays and simulates (`blendedHomeProb`, `SQUIGGLE_BLEND`). The completed-game
verdicts still grade the in-app model and Squiggle **independently**, so you can see
each tipster's own record. `src/domain/simulate.ts` Monte-Carlos the rest of the
season in a Web Worker to produce finals, top-6, top-4, Grand-Final and premiership
probabilities.

Every signal earns its place through the **backtest harness** (`src/domain/backtest.ts`,
run by `npm test`), which replays completed games and scores each model's
pre-kickoff probabilities — with no hindsight — by hit-rate, Brier score and
log-loss. On the current season each step improves on the last (Brier: original
0.203 → enriched model 0.198 → **Squiggle blend 0.182**; log-loss 0.595 → 0.582 →
**0.538**). Head-to-head, rest-day and neutral-host terms are implemented and
unit-tested but ship disabled (`CONTEXT` weights of 0) because they did not improve
single-season accuracy; the scoring-shot weight (`SHOT_WEIGHT`) awaits real data
carrying goals/behinds. `scripts/backtest-years.mjs` builds a multi-season corpus to
re-evaluate all of these:

```bash
node scripts/backtest-years.mjs 2022 2023 2024 2025 2026
BACKTEST_GAMES=scratch/backtest-games.json npx vitest run src/domain/backtest.test.ts
```

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # domain unit tests (locks, bracket wiring, simulation)
npm run build      # type-check + production build (dist/)
npm run fetch-data # pull a live Squiggle snapshot into public/data/
```

## Deployment

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
The app is served at `https://<user>.github.io/AFL-Finals/`.

## Disclaimer

This is an **unofficial, non-commercial fan project**. It is **not affiliated with,
authorised or endorsed by the Australian Football League (AFL) or any of its clubs**.
"AFL", the club names and any related marks are the property of their respective owners
and are used here purely descriptively, to refer to the real teams and competition the
app tracks. No club logos or crests are used. Match data comes from
[Squiggle](https://squiggle.com.au) under its usage policy.
