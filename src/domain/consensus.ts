import type { Snapshot, Tip } from './types';

/**
 * How much the tipping models disagree about a game.
 *
 * The app already blends Squiggle's consensus into its own prediction, but a
 * consensus is a mean, and a mean hides its own confidence. Thirty models that
 * all say 62% and thirty models split between 30% and 85% average to nearly the
 * same number while describing completely different games: the first is a
 * settled question, the second is the one worth watching.
 *
 * Everything here is derived from fields the tips snapshot may not carry — they
 * were added after the archive was written — so every reader returns null rather
 * than a default when the numbers are missing. A season fetched before this
 * existed simply has no disagreement signal, and every consumer treats that as
 * "unknown", never as "the models agreed".
 */

/** The aggregated tip for a fixture, or null when the game isn't tipped. */
export function tipFor(snapshot: Snapshot, homeId: number, awayId: number): Tip | null {
  return (
    snapshot.tips.find((t) => t.hteamid === homeId && t.ateamid === awayId) ?? null
  );
}

/**
 * The share of models on the majority side, 0.5 (a dead split) to 1 (unanimous).
 *
 * Models sitting exactly on 50% are counted in neither camp but still in the
 * field, so a game nobody will call reads as maximally divided rather than
 * accidentally unanimous.
 */
export function agreement(tip: Tip | null): number | null {
  if (!tip || tip.htips == null || tip.atips == null) return null;
  const decided = tip.htips + tip.atips;
  if (decided === 0 || !tip.models) return null;
  return Math.max(tip.htips, tip.atips) / tip.models;
}

/** Population standard deviation of the models' home-win probabilities. */
export function spread(tip: Tip | null): number | null {
  return tip?.spread ?? null;
}

/**
 * Disagreement as one of three plain words, because a standard deviation is not
 * something to put in front of a reader.
 *
 * The cuts are editorial, not fitted. A field where more than a third of models
 * take the other side is a genuine split; two thirds one way is divided; beyond
 * that the question is effectively settled.
 */
export type ConsensusMood = 'split' | 'divided' | 'agreed';

export function consensusMood(tip: Tip | null): ConsensusMood | null {
  const share = agreement(tip);
  if (share == null) return null;
  if (share < 0.65) return 'split';
  if (share < 0.85) return 'divided';
  return 'agreed';
}

/**
 * A phrase naming what the models did, for a card or a game sheet. Null when the
 * snapshot predates the per-model detail — the caller shows nothing rather than
 * inventing a consensus it cannot see.
 */
export function consensusSummary(tip: Tip | null): string | null {
  if (!tip || tip.htips == null || tip.atips == null) return null;
  const mood = consensusMood(tip);
  if (mood == null) return null;
  const [lead, trail] =
    tip.htips >= tip.atips ? [tip.htips, tip.atips] : [tip.atips, tip.htips];
  const side = tip.htips >= tip.atips ? 'the home side' : 'the away side';
  if (mood === 'split') return `The tipsters are split ${lead}-${trail} on this one`;
  if (mood === 'divided') return `${lead} of ${tip.models} tipsters lean ${side}`;
  return `${lead} of ${tip.models} tipsters agree on ${side}`;
}

/**
 * The width of the models' range, e.g. 0.45 when the least bullish gives the
 * home side 30% and the most bullish 75%. A blunter measure than the standard
 * deviation and a much easier one to state out loud.
 */
export function probRange(tip: Tip | null): number | null {
  if (!tip || tip.low == null || tip.high == null) return null;
  return Math.round((tip.high - tip.low) * 1000) / 1000;
}
