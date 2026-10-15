import { useMemo, useState, type CSSProperties } from 'react';
import { plural } from '../../lore';
import { ageColor, type Period } from '../../strata';

// The wall is drawn in a fixed coordinate space and stretched to the container's width;
// text lives in HTML on top of it so it never stretches.
const WIDTH = 1000;
const HEIGHT = 420;
const STEP = 40; // horizontal spacing of the points on each wavy boundary

interface Props {
  periods: Period[];
  range: [number, number];
  totalLines: number;
}

interface Band extends Period {
  top: number;
  bottom: number;
  path: string;
  color: string;
}

/** Thickness proportional to lines, with a floor so a thin year still shows as a seam. */
function thicknesses(periods: Period[], total: number) {
  const floor = Math.min(6, (HEIGHT * 0.3) / periods.length);
  const free = HEIGHT - floor * periods.length;
  return periods.map((p) => floor + (p.lines / total) * free);
}

/** A deterministic, gently wavy line at height `y`, so the layers look settled rather than ruled. */
function boundary(y: number, amplitude: number, seed: number): [number, number][] {
  const points: [number, number][] = [];
  for (let x = 0; x <= WIDTH; x += STEP) {
    const wobble = Math.sin(x / 97 + seed * 1.7) * 0.6 + Math.sin(x / 41 + seed * 3.1) * 0.4;
    points.push([x, y + wobble * amplitude]);
  }
  return points;
}

const toPath = (points: [number, number][]) => points.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' L');

function layout(periods: Period[], total: number, range: [number, number]): Band[] {
  const heights = thicknesses(periods, total);
  // Boundaries from the bottom of the wall up: edge i sits on top of band i.
  const edges: [number, number][][] = [];
  let y = HEIGHT;
  periods.forEach((_, i) => {
    y -= heights[i];
    const above = heights[i + 1] ?? heights[i];
    const amplitude = Math.min(5, heights[i] / 3, above / 3);
    edges.push(boundary(y, amplitude, i + 1));
  });
  const floor: [number, number][] = [
    [WIDTH, HEIGHT],
    [0, HEIGHT],
  ];

  let bottom = HEIGHT;
  return periods.map((period, i) => {
    const top = bottom - heights[i];
    const under = i === 0 ? floor : [...edges[i - 1]].reverse();
    const band = {
      ...period,
      top,
      bottom,
      path: `M${toPath(edges[i])} L${toPath(under)} Z`,
      color: ageColor((period.start + period.end) / 2, range),
    };
    bottom = top;
    return band;
  });
}

export function StrataWall({ periods, range, totalLines }: Props) {
  const bands = useMemo(() => layout(periods, totalLines, range), [periods, totalLines, range]);
  const [active, setActive] = useState<Band | null>(null);
  const share = (lines: number) => `${((lines / totalLines) * 100).toFixed(lines / totalLines < 0.1 ? 1 : 0)}%`;
  // Label every band when there's room, otherwise only the ones thick enough to hold text.
  const labelled = (band: Band) => band.bottom - band.top >= 15;

  return (
    <figure className="strata">
      <div className="strata-surface" aria-hidden="true">
        <svg className="strata-stone" viewBox="0 0 20 26" width="20" height="26">
          <path d="M2 26V9a8 8 0 0 1 16 0v17z" />
        </svg>
      </div>
      <div className="strata-cliff" onMouseLeave={() => setActive(null)}>
        <svg
          className="strata-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Rock layers of the codebase, one per period, oldest at the bottom. The same numbers are in the table below."
        >
          {bands.map((band, i) => (
            <path
              key={band.key}
              d={band.path}
              className={`stratum ${active ? (active.key === band.key ? 'is-active' : 'is-dim') : ''}`}
              style={{ fill: band.color, '--i': i } as CSSProperties}
              tabIndex={0}
              aria-label={`${band.label}: ${plural(band.lines, 'line')}, ${share(band.lines)}`}
              onMouseEnter={() => setActive(band)}
              onFocus={() => setActive(band)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="strata-texture" aria-hidden="true" />
        <div className="strata-labels" aria-hidden="true">
          {bands.filter(labelled).map((band) => (
            <span
              key={band.key}
              className="strata-label"
              style={{ top: `${(((band.top + band.bottom) / 2) / HEIGHT) * 100}%` }}
            >
              <span>{band.label}</span>
              <span>{share(band.lines)}</span>
            </span>
          ))}
        </div>
        {active && (
          <div
            className="strata-tip"
            style={{ top: `${(((active.top + active.bottom) / 2) / HEIGHT) * 100}%` }}
            aria-hidden="true"
          >
            <strong>{active.label}</strong>
            <span>
              {plural(active.lines, 'line')} · {share(active.lines)}
            </span>
            {active.authors.length > 0 && <span className="strata-tip-authors">Laid by {active.authors.map(([name]) => name).join(', ')}</span>}
          </div>
        )}
      </div>
      <figcaption className="visually-hidden">
        <table>
          <caption>Surviving lines by period written</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Lines</th>
              <th scope="col">Share</th>
              <th scope="col">Top authors</th>
            </tr>
          </thead>
          <tbody>
            {[...bands].reverse().map((band) => (
              <tr key={band.key}>
                <th scope="row">{band.label}</th>
                <td>{band.lines}</td>
                <td>{share(band.lines)}</td>
                <td>{band.authors.map(([name]) => name).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
