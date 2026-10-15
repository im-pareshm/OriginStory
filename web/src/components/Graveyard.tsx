import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { fileName, formatLifespan, lifespanMs, plural } from '../lore';
import { useCountUp } from '../motion';
import type { CommitEvent, Grave, GraveyardData } from '../types';
import { GraveDetail } from './GraveDetail';
import { Tombstone } from './Tombstone';

type SortKey = 'recent' | 'ancient' | 'longest' | 'shortest' | 'largest' | 'name';

const byLife = (g: Grave) => lifespanMs(g) ?? -1;

const SORTS: Record<SortKey, { label: string; compare: (a: Grave, b: Grave) => number }> = {
  recent: { label: 'Most recently departed', compare: (a, b) => b.died.at - a.died.at },
  ancient: { label: 'Longest buried', compare: (a, b) => a.died.at - b.died.at },
  longest: { label: 'Longest lived', compare: (a, b) => byLife(b) - byLife(a) },
  shortest: { label: 'Shortest lived', compare: (a, b) => byLife(a) - byLife(b) },
  largest: { label: 'Largest at death', compare: (a, b) => (b.lines ?? -1) - (a.lines ?? -1) },
  name: { label: 'Name (A–Z)', compare: (a, b) => fileName(a.path).localeCompare(fileName(b.path)) },
};

const PAGE_SIZE = 96;

export function Graveyard({ data }: { data: GraveyardData }) {
  const { repo, graves } = data;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [digger, setDigger] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Grave | null>(null);
  const close = useCallback(() => setSelected(null), []);

  const insights = useMemo(() => findNotables(graves), [graves]);
  const buried = useCountUp(data.totalGraves);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return graves
      .filter((g) => !digger || g.died.author === digger)
      .filter((g) => !q || g.path.toLowerCase().includes(q) || g.formerNames.some((n) => n.toLowerCase().includes(q)))
      .sort(SORTS[sort].compare);
  }, [graves, query, sort, digger]);

  // Start from the first page whenever the filters change.
  const resetPaging = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setLimit(PAGE_SIZE);
  };

  const years =
    repo.firstCommitAt && repo.lastCommitAt
      ? `${new Date(repo.firstCommitAt).getFullYear()}–${new Date(repo.lastCommitAt).getFullYear()}`
      : null;

  return (
    <section className="graveyard">
      <Atmosphere />
      <div className="gate">
        <h2>
          Here lie <span className="tally">{buried.toLocaleString()}</span> {data.totalGraves === 1 ? 'file' : 'files'} of{' '}
          <a href={repo.url} target="_blank" rel="noreferrer">
            {repo.name}
          </a>
        </h2>
        <p className="gate-meta">
          {plural(repo.commitCount, 'commit')} · {plural(repo.contributorCount, 'contributor')} ·{' '}
          {plural(repo.aliveFileCount, 'file')} still alive
          {years && ` · ${years}`}
          {repo.branch && ` · ${repo.branch}`}
        </p>
        {data.truncated && (
          <p className="notice">
            This cemetery is enormous. Showing the {plural(graves.length, 'most recent grave')}.
          </p>
        )}
      </div>

      {graves.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Not a single grave.</p>
          <p>This repository has never deleted a file. Suspiciously tidy.</p>
        </div>
      ) : (
        <>
          <div className="notables">
            {insights.elder && (
              <Notable title="The Elder" onClick={() => setSelected(insights.elder!)}>
                <strong>{fileName(insights.elder.path)}</strong> lived {formatLifespan(lifespanMs(insights.elder))}
              </Notable>
            )}
            {insights.fleeting && (
              <Notable title="Gone Too Soon" onClick={() => setSelected(insights.fleeting!)}>
                <strong>{fileName(insights.fleeting.path)}</strong> lasted {formatLifespan(lifespanMs(insights.fleeting))}
              </Notable>
            )}
            {insights.giant && (
              <Notable title="The Giant" onClick={() => setSelected(insights.giant!)}>
                <strong>{fileName(insights.giant.path)}</strong> took {plural(insights.giant.lines ?? 0, 'line')} with it
              </Notable>
            )}
            {insights.gravedigger && (
              <Notable title="The Gravedigger" onClick={() => resetPaging(setDigger)(insights.gravedigger!.author)}>
                <strong>{insights.gravedigger.author}</strong> deleted {plural(insights.gravedigger.count, 'file')}
              </Notable>
            )}
            {insights.massacre && insights.massacre.count > 1 && (
              <Notable title="The Great Purge">
                {plural(insights.massacre.count, 'file')} fell in one commit: <em>“{insights.massacre.event.message}”</em>
              </Notable>
            )}
          </div>

          <div className="controls">
            <input
              type="search"
              placeholder="Search the headstones…"
              aria-label="Search by file name or path"
              value={query}
              onChange={(e) => resetPaging(setQuery)(e.target.value)}
            />
            <select aria-label="Sort graves" value={sort} onChange={(e) => resetPaging(setSort)(e.target.value as SortKey)}>
              {Object.entries(SORTS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select aria-label="Filter by who deleted the file" value={digger} onChange={(e) => resetPaging(setDigger)(e.target.value)}>
              <option value="">Deleted by anyone</option>
              {insights.diggers.map(({ author, count }) => (
                <option key={author} value={author}>
                  {author} ({count})
                </option>
              ))}
            </select>
          </div>

          {visible.length === 0 ? (
            <p className="empty">No headstone matches that search.</p>
          ) : (
            <>
              <p className="result-count">
                {visible.length === graves.length ? 'Showing all graves' : `${plural(visible.length, 'grave')} found`}
              </p>
              <div className="cemetery">
                {visible.slice(0, limit).map((grave, i) => (
                  <Tombstone key={`${grave.path}@${grave.died.hash}`} grave={grave} index={i % PAGE_SIZE} onOpen={setSelected} />
                ))}
              </div>
              {visible.length > limit && (
                <button type="button" className="dig-deeper" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Dig deeper ({(visible.length - limit).toLocaleString()} more)
                </button>
              )}
            </>
          )}
        </>
      )}

      {selected && <GraveDetail grave={selected} commitUrlBase={repo.commitUrlBase} onClose={close} />}
    </section>
  );
}

// Where the fireflies hover: [left, top, wander duration, delay].
const FIREFLIES = [
  ['8%', '78%', '11s', '0s'],
  ['22%', '88%', '14s', '2.4s'],
  ['37%', '72%', '12s', '5.1s'],
  ['55%', '84%', '16s', '1.2s'],
  ['68%', '70%', '13s', '3.7s'],
  ['81%', '86%', '15s', '6.3s'],
  ['93%', '76%', '12s', '4.4s'],
];

/** Drifting ground fog and a few fireflies over the cemetery. Purely decorative. */
function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <div className="fog">
        <span />
        <span />
      </div>
      <div className="fireflies">
        {FIREFLIES.map(([x, y, d, delay]) => (
          <span key={x} style={{ '--x': x, '--y': y, '--d': d, '--delay': delay } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}

function Notable({ title, children, onClick }: { title: string; children: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="notable-title">{title}</span>
      <span className="notable-body">{children}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="notable" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="notable">{body}</div>
  );
}

function findNotables(graves: Grave[]) {
  let elder: Grave | null = null;
  let fleeting: Grave | null = null;
  let giant: Grave | null = null;
  const diggerCounts = new Map<string, number>();
  const commits = new Map<string, { event: CommitEvent; count: number }>();

  for (const grave of graves) {
    const life = lifespanMs(grave);
    if (life !== null) {
      if (!elder || life > lifespanMs(elder)!) elder = grave;
      if (!fleeting || life < lifespanMs(fleeting)!) fleeting = grave;
    }
    if (grave.lines !== null && grave.lines > (giant?.lines ?? 0)) giant = grave;
    diggerCounts.set(grave.died.author, (diggerCounts.get(grave.died.author) ?? 0) + 1);
    const commit = commits.get(grave.died.hash) ?? { event: grave.died, count: 0 };
    commit.count++;
    commits.set(grave.died.hash, commit);
  }

  const diggers = [...diggerCounts].map(([author, count]) => ({ author, count })).sort((a, b) => b.count - a.count);
  let massacre: { event: CommitEvent; count: number } | null = null;
  for (const commit of commits.values()) if (!massacre || commit.count > massacre.count) massacre = commit;

  return { elder, fleeting, giant, diggers, gravedigger: diggers[0] ?? null, massacre };
}
