import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { fetchGraveyard } from './api';
import { Graveyard } from './components/Graveyard';
import { Loading } from './components/Loading';
import type { GraveyardData } from './types';

type State =
  | { status: 'idle' }
  | { status: 'loading'; repo: string }
  | { status: 'error'; message: string }
  | { status: 'done'; data: GraveyardData };

const EXAMPLES = ['expressjs/express', 'pallets/flask', 'sindresorhus/ky'];

const repoFromLocation = () => new URLSearchParams(window.location.search).get('repo') ?? '';

export default function App() {
  const [input, setInput] = useState(repoFromLocation);
  const [state, setState] = useState<State>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);

  const visit = useCallback((repo: string, updateUrl: boolean) => {
    const target = repo.trim();
    if (!target) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;

    // Put the repo in the address bar so a graveyard can be shared as a link.
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('repo', target);
      window.history.pushState(null, '', url);
    }
    setInput(target);
    setState({ status: 'loading', repo: target });
    fetchGraveyard(target, controller.signal).then(
      (data) => setState({ status: 'done', data }),
      (err: Error) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: err.message });
      },
    );
  }, []);

  useEffect(() => {
    const fromUrl = () => {
      const repo = repoFromLocation();
      if (repo) return visit(repo, false);
      request.current?.abort();
      setInput('');
      setState({ status: 'idle' });
    };
    fromUrl();
    window.addEventListener('popstate', fromUrl);
    return () => {
      window.removeEventListener('popstate', fromUrl);
      request.current?.abort();
    };
  }, [visit]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    visit(input, true);
  };

  return (
    <div className="night">
      <div className="moon" aria-hidden="true" />
      <div className="shooting-star" aria-hidden="true" />

      <header className="hero">
        <p className="eyebrow">The Repo Museum · Exhibit I</p>
        <h1>The File Graveyard</h1>
        <p className="lede">
          Paste any public Git repository. We'll dig up every file it ever deleted and give each one a proper burial.
        </p>
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
          <button type="submit" disabled={state.status === 'loading' || !input.trim()}>
            Visit the graveyard
          </button>
        </form>
        <p className="examples">
          Try{' '}
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="link-button" onClick={() => visit(example, true)}>
              {example}
            </button>
          ))}
        </p>
      </header>

      <main>
        {state.status === 'loading' && <Loading repo={state.repo} />}
        {state.status === 'error' && (
          <div className="notice error" role="alert">
            {state.message}
          </div>
        )}
        {state.status === 'done' && <Graveyard key={state.data.repo.head} data={state.data} />}
      </main>

      <footer className="footer">Built from git history alone. No files were harmed; they were already dead.</footer>
    </div>
  );
}
