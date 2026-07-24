import type { FinalsFormat, Meta } from './types';

/**
 * The finals format the app currently models end-to-end (bracket projection,
 * locks, Monte-Carlo odds). Everything else — every archived season, and any
 * future format the app hasn't taught itself yet — falls back to a plain
 * finals-results view. This module is the single seam to extend when a new format
 * arrives (e.g. 2028): teach the bracket/locks/sim the new format, then add its
 * id here.
 */
export const CURRENT_FINALS_FORMAT: FinalsFormat = 'top10-wildcard';

/** The finals system a season used — explicit `meta.format` wins, else by year. */
export function finalsFormatFor(meta: Pick<Meta, 'year' | 'format'>): FinalsFormat {
  return meta.format ?? (meta.year >= 2026 ? 'top10-wildcard' : 'top8');
}

/**
 * Whether the app renders this season as a live projected bracket + odds. True
 * only for formats it actually implements; past seasons (top-eight) and any
 * not-yet-modelled future format render their finals as results instead, so the
 * hub can browse every era without pretending old finals used the 2026 system.
 */
export function supportsProjectedBracket(meta: Pick<Meta, 'year' | 'format'>): boolean {
  return finalsFormatFor(meta) === CURRENT_FINALS_FORMAT;
}

/**
 * Where a season's ladder draws its finals cut lines, by format:
 *  - top-ten wildcard (2026+): a bye line after 6th and the finals line after 10th
 *  - top-eight (through 2025): the finals line after 8th, no bye line
 * `byeCutIndex` / `finalsCutIndex` are 0-based row indices, or null when absent.
 */
export function ladderCutLines(meta: Pick<Meta, 'year' | 'format'>): {
  byeCutIndex: number | null;
  finalsCutIndex: number;
} {
  return finalsFormatFor(meta) === 'top10-wildcard'
    ? { byeCutIndex: 5, finalsCutIndex: 9 }
    : { byeCutIndex: null, finalsCutIndex: 7 };
}

/** Human label for a finals format, for headings and hub cards. */
export function formatLabel(meta: Pick<Meta, 'year' | 'format'>): string {
  return finalsFormatFor(meta) === 'top10-wildcard' ? 'Top-10 wildcard' : 'Top-8 final eight';
}
