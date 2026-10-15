import { fileName, percent, plural } from '../../lore';
import { ageColor, yearMid } from '../../strata';
import type { Core } from '../../types';
import { Dialog } from '../Dialog';
import { coreGradient } from './CoreSamples';
import { FossilCard } from './FossilCard';

interface Props {
  core: Core;
  range: [number, number];
  now: number;
  commitUrlBase: string | null;
  onClose: () => void;
}

/** What one file is made of: its lines grouped by the year they were written. */
export function CoreDetail({ core, range, now, commitUrlBase, onClose }: Props) {
  const byYear = new Map<number, number>();
  for (const [year, count] of core.runs) byYear.set(year, (byYear.get(year) ?? 0) + count);
  const composition = [...byYear].sort((a, b) => a[0] - b[0]);

  return (
    <Dialog labelledBy="core-title" onClose={onClose} className="core-detail">
      <p className="eyebrow">Core sample</p>
      <h2 id="core-title">{fileName(core.path)}</h2>
      <p className="detail-path">{core.path}</p>

      <div className="core-detail-body">
        <div className="core core-large" style={{ background: coreGradient(core, range) }} aria-hidden="true" />
        <table className="composition">
          <caption>{plural(core.lines, 'line')} still alive, by year written</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Lines</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {composition.map(([year, lines]) => (
              <tr key={year}>
                <th scope="row">
                  <span className="swatch" style={{ background: ageColor(yearMid(year), range) }} />
                  {year}
                </th>
                <td>{lines.toLocaleString()}</td>
                <td>
                  <span className="share-bar" style={{ width: `${Math.max(2, (lines / core.lines) * 80)}px` }} />
                  {percent(lines / core.lines)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {core.oldest && (
        <>
          <p className="eyebrow core-oldest-title">Its oldest find</p>
          <FossilCard fossil={core.oldest} range={range} now={now} commitUrlBase={commitUrlBase} />
        </>
      )}
    </Dialog>
  );
}
