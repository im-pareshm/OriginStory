import type { Grave } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;

export function lifespanMs(grave: Grave): number | null {
  return grave.born ? grave.died.at - grave.born.at : null;
}

export function formatLifespan(ms: number | null): string {
  if (ms === null) return 'unknown';
  if (ms < HOUR) return plural(Math.max(1, Math.round(ms / 60_000)), 'minute');
  if (ms < DAY) return plural(Math.round(ms / HOUR), 'hour');
  if (ms < 60 * DAY) return plural(Math.round(ms / DAY), 'day');
  if (ms < 2 * YEAR) return plural(Math.round(ms / (YEAR / 12)), 'month');
  return `${(ms / YEAR).toFixed(1).replace(/\.0$/, '')} years`;
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

/** A share as a whole percentage, without rounding a few lines down to "0%". */
export function percent(share: number): string {
  return share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;
}

export function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || path;
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const RESTING_WORDS = [
  'Rest in peace.',
  'Gone, but not forgotten.',
  'Forever in our git history.',
  'May it rest in /dev/null.',
  'Merged into the great repository beyond.',
  'Still reachable by git checkout.',
  'It compiled. Mostly.',
  'Now living rent-free in .git/objects.',
];

/** A short, deterministic epitaph carved from the facts of a file's life. */
export function epitaph(grave: Grave): string {
  const life = lifespanMs(grave);
  const sameHand = grave.born && grave.born.author === grave.died.author;

  if (grave.lifeNumber > 1) return `Died ${grave.lifeNumber} times. Probably not the last.`;
  if (life !== null && life < HOUR) return 'Barely committed before it was gone.';
  if (life !== null && life < DAY) return sameHand ? 'Made and unmade by the same hand, the same day.' : 'Gone too soon.';
  if (grave.lines === 0) return 'Was always empty inside.';
  if (grave.binary) return 'Spoke only in bytes.';
  if (life !== null && life > 5 * YEAR) return 'Lived a long and full life.';
  if (grave.formerNames.length >= 2) return 'Went by many names.';
  if (grave.touches === 1) return 'Never changed. Never wanted to.';
  if ((grave.lines ?? 0) > 1000) return 'A giant among files.';
  if (grave.authors.length >= 5) return `Loved by ${grave.authors.length} contributors.`;
  if (sameHand) return 'Its maker giveth, and its maker taketh away.';
  return RESTING_WORDS[hashString(grave.path) % RESTING_WORDS.length];
}

export const LOADING_LINES = [
  'Unlocking the cemetery gates…',
  'Cloning the repository…',
  'Reading every commit by lantern light…',
  'Following files through their renames…',
  'Finding the ones that were deleted…',
  'Carving the tombstones…',
];

export const FOSSIL_LOADING_LINES = [
  'Marking out the dig site…',
  'Cloning the repository…',
  'Drilling core samples…',
  'Dating each line by its author…',
  'Brushing the dust off the oldest finds…',
  'Sorting the sediment into layers…',
];
