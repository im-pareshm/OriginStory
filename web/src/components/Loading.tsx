import { useEffect, useState } from 'react';
import { LOADING_LINES } from '../lore';

export function Loading({ repo }: { repo: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [repo]);

  const line = LOADING_LINES[Math.min(Math.floor(seconds / 3), LOADING_LINES.length - 1)];

  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="lantern" aria-hidden="true" />
      <p className="loading-line">{line}</p>
      <p className="loading-meta">
        Excavating <strong>{repo}</strong> · {seconds}s
        {seconds >= 20 && ' · big repos take a while the first time'}
      </p>
    </div>
  );
}
