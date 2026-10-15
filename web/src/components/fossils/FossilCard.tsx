import type { CSSProperties } from 'react';
import { formatDate, formatLifespan } from '../../lore';
import { ageColor } from '../../strata';
import type { Fossil } from '../../types';

interface Props {
  fossil: Fossil;
  range: [number, number];
  now: number;
  commitUrlBase: string | null;
  /** Position in the case, used to stagger the entrance. */
  index?: number;
}

/** One surviving line, shown like a find in a museum case. */
export function FossilCard({ fossil, range, now, commitUrlBase, index = 0 }: Props) {
  const { commit } = fossil;
  const where = `${fossil.path}:${fossil.line}`;
  return (
    <article className="fossil" style={{ '--age': ageColor(commit.at, range), '--i': index } as CSSProperties}>
      <Ammonite />
      <p className="fossil-age">Written {formatLifespan(now - commit.at)} ago</p>
      <pre className="fossil-line">
        <code>{fossil.text}</code>
      </pre>
      <p className="fossil-where">
        {fossil.url ? (
          <a href={fossil.url} target="_blank" rel="noreferrer">
            {where}
          </a>
        ) : (
          where
        )}
      </p>
      <p className="fossil-meta">
        {commit.author} · {formatDate(commit.at)}
        {commit.message && (
          <>
            {' · '}
            {commitUrlBase ? (
              <a href={commitUrlBase + commit.hash} target="_blank" rel="noreferrer">
                “{commit.message}”
              </a>
            ) : (
              `“${commit.message}”`
            )}
          </>
        )}
      </p>
    </article>
  );
}

function Ammonite() {
  return (
    <svg className="ammonite" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <path d="M16 29a13 13 0 1 1 13-13c0 6-5 10.5-10.5 10.5S8 22 8 16.5 12 8 16.5 8 23 11.5 23 16s-3 6-6.5 6S11 19.5 11 16.5 13.5 12 16 12s4 1.8 4 4-1.5 3-3.5 3" />
      <path d="M16 3v4M24.5 6.5l-2.5 3M29 16h-4M5.5 7.5l3 2.5M3 16h4" />
    </svg>
  );
}
