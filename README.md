# AFL Finals Tracker

An installable PWA that tracks the AFL finals under the **2026 top-ten wildcard
format**, and keeps a **multi-season archive** so the model learns across years
and you can browse past seasons:

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
- 🗄 **Seasons** — a multi-season hub. A season switcher browses past seasons' ladders,
  results and finals (rendered under each era's own format — past finals show as
  results, not a 2026-style bracket). Per-season scorecards grade how the in-app model
  and the Squiggle consensus actually tipped each year, and a cross-season **head-to-head**
  explorer shows any two clubs' all-time record.

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

Past seasons live in `public/data/history/`: one frozen snapshot per year
(`<year>.json`), a compact cross-season corpus of every completed game
(`games.json`, which feeds the model's carry-over prior), and a manifest
(`index.json`) for the season switcher and hub. The **Update AFL history** workflow
(`.github/workflows/fetch-history.yml`) builds these from Squiggle — on demand
(`workflow_dispatch`) and yearly (each January it folds the just-finished season
in). `scripts/generate-seed.mjs` also emits a small seed archive so the hub renders
before the first history fetch. History is normalised through the same shared module
(`scripts/squiggle.mjs`) as the live season, so a 2023 game and a 2026 game are the
exact same shape the model expects.

## Prediction model

Transparent and inspectable (`src/domain/predict.ts`). Each team gets a rating that
blends ladder win ratio, log-scaled percentage, **recency-weighted form**, and an
**opponent-adjusted margin** term that folds in strength of schedule (`features.ts`).
That margin uses **scoring shots** (goals + behinds) when the breakdown is
available — a steadier strength signal than the final score, since goal-kicking
accuracy is noisy. A logistic on the rating gap gives each match probability, plus a
home-ground bump (disabled for the Grand Final) and a per-fixture
**interstate-travel** adjustment derived from each club's home grounds (`venues.ts`).

Across seasons the model no longer starts **cold**. Each team begins a new season at a
**carry-over prior** — its prior-season opponent-adjusted strength, regressed toward the
mean (`carryoverPrior`, `CARRYOVER_REGRESSION`) — and the season rating is shrunk toward
that prior by how many games it has played (`blend = played / (played + PRIOR_EQUIV_GAMES)`):
round one leans on the prior, mid-season the live results take over. When no history is
supplied the ratings are byte-for-byte the single-season ratings, so the change is opt-in
and the prior only ever fills the early-season gap the old model left open. The same
prior feeds the Monte-Carlo simulation.

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
carrying goals/behinds. The harness now also scores the cross-season **carry-over prior**
(`priorAwareModel` vs the season-scoped `enrichedSeasonModel`): on a single-season corpus
the two are identical (the prior has no earlier games), and on a multi-season corpus a
test asserts the prior does not regress calibration. `scripts/backtest-years.mjs` builds
the multi-season corpus to tune the prior's magnitude (and re-judge `CONTEXT.h2h` /
`SHOT_WEIGHT`) on real data:

```bash
node scripts/backtest-years.mjs 2022 2023 2024 2025 2026
BACKTEST_GAMES=scratch/backtest-games.json npx vitest run src/domain/backtest.test.ts
```

The exact prior weight and the still-disabled context terms are set from these real
multi-season numbers, not by feel — the same discipline as every other signal in the
model. (On the shipped seed archive the prior already improves Brier and log-loss, which
is what the multi-season backtest test guards against regressing.)

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # domain unit tests (locks, bracket wiring, simulation)
npm run build        # type-check + production build (dist/)
npm run fetch-data   # pull a live Squiggle snapshot into public/data/
npm run fetch-history # build the past-season archive into public/data/history/
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
