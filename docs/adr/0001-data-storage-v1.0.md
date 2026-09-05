# ADR 0001 — Static JSON in the repo, not a hosted database

- **Status:** Accepted
- **Date:** 2026-09-05
- **Applies to:** everything under `public/data/`

## Context

The app has no backend. Scheduled GitHub Actions fetch from Squiggle (and now
Open-Meteo), commit the results to `public/data/`, and the browser reads those
files over the Pages CDN. The question periodically worth re-asking is whether
that should become a hosted database — Supabase being the obvious candidate.

It is worth asking because the repo carries its own data, and every refresh
writes a commit. That is an unusual arrangement, and unusual arrangements should
be justified rather than inherited.

So: the shape of the workload, measured rather than assumed.

| | |
| --- | --- |
| `.git`, after 40 data refreshes | 1.7 MB |
| All data shipped | 740 KB |
| …of which the frozen season archive, which never changes again | 632 KB |
| Actually rewritten per refresh | ~95 KB, rising to ~240 KB with `tipsters.json` |
| Writers | one bot, three times a day |
| Readers | everyone, identical bytes, read-only |

This is a single-writer, read-only dataset small enough to hand to the browser
whole. That is the shape static files are best at, and the shape a database is
worst value for.

## Decision

**Keep the data as static JSON committed to the repository.**

## Consequences

What this buys, all of it for free and none of it easy to reproduce on top of a
hosted database:

- **The app works offline.** The service worker caches `/data/` network-first, so
  an installed PWA opens on a plane with the last-synced snapshot. A query
  against a remote Postgres does not, and caching the responses to fix that would
  be reinventing what we already have.
- **One thing can break, not two.** A Pages outage is currently the only failure
  mode. A database adds a second service that can be down, rate-limited, or — on
  a free tier — *paused for inactivity*. A football tracker is quiet from October
  to March, which is exactly the profile that gets paused, and it would wake cold
  in round one.
- **A byte-exact record of what the app showed on any date.** Not a nicety here:
  this app grades its own past predictions and ranks itself against thirty other
  tipsters. `git show <sha>:public/data/tips.json` answers "what did we believe on
  the day" for free. In Postgres that is temporal tables and real work.
- **No credentials in a public bundle.** Even a well-scoped anon key with RLS is
  more configuration and more surface than a file that is already public data.

What we give up, honestly:

- **Repo growth.** Every refresh that finds a change writes a commit. At the
  current cadence that trends to roughly 25–30 MB of history a year, which
  GitHub carries without complaint for a long time — but it is not nothing, and
  `tipsters.json` (~143 KB, rewritten most refreshes) roughly doubled it in one
  go. If it ever becomes a problem the cheap fix is to trim that file to
  completed games only, since that is all the leaderboard scores and it makes the
  file close to append-only. Moving data to an orphan branch that can be reset is
  the expensive fix. Neither is worth doing pre-emptively.
- **Freshness is bounded by the deploy.** A snapshot committed to git can never
  be fresher than its last build, so live in-play scores are out of reach by
  construction — see trigger 4 below.

## When to revisit

This decision is contingent, not principled. Any one of these flips it:

1. **Users write.** A tipping competition, saved comments, anything with accounts.
   This is the real trigger and the likeliest to actually arrive: many concurrent
   writers is the problem a database exists to solve, and the one thing a
   committed file genuinely cannot do.
2. **State has to follow a person across devices.** The chosen club lives in
   `localStorage` today, which is per-browser by design.
3. **The data outgrows the browser.** Per-player statistics across twenty seasons
   would be too much to download. The current 740 KB is nowhere near that line.
4. **Sub-minute liveness.** Live scores during a game need a different pipeline
   regardless of where the data rests.

Until one of those is true, adding a database would be paying setup, operational
and failure cost to solve problems this app does not have.

## Alternatives considered

- **Supabase (or any hosted Postgres).** Rejected above. Would be the right call
  the day trigger 1 arrives, and the read path could stay static even then —
  user writes in Postgres, football data still in the repo.
- **A serverless function proxying Squiggle per request.** Rejected: it would put
  visitor traffic on Squiggle's API, which their usage policy asks us not to do,
  and it trades a CDN read for a cold start.
- **Committing data to an orphan branch.** Keeps `main`'s history clean and can be
  reset periodically. Held in reserve as the mitigation if repo growth ever bites;
  not worth the deploy complexity today.
