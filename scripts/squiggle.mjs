/**
 * Shared Squiggle fetch + normalisation, used by every data script so the live
 * season, the multi-season history archive and the backtest corpus all normalise
 * game / standing / tip records identically. Keeping one implementation here is
 * what lets the model treat a 2023 game and a 2026 game as the same shape.
 *
 * Per Squiggle's usage policy only these scripts talk to the API (identified by
 * User-Agent) — never the visitors' browsers.
 */

export const UA =
  'AFL-Finals-Tracker/1.0 (github.com/zstoimenov/AFL-Finals; zdravko.stoimenov@gmail.com)';

/** Fetch one Squiggle query for a given year as JSON. */
export async function squiggle(query, year) {
  const url = `https://api.squiggle.com.au/?q=${query};year=${year};format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Squiggle ${query} ${year} -> HTTP ${res.status}`);
  return res.json();
}

/**
 * Normalise a Squiggle `games` payload. Returns the trimmed game records the app
 * uses plus the season's total home & away rounds. Placeholder finals fixtures
 * (team id 0, "TBD v TBD") are dropped — the app derives future finals matchups
 * itself, and a placeholder would make it think finals had already started.
 */
export function normaliseGames(raw) {
  const games = (raw.games ?? []).filter((g) => Number(g.hteamid) > 0 && Number(g.ateamid) > 0);
  // finals week = rounds past the last home & away round
  const lastHomeAwayRound = Math.max(
    0,
    ...games.filter((g) => !g.is_final).map((g) => Number(g.round))
  );
  return {
    totalRounds: lastHomeAwayRound,
    games: games.map((g) => ({
      id: Number(g.id),
      round: Number(g.round),
      year: Number(g.year),
      complete: Number(g.complete) === 100 ? 100 : 0,
      hteamid: Number(g.hteamid),
      ateamid: Number(g.ateamid),
      hscore: g.hscore != null ? Number(g.hscore) : null,
      ascore: g.ascore != null ? Number(g.ascore) : null,
      hgoals: g.hgoals != null ? Number(g.hgoals) : null,
      hbehinds: g.hbehinds != null ? Number(g.hbehinds) : null,
      agoals: g.agoals != null ? Number(g.agoals) : null,
      abehinds: g.abehinds != null ? Number(g.abehinds) : null,
      date: String(g.date ?? ''),
      unixtime: g.unixtime != null ? Number(g.unixtime) : null,
      venue: g.venue ?? null,
      is_final: g.is_final ? Math.max(1, Number(g.round) - lastHomeAwayRound) : 0,
      winnerteamid: g.winnerteamid != null ? Number(g.winnerteamid) : null
    }))
  };
}

export function normaliseStandings(raw) {
  return (raw.standings ?? []).map((s) => ({
    id: Number(s.id),
    rank: Number(s.rank),
    played: Number(s.played),
    wins: Number(s.wins),
    losses: Number(s.losses),
    draws: Number(s.draws ?? 0),
    pts: Number(s.pts),
    percentage: Number(s.percentage),
    for: Number(s.for),
    against: Number(s.against)
  }));
}

/**
 * Aggregate the per-model tips for each game.
 *
 * Squiggle returns one row per model per game — roughly thirty independent
 * predictions. Averaging them into a single consensus throws away the most
 * interesting part: whether the models actually agree. A game every model calls
 * the same way and a game they split 16-15 both average out near the same
 * number, yet only one of them is genuinely unpredictable. So alongside the mean
 * we keep the shape of the disagreement — how many tipped the home side, the
 * spread of their probabilities, and the range they cover.
 */
export function normaliseTips(raw) {
  const byGame = new Map();
  for (const t of raw.tips ?? []) {
    const gid = Number(t.gameid);
    const entry = byGame.get(gid) ?? {
      gameid: gid,
      hteamid: Number(t.hteamid),
      ateamid: Number(t.ateamid),
      probs: [],
      marginSum: 0,
      marginCount: 0
    };
    // Squiggle confidence is 0-100 for the TIPPED team; convert to home-win prob
    const conf = Number(t.confidence ?? 50) / 100;
    const homeSide = Number(t.tipteamid) === entry.hteamid;
    entry.probs.push(homeSide ? conf : 1 - conf);
    // Squiggle margin is the predicted winning margin for the tipped team;
    // fold to the home team's perspective (positive = home favoured).
    if (t.margin != null) {
      const m = Math.abs(Number(t.margin));
      entry.marginSum += homeSide ? m : -m;
      entry.marginCount += 1;
    }
    byGame.set(gid, entry);
  }
  return [...byGame.values()].map(({ probs, marginSum, marginCount, ...rest }) => {
    const models = probs.length;
    const mean = models > 0 ? probs.reduce((a, b) => a + b, 0) / models : 0.5;
    const variance =
      models > 0 ? probs.reduce((a, p) => a + (p - mean) ** 2, 0) / models : 0;
    return {
      ...rest,
      hconfidence: round(mean, 3),
      hmargin: marginCount > 0 ? round(marginSum / marginCount, 1) : null,
      models,
      // a model "tips home" when it gives the home side better than even odds;
      // exactly 0.5 is not a tip either way and counts for neither side
      htips: probs.filter((p) => p > 0.5).length,
      atips: probs.filter((p) => p < 0.5).length,
      spread: models > 0 ? round(Math.sqrt(variance), 3) : null,
      low: models > 0 ? round(Math.min(...probs), 3) : null,
      high: models > 0 ? round(Math.max(...probs), 3) : null
    };
  });
}

const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Every model's individual tip, kept whole rather than averaged.
 *
 * `normaliseTips` above answers "what does the field think"; this answers "who
 * was right". Grading each tipster separately is what turns the app's own
 * scorecard from "we beat the average of thirty models" — a soft bar, since the
 * average is dragged down by the weakest of them — into "we finished eighth of
 * thirty-one". Squiggle publishes these before each game, so scoring them
 * against the result afterwards involves no hindsight.
 *
 * Written with short keys (`g`ame, `s`ource, `p`robability) because this is one
 * row per model per game — roughly seven thousand of them in a season — and the
 * file is downloaded by anyone who opens the hub. The app-facing names are
 * restored in `domain/types.ts`.
 */
export function normaliseTipsters(raw) {
  const sources = new Map();
  const tips = [];
  for (const t of raw.tips ?? []) {
    const id = Number(t.sourceid ?? 0);
    const gameid = Number(t.gameid ?? 0);
    if (!id || !gameid) continue;
    if (!sources.has(id)) sources.set(id, { id, name: String(t.source ?? `Model ${id}`) });
    // same fold as the consensus: confidence is for the tipped team, we store
    // every probability from the home side's point of view
    const conf = Number(t.confidence ?? 50) / 100;
    const homeSide = Number(t.tipteamid) === Number(t.hteamid);
    tips.push({ g: gameid, s: id, p: round(homeSide ? conf : 1 - conf, 3) });
  }
  return {
    sources: [...sources.values()].sort((a, b) => a.name.localeCompare(b.name)),
    tips
  };
}

/**
 * Squiggle's own projected end-of-season ladder.
 *
 * The app simulates the rest of the season itself; this is the same question
 * answered by somebody else, which makes it the one benchmark that says whether
 * the simulation is merely self-consistent or actually plausible. Where the two
 * disagree is more interesting than where they agree.
 *
 * Parsed tolerantly on purpose. This is the one Squiggle query the app had never
 * called, so the exact field names are taken on trust until a real run confirms
 * them: a row needs a team id and something rank-shaped, and anything else is
 * ignored. Several models publish a projection, so ranks are averaged across
 * whoever answered and the contributing count is kept — a projection from one
 * source is not the same claim as a projection from ten.
 *
 * Returns an empty array rather than throwing when the payload is not what we
 * expect, which the caller treats as "no projection deployed".
 */
export function normaliseProjectedLadder(raw) {
  const rows = Array.isArray(raw?.ladder) ? raw.ladder : [];
  const byTeam = new Map();
  for (const r of rows) {
    const id = Number(r.teamid ?? r.team_id ?? r.id ?? 0);
    const rank = Number(r.rank ?? r.mean_rank ?? r.position ?? 0);
    if (!id || !Number.isFinite(rank) || rank <= 0) continue;
    const entry = byTeam.get(id) ?? { id, sum: 0, n: 0 };
    entry.sum += rank;
    entry.n += 1;
    byTeam.set(id, entry);
  }
  return [...byTeam.values()]
    .map(({ id, sum, n }) => ({ id, projectedRank: round(sum / n, 2), sources: n }))
    .sort((a, b) => a.projectedRank - b.projectedRank);
}

/** Kickoff instant (epoch seconds) for a normalised game — unixtime or parsed date. */
export function gameStart(g) {
  if (g.unixtime && g.unixtime > 0) return g.unixtime;
  const t = Date.parse(String(g.date ?? '').replace(' ', 'T'));
  return Number.isNaN(t) ? 0 : Math.round(t / 1000);
}

/**
 * The finals format a season was played under. AFL used the McIntyre / current
 * top-eight system through 2025; 2026 introduced the ten-team wildcard format.
 * Centralised here so a future format change (e.g. 2028) is a one-line edit and
 * every consumer — archive labels, the app's bracket router — agrees.
 */
export function finalsFormatForYear(year) {
  return Number(year) >= 2026 ? 'top10-wildcard' : 'top8';
}

/** The premiership winner of a season: the winner of its last, highest final. */
export function seasonPremier(games) {
  const finals = games.filter(
    (g) => g.is_final > 0 && g.complete && g.winnerteamid != null
  );
  if (finals.length === 0) return null;
  const gf = finals.reduce((best, g) => {
    if (g.is_final > best.is_final) return g;
    if (g.is_final === best.is_final && gameStart(g) > gameStart(best)) return g;
    return best;
  });
  return gf.winnerteamid;
}
