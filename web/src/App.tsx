import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { fetchFossils, fetchGraveyard } from './api';
import { Fossils } from './components/fossils/Fossils';
import { Graveyard } from './components/Graveyard';
import { Loading } from './components/Loading';
import { DEFAULT_EXHIBIT, EXHIBITS, exhibitInfo, parseExhibit, type ExhibitId } from './exhibits';
import type { FossilsData, GraveyardData } from './types';

interface ExhibitData {
  graveyard: GraveyardData;
  fossils: FossilsData;
}

type Result<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; data: T };

/**
 * The repo being viewed and one result per exhibit for it, kept in memory so switching
 * back to an exhibit doesn't dig the repo up again.
 */
type Results = { repo: string } & { [K in ExhibitId]?: Result<ExhibitData[K]> };

const FETCHERS: { [K in ExhibitId]: (repo: string, signal: AbortSignal) => Promise<ExhibitData[K]> } = {
  graveyard: fetchGraveyard,
  fossils: fetchFossils,
};

const EXAMPLES = ['expressjs/express', 'pallets/flask', 'sindresorhus/ky'];

const fromLocation = () => {
  const params = new URLSearchParams(window.location.search);
  return { repo: params.get('repo') ?? '', exhibit: parseExhibit(params.get('exhibit')) };
};

/** The shareable link for a repo in an exhibit. The graveyard stays the default, so old links still work. */
const exhibitHref = (repo: string, exhibit: ExhibitId) => {
  const url = new URL(window.location.href);
  url.search = '';
  if (repo) url.searchParams.set('repo', repo);
  if (exhibit !== DEFAULT_EXHIBIT) url.searchParams.set('exhibit', exhibit);
  return url.toString();
};

export default function App() {
  const [input, setInput] = useState(() => fromLocation().repo);
  const [exhibit, setExhibit] = useState<ExhibitId>(() => fromLocation().exhibit);
  const [results, setResultsState] = useState<Results>({ repo: '' });
  // Mirrors `results` synchronously, so two calls to `show` before a render see each other.
  const resultsRef = useRef(results);
  const setResults = (next: Results) => setResultsState((resultsRef.current = next));
  const requests = useRef<Partial<Record<ExhibitId, AbortController>>>({});

  const abortAll = () => {
    Object.values(requests.current).forEach((c) => c?.abort());
    requests.current = {};
  };

  const show = useCallback((repo: string, target: ExhibitId, updateUrl: boolean) => {
    const trimmed = repo.trim();
    if (updateUrl) window.history.pushState(null, '', exhibitHref(trimmed, target));
    setExhibit(target);
    setInput(trimmed);

    // A different repo makes every exhibit's result stale.
    let current = resultsRef.current;
    if (current.repo !== trimmed) {
      abortAll();
      current = { repo: trimmed };
      setResults(current);
    }
    const existing = current[target];
    if (!trimmed || (existing && existing.status !== 'error')) return;

    const controller = new AbortController();
    requests.current[target] = controller;
    const put = (result: Result<ExhibitData[ExhibitId]>) => {
      if (resultsRef.current.repo === trimmed) setResults({ ...resultsRef.current, [target]: result });
    };
    put({ status: 'loading' });
    FETCHERS[target](trimmed, controller.signal).then(
      (data) => put({ status: 'done', data }),
      (err: Error) => {
        if (!controller.signal.aborted) put({ status: 'error', message: err.message });
      },
    );
  }, []); // setResults and abortAll only touch refs and a state setter, so nothing goes stale

  useEffect(() => {
    const sync = () => {
      const { repo, exhibit: target } = fromLocation();
      show(repo, target, false);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      // Aborted requests leave "loading" results behind; forget them so a remount fetches again.
      abortAll();
      resultsRef.current = { repo: '' };
    };
  }, [show]);

  const info = exhibitInfo(exhibit);
  const result = results[exhibit];
  const repo = results.repo;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    show(input, exhibit, true);
  };

  const onNav = (event: MouseEvent, target: ExhibitId) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; // let new tabs open
    event.preventDefault();
    if (target !== exhibit) show(repo, target, true);
  };

  return (
    <div className={`night ${exhibit === 'fossils' ? 'underground' : ''}`}>
      <div className="moon" aria-hidden="true" />
      <div className="shooting-star" aria-hidden="true" />

      <header className="hero">
        <nav className="exhibit-nav" aria-label="Exhibits">
          {EXHIBITS.map((e) => (
            <a
              key={e.id}
              href={exhibitHref(repo, e.id)}
              aria-current={e.id === exhibit ? 'page' : undefined}
              onClick={(event) => onNav(event, e.id)}
            >
              <span className="exhibit-numeral">{e.numeral}</span> {e.title}
            </a>
          ))}
        </nav>
        <p className="eyebrow">The Repo Museum · Exhibit {info.numeral}</p>
        <h1>{info.title}</h1>
        <p className="lede">{info.lede}</p>
        <form className="dig-form" onSubmit={onSubmit}>
          <input
            type="text"
            aria-label="Repository link"
            placeholder="github.com/owner/repo"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={result?.status === 'loading' || !input.trim()}>
            {info.action}
          </button>
        </form>
        <p className="examples">
          Try{' '}
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="link-button" onClick={() => show(example, exhibit, true)}>
              {example}
            </button>
          ))}
        </p>
      </header>

      <main>
        {result?.status === 'loading' && <Loading repo={repo} lines={info.loadingLines} />}
        {result?.status === 'error' && (
          <div className="notice error" role="alert">
            {result.message}
          </div>
        )}
        {result?.status === 'done' && exhibit === 'graveyard' && (
          <Graveyard key={result.data.repo.head} data={result.data as GraveyardData} />
        )}
        {result?.status === 'done' && exhibit === 'fossils' && (
          <Fossils key={result.data.repo.head} data={result.data as FossilsData} />
        )}
      </main>

      <footer className="footer">Built from git history alone. No files were harmed; they were already dead.</footer>
    </div>
  );
}
