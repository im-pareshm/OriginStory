import type { Layer } from './types';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

export type Grain = 'year' | 'quarter' | 'month';

/** A band of the strata wall: surviving lines written in one year, quarter or month. */
export interface Period {
  key: string;
  label: string;
  /** Start and end (exclusive) in ms since epoch, UTC. */
  start: number;
  end: number;
  lines: number;
  authors: [name: string, lines: number][];
}

const monthStart = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m - 1, 1);
};

const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Long histories read best by year; short ones would be a single slab, so they get finer bands. */
export function grainFor(layers: Layer[]): Grain {
  if (layers.length < 2) return 'month';
  const span = monthStart(layers.at(-1)!.month) - monthStart(layers[0].month);
  if (span >= 3 * YEAR - 31 * DAY) return 'year';
  if (span >= 6 * 30 * DAY) return 'quarter';
  return 'month';
}

/** Groups monthly layers into periods of the given grain, oldest first. */
export function bandLayers(layers: Layer[], grain: Grain = grainFor(layers)): Period[] {
  const bands = new Map<string, Period & { byAuthor: Map<string, number> }>();
  for (const layer of layers) {
    const [y, m] = layer.month.split('-').map(Number);
    const q = Math.floor((m - 1) / 3);
    const [key, label, start, end] =
      grain === 'year'
        ? [`${y}`, `${y}`, Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)]
        : grain === 'quarter'
          ? [`${y}-Q${q + 1}`, `${QUARTER_NAMES[q]} ${y}`, Date.UTC(y, q * 3, 1), Date.UTC(y, q * 3 + 3, 1)]
          : [layer.month, `${MONTH_NAMES[m - 1]} ${y}`, Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1)];
    let band = bands.get(key);
    if (!band) bands.set(key, (band = { key, label, start, end, lines: 0, authors: [], byAuthor: new Map() }));
    band.lines += layer.lines;
    for (const [name, lines] of layer.authors) band.byAuthor.set(name, (band.byAuthor.get(name) ?? 0) + lines);
  }
  return [...bands.values()]
    .sort((a, b) => a.start - b.start)
    .map(({ byAuthor, ...band }) => ({ ...band, authors: [...byAuthor].sort((a, b) => b[1] - a[1]).slice(0, 3) }));
}

export interface StrataStats {
  totalLines: number;
  /** Half of the surviving lines were written before this moment. */
  medianAt: number;
  oldestAt: number;
  /** Share of lines written in the 12 months before `now`. */
  recentShare: number;
  /** Share of lines older than five years. */
  ancientShare: number;
}

export function strataStats(layers: Layer[], now: number): StrataStats | null {
  const totalLines = layers.reduce((sum, l) => sum + l.lines, 0);
  if (!totalLines) return null;
  let seen = 0;
  let medianAt = monthStart(layers[0].month);
  for (const layer of layers) {
    seen += layer.lines;
    if (seen >= totalLines / 2) {
      medianAt = monthStart(layer.month) + 15 * DAY;
      break;
    }
  }
  const share = (test: (start: number) => boolean) =>
    layers.filter((l) => test(monthStart(l.month))).reduce((sum, l) => sum + l.lines, 0) / totalLines;
  return {
    totalLines,
    medianAt,
    oldestAt: monthStart(layers[0].month),
    recentShare: share((start) => start >= now - YEAR),
    ancientShare: share((start) => start < now - 5 * YEAR),
  };
}

/** The time range the colour scale spans, from the oldest surviving month to the newest. */
export function ageRange(layers: Layer[]): [number, number] {
  if (!layers.length) return [0, 1];
  const first = monthStart(layers[0].month);
  const last = monthStart(layers.at(-1)!.month) + 31 * DAY;
  return [first, Math.max(last, first + DAY)];
}

/**
 * Sediment colour for a moment in the repo's history: one warm hue whose lightness rises
 * steadily from deep ochre (oldest) to pale sand (newest). The darkest step was checked at
 * 3.1:1 against the night background, the palest at 12.7:1.
 */
export function ageColor(at: number, [first, last]: [number, number]): string {
  const t = Math.min(1, Math.max(0, (at - first) / (last - first)));
  const lightness = 0.52 + t * 0.38;
  const chroma = 0.08 - t * 0.03;
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} 62)`;
}

export const yearMid = (year: number) => Date.UTC(year, 6, 1);
