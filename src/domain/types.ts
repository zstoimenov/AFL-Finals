/** Squiggle-shaped game record (subset of fields we use). */
export interface Game {
  id: number;
  round: number;
  year: number;
  /** 1 when the match has a final result */
  complete: number;
  hteamid: number;
  ateamid: number;
  hscore: number | null;
  ascore: number | null;
  /** Goal/behind breakdown, when Squiggle provides it — lets the model use
   * scoring shots (goals + behinds), a steadier strength signal than final
   * score since goal-kicking accuracy is noisy. Absent on older snapshots. */
  hgoals?: number | null;
  hbehinds?: number | null;
  agoals?: number | null;
  abehinds?: number | null;
  /** ISO-ish venue-local start time, e.g. "2026-09-11 19:40:00" */
  date: string;
  /** absolute kickoff instant (epoch seconds) — used to render AWST */
  unixtime?: number | null;
  venue: string | null;
  /** 0 = home & away; >0 = finals week number (Squiggle marks finals rounds after the last H&A round) */
  is_final: number;
  winnerteamid: number | null;
}

/** Squiggle-shaped ladder standing (subset). */
export interface Standing {
  id: number; // team id
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pts: number; // premiership points (4 per win)
  percentage: number; // points for / against * 100
  for: number;
  against: number;
}

/** Aggregated Squiggle model tip for one game. */
export interface Tip {
  gameid: number;
  hteamid: number;
  ateamid: number;
  /** mean predicted probability that the HOME team wins, 0..1 */
  hconfidence: number;
  /** mean predicted margin from the HOME team's perspective (points; positive =
   * home favoured). A sharper consensus signal than confidence alone. Absent on
   * older snapshots. */
  hmargin?: number | null;
  /** number of models aggregated */
  models: number;
}

export interface Meta {
  fetchedAt: string;
  year: number;
  source: 'squiggle' | 'seed';
  /** current H&A round in progress / last completed */
  currentRound: number;
  /** total H&A rounds in the season */
  totalRounds: number;
}

export interface Snapshot {
  games: Game[];
  standings: Standing[];
  tips: Tip[];
  meta: Meta;
}

/** Lock status of a team relative to ladder tiers, from the locks engine. */
export interface TeamLocks {
  teamId: number;
  rank: number;
  minPts: number;
  maxPts: number;
  /** mathematically certain to finish in the top N (points-safe, no percentage needed) */
  inTop2: boolean;
  inTop4: boolean;
  inTop6: boolean;
  inTop10: boolean;
  /** mathematically eliminated from the top N */
  outOfTop2: boolean;
  outOfTop4: boolean;
  outOfTop6: boolean;
  outOfTop10: boolean;
  /** cannot move from current ladder position at all */
  lockedExact: boolean;
}

export type FinalsRound = 'WC' | 'QF' | 'EF' | 'SF' | 'PF' | 'GF';

/** One side of a bracket match: either a known team or a probabilistic placeholder. */
export interface BracketSide {
  teamId: number | null;
  seed: number | null;
  /** label when team not yet known, e.g. "Winner WC1" */
  placeholder: string | null;
  /** simulated probability that the eventual occupant is this team's most likely candidate */
  candidates: Array<{ teamId: number; prob: number }>;
  /** this specific side can no longer change: the team is mathematically
   * pinned to this seed pre-finals, or fixed by results once finals begin */
  locked: boolean;
}

export interface BracketMatch {
  key: string; // WC1, WC2, QF1, QF2, EF1, EF2, SF1, SF2, PF1, PF2, GF
  round: FinalsRound;
  name: string;
  home: BracketSide;
  away: BracketSide;
  /** real game if fixture exists / played */
  game: Game | null;
  /** model probability home side wins (when both teams known) */
  homeWinProb: number | null;
  /** Squiggle consensus probability home side wins, if available */
  squiggleHomeProb: number | null;
  winnerTeamId: number | null;
  /** true only once finals have begun and both participants are fixed */
  locked: boolean;
}

export interface SimResult {
  iterations: number;
  /** per team id */
  teams: Record<
    number,
    {
      makeFinals: number; // P(top 10)
      top6: number;
      top4: number;
      top2: number;
      reachGF: number;
      premier: number;
    }
  >;
}
