# AFL Finals Tracker

An installable PWA that tracks the AFL finals under the **2026 top-ten wildcard
format**, and keeps a **multi-season archive** so the model learns across years
and you can browse past seasons:

- 👀 **This week** — the games still to be played this round, ranked by how much there is
  to watch. Each card leads with the case for watching it and shows the reasons behind its
  ranking, so the order is arguable rather than mysterious.
- ⭐ **My club** — your club's whole season on one screen: ladder position and form, the
  next game, simulated chances, **what it would take** to lock a spot, the run home, the
  likely route through the finals, who's around you on the ladder, and what the results
  archive knows about them. Pick your club from the page itself — the choice is stored in
  your browser and highlights that club everywhere in the app.
- 🗂 **Finals** — the full five-week bracket (Wildcard Round → Qualifying/Elimination →
  Semis → Prelims → Grand Final), projected from the live ladder until finals begin,
  then filled with real results. Wildcard winners are re-seeded per the AFL rules
  (higher-ranked winner takes the 7 seed). The screen leads with where the series is up
  to — the next game, its kickoff in AWST and its ground, or the premier once there is
  one — and every card carries what the app knows about the matchup: both clubs' recent
  form and every previous meeting the archive holds.
- 📅 **Fixtures** — upcoming games with win-probability bars from the in-app model,
  plus the Squiggle model-consensus tip where available.
- 🪜 **Ladder** — live standings with the wildcard-bye (top 6) and finals (top 10) cut
  lines, and 🔒 badges when a team's fate is **mathematically settled** (locked into a
  tier, locked to an exact position, or eliminated). The locks engine uses conservative
  points bounds, so a badge is always a true certainty. A switch on the heading picks the
  columns — **Summary** (played, points, percentage and status), **Extended** (the full
  record plus points for and against) or **Form** (each club's last five results with
  margins) — so every number is reachable on a phone without a sideways scroll, and the
  choice is remembered.
- 🏆 **Odds** — premiership projections from a 10,000-run Monte Carlo simulation of the
  remaining season and the entire finals series, including wildcard games and
  re-seeding.
- 🗄 **Seasons** — a multi-season hub, opened from **All seasons…** in the header's season
  switcher (it's a season control, so it sits with the years rather than in the nav row,
  which stays for the screens you move between during a round). The switcher browses past seasons' ladders,
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
(`index.json`) for the season switcher and hub. **The archive ships empty and is
filled only with real data** — no fake past seasons — by the **Update AFL history**
workflow (`.github/workflows/fetch-history.yml`), which builds it from Squiggle on
demand (`workflow_dispatch`) and yearly (each January it folds the just-finished
season in). Until it runs, the hub shows an empty state and the app behaves exactly
as a single-season tracker (fail-soft loaders, no carry-over prior). History is
normalised through the same shared module (`scripts/squiggle.mjs`) as the live
season, so a 2023 game and a 2026 game are the exact same shape the model expects.

## Getting around

Navigation takes the shape each screen wants (`src/components/PrimaryNav.tsx`): a **bottom
bar** on phones — inside the thumb's reach, off the top edge where the content is — and the
**pill row** on wider screens, which has room to show every destination at once. Both are
rendered and CSS picks one, so there's no resize listener and no flash of the wrong nav on
first paint. The bar carries four destinations plus **More**; when the screen you're on
lives in the More sheet, More takes its name and highlight so you always know where you are.
The bar stays live above the sheet, so another destination is still one tap away.

Screens are **hash routes** (`#/week`, `#/club`, …), so every screen is linkable, the back
button steps between screens instead of leaving the app, and an installed PWA can open
straight onto one. The season is a header control, not part of the route.

## What it would take

The club dashboard answers "what do we actually need?" with a **guarantee, not a
projection** (`winsToGuarantee`, `src/domain/club.ts`). A club doesn't get to choose which
games it wins, so "3 wins is enough" only holds if *every* way of winning 3 of them locks the
spot. That's what it checks: each of the 2^M ways the club's own remaining games could fall
goes through the same conservative locks engine as the ladder's 🔒 badges, with every other
club still free to win everything left. Draws only help, so the guarantee survives them.
Beyond eight games left it declines to answer, because nothing is guaranteed that far out.

The record book underneath is built from the archive the app actually holds, labelled with
the year it starts from — no hand-entered honour roll, so it can't claim a piece of club
history the app can't show you.

## Ranking the week

`src/domain/interest.ts` decides what's worth watching. The app updates itself daily with
nobody at the wheel, so "the interesting games this week" has to be **computed** rather than
curated. Every game still to be played in the current round is scored by independent signals —
how evenly the model splits it, what the result would settle on the ladder, where the clubs
sit relative to the finals cut lines, standing rivalries, recent head-to-head and current
streaks — and each signal states its own case in plain English. **The score is exactly the sum
of the reasons shown on the card**, so a ranking can always be argued with on the evidence.
The weights are editorial, not fitted: there is no ground truth for "interesting" to backtest
against, so they only encode an ordering — what a game *decides* outranks how close it is,
which outranks who is playing.

The stakes signals are **mathematical, not projected**. "Win and they're in" re-runs the same
conservative locks engine as the ladder badges over the season as it *would* stand after each
result, so a clinch shown here is guaranteed by that result alone, whichever way every other
game falls. Rivalries that hold every year are curated in `src/domain/rivalries.ts` (Squiggle's
feed has no rivalry field — a derby looks like any other fixture in the data); the ones a
season *earns* — clubs whose recent meetings have all been tight, or a rematch of last year's
finals — are read straight out of the results archive, so that table never needs editing to
keep up.

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
model. The prior ships enabled but conservative; a multi-season backtest test asserts
it never regresses calibration, so it can only help once real history is collected.

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
