import { useMemo, useState, type CSSProperties } from 'react';
import { fileName, plural } from '../../lore';
import { ageColor, yearMid } from '../../strata';
import type { Core } from '../../types';

type SortKey = 'oldest' | 'largest' | 'path';

const SORTS: Record<SortKey, { label: string; compare: (a: Core, b: Core) => number }> = {
  oldest: { label: 'Oldest rock first', compare: (a, b) => firstYear(a) - firstYear(b) || a.path.localeCompare(b.path) },
  largest: { label: 'Largest first', compare: (a, b) => b.lines - a.lines },
  path: { label: 'By path', compare: (a, b) => a.path.localeCompare(b.path) },
};

const firstYear = (core: Core) => Math.min(...core.runs.map(([year]) => year));
const lastYear = (core: Core) => Math.max(...core.runs.map(([year]) => year));

/** The file's lines, top to bottom, as one gradient: a hard colour stop per run of same-year lines. */
export function coreGradient(core: Core, range: [number, number]) {
  let at = 0;
  const stops = core.runs.map(([year, count]) => {
    const from = (at / core.lines) * 100;
    at += count;
    const to = (at / core.lines) * 100;
    const color = ageColor(yearMid(year), range);
    return `${color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

const years = (core: Core) => {
  const [first, last] = [firstYear(core), lastYear(core)];
  return first === last ? `${first}` : `${first}–${last}`;
};

interface Props {
  cores: Core[];
  range: [number, number];
  onOpen: (core: Core) => void;
}

export function CoreSamples({ cores, range, onOpen }: Props) {
  const [sort, setSort] = useState<SortKey>('oldest');
  const [hovered, setHovered] = useState<Core | null>(null);
  const sorted = useMemo(() => [...cores].sort(SORTS[sort].compare), [cores, sort]);

  return (
    <div className="cores">
      <div className="controls">
        <select aria-label="Sort core samples" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {Object.entries(SORTS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <p className="core-caption" aria-live="polite">
          {hovered ? (
            <>
              <strong>{hovered.path}</strong> · {plural(hovered.lines, 'line')} · {years(hovered)}
            </>
          ) : (
            'Point at a core to read its label.'
          )}
        </p>
      </div>
      <div className="core-tray" onMouseLeave={() => setHovered(null)}>
        {sorted.map((core, i) => (
          <button
            key={core.path}
            type="button"
            className="core"
            style={
              {
                '--core-height': `${Math.round(28 + Math.log10(core.lines + 1) * 44)}px`,
                '--i': i,
                background: coreGradient(core, range),
              } as CSSProperties
            }
            aria-label={`${fileName(core.path)}: ${plural(core.lines, 'line')}, written ${years(core)}`}
            title={core.path}
            onMouseEnter={() => setHovered(core)}
            onFocus={() => setHovered(core)}
            onClick={() => onOpen(core)}
          />
        ))}
      </div>
    </div>
  );
}
