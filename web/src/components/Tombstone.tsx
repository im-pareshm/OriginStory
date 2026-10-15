import type { CSSProperties } from 'react';
import { epitaph, fileName, hashString } from '../lore';
import type { Grave } from '../types';

const SHAPES = ['round', 'arch', 'slab'] as const;

interface Props {
  grave: Grave;
  /** Position within the batch being revealed, used to stagger the stones rising. */
  index: number;
  onOpen: (grave: Grave) => void;
}

export function Tombstone({ grave, index, onOpen }: Props) {
  const hash = hashString(grave.path);
  const shape = SHAPES[hash % SHAPES.length];
  // Bigger files get taller stones, on a log scale so a 10k-line file doesn't dwarf everything.
  const height = Math.round(Math.min(250, 168 + Math.log10((grave.lines ?? 0) + 1) * 20));
  // Old stones settle unevenly; a small fixed lean per grave keeps the rows from looking machine-made.
  const tilt = ((hash >>> 3) % 5) - 2;
  // Each ghost has its own habits: which side it peeks out from.
  const side = ((hash >>> 6) % 3) - 1;
  const bornYear = grave.born ? new Date(grave.born.at).getFullYear() : '?';
  const diedYear = new Date(grave.died.at).getFullYear();

  return (
    <div
      className="plot"
      style={
        {
          '--stone-height': `${height}px`,
          '--tilt': `${tilt * 0.6}deg`,
          '--i': index,
          '--ghost-x': `${side * 26}px`,
          '--ghost-lean': `${side * -6}deg`,
        } as CSSProperties
      }
    >
      <Ghost />
      <button type="button" className={`stone stone-${shape}`} onClick={() => onOpen(grave)} title={grave.path}>
        <span className="stone-rip">R.I.P.</span>
        <span className="stone-name">{fileName(grave.path)}</span>
        <span className="stone-years">{bornYear === diedYear ? diedYear : `${bornYear} – ${diedYear}`}</span>
        <span className="stone-epitaph">{epitaph(grave)}</span>
      </button>
    </div>
  );
}

/** The file's ghost. It waits behind the headstone and rises over it on hover. */
function Ghost() {
  return (
    <span className="ghost" aria-hidden="true">
      <svg viewBox="0 0 60 74" width="60" height="74">
        <path
          className="ghost-body"
          d="M30 3C15 3 6 15 6 30v38c0 2 2 3 4 1.5l5-4 5 4.5c1.4 1.2 3 1.2 4.4 0L30 68l5.6 5c1.4 1.2 3 1.2 4.4 0l5-4.5 5 4c2 1.5 4 .5 4-1.5V30C54 15 45 3 30 3z"
        />
        <path className="ghost-arm" d="M6 38c-4-1-6-5-5-8 2 1 4 3 5 4" />
        <path className="ghost-arm ghost-arm-wave" d="M54 38c4-1 6-5 5-8-2 1-4 3-5 4" />
        <ellipse className="ghost-eye" cx="22" cy="28" rx="3.2" ry="4.4" />
        <ellipse className="ghost-eye" cx="38" cy="28" rx="3.2" ry="4.4" />
        <ellipse className="ghost-mouth" cx="30" cy="40" rx="3.4" ry="4.2" />
        <circle className="ghost-blush" cx="16" cy="35" r="3" />
        <circle className="ghost-blush" cx="44" cy="35" r="3" />
      </svg>
    </span>
  );
}
