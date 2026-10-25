// What the key card says, and how sure we are of the key: plain data, so it can be tested without a browser.
import { AMBIGUITY_MARGIN } from "@core/consts";
import { closeCalls, isAmbiguous } from "@core/analyze";
import { keyName } from "@core/key";
import { type Analysis, type KeyCandidate } from "@core/types";

export const MAX_CLOSE_CALL_KEYS: number = 6;

/** A key with at least this share of the likelihood, and no close call beside it, is a confident call. */
const HIGH_CONFIDENCE_SHARE: number = 0.7;
/** A key with at least this share is a fair call; below it the key is a toss-up. */
const MEDIUM_CONFIDENCE_SHARE: number = 0.4;

/** One key the card names, with the hover text that says how sure we are of it. */
export interface KeyChoice {
  name: string;
  /** Confidence and fit, as lines for a tooltip. */
  tip: string;
}

/** What the key card says. */
export interface KeyCardModel {
  label: string;
  /** The leading key, or every close call, best first. */
  keys: KeyChoice[];
  /** Warning shown under a close call. */
  note: string | null;
}

/**
 * A share of the likelihood for display.
 * @param share - The share, 0 to 1.
 * @returns The share as a whole-number percentage.
 */
function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * The leading key, or every close call when the music does not settle it, capped for display.
 * @param analysis - The finished analysis.
 * @returns The keys to show, best first.
 */
export function shownKeys(analysis: Analysis): KeyCandidate[] {
  return closeCalls(analysis).slice(0, MAX_CLOSE_CALL_KEYS);
}

/**
 * Each key's share of the likelihood across all the ranked keys. Key scores bunch close together because keys share
 * most of their notes, so the scores are weighed against each other, with one close-call margin of score as the scale:
 * a key a margin behind the leader is about a third as likely.
 * @param analysis - The finished analysis.
 * @returns One share per key, in ranking order, adding up to 1.
 */
export function keyShares(analysis: Analysis): number[] {
  const best: number = analysis.keys[0]!.score;
  const weights: number[] = analysis.keys.map((key: KeyCandidate): number =>
    Math.exp((key.score - best) / AMBIGUITY_MARGIN),
  );
  const total: number = weights.reduce((sum: number, weight: number): number => sum + weight, 0);

  return weights.map((weight: number): number => weight / total);
}

/**
 * How sure we are of a key, as lines for a tooltip.
 * @param analysis - The finished analysis.
 * @param rank - The key's place in the ranking, 0 for the leader.
 * @param flats - Spell black keys with flats.
 * @returns The tooltip text: a confidence level and share, then how it compares with its neighbour.
 */
export function keyTip(analysis: Analysis, rank: number, flats: boolean): string {
  const shares: number[] = keyShares(analysis);
  const share: number = shares[rank] ?? 0;
  // A close call is never a confident one, however the shares fall.
  const level: string =
    share >= HIGH_CONFIDENCE_SHARE && !isAmbiguous(analysis)
      ? "High"
      : share >= MEDIUM_CONFIDENCE_SHARE
        ? "Medium"
        : "Low";
  const other: number = rank === 0 ? 1 : 0;
  const comparison: string = rank === 0 ? "next closest" : "leader";

  return `${level} confidence · ${formatShare(share)}\n${comparison} ${keyName(analysis.keys[other]!, flats)} ${formatShare(shares[other] ?? 0)}`;
}

/**
 * What the key card says: the leading key, or every close call when the music does not settle it.
 * @param analysis - The finished analysis.
 * @param flats - Spell black keys with flats.
 * @returns The card's text.
 */
export function keyCardModel(analysis: Analysis, flats: boolean): KeyCardModel {
  const shown: KeyCandidate[] = shownKeys(analysis);
  const basis: string = analysis.keyBasis === "chord function" ? "from the chords" : "from the notes alone";

  return {
    label: `${isAmbiguous(analysis) ? "Close call" : "Key"}, ${basis}`,
    keys: shown.map((key: KeyCandidate, rank: number): KeyChoice => ({
      name: keyName(key, flats),
      tip: keyTip(analysis, rank, flats),
    })),
    note: isAmbiguous(analysis) ? "The music alone does not settle which note is home." : null,
  };
}
