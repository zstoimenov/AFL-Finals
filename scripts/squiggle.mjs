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

/** Average every model's home-win confidence (and margin) per game. */
export function normaliseTips(raw) {
  const byGame = new Map();
  for (const t of raw.tips ?? []) {
    const gid = Number(t.gameid);
    const entry = byGame.get(gid) ?? {
      gameid: gid,
      hteamid: Number(t.hteamid),
      ateamid: Number(t.ateamid),
      sum: 0,
      marginSum: 0,
      marginCount: 0,
      models: 0
    };
    // Squiggle confidence is 0-100 for the TIPPED team; convert to home-win prob
    const conf = Number(t.confidence ?? 50) / 100;
    const homeSide = Number(t.tipteamid) === entry.hteamid;
    entry.sum += homeSide ? conf : 1 - conf;
    // Squiggle margin is the predicted winning margin for the tipped team;
    // fold to the home team's perspective (positive = home favoured).
    if (t.margin != null) {
      const m = Math.abs(Number(t.margin));
      entry.marginSum += homeSide ? m : -m;
      entry.marginCount += 1;
    }
    entry.models += 1;
    byGame.set(gid, entry);
  }
  return [...byGame.values()].map(({ sum, marginSum, marginCount, models, ...rest }) => ({
    ...rest,
    hconfidence: Math.round((sum / Math.max(models, 1)) * 1000) / 1000,
    hmargin: marginCount > 0 ? Math.round((marginSum / marginCount) * 10) / 10 : null,
    models
  }));
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
