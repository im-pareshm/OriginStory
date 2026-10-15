import type { FossilsData, GraveyardData } from './types';

async function fetchExhibit<T>(endpoint: string, repo: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${endpoint}?repo=${encodeURIComponent(repo)}`, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error("Couldn't reach the museum's server. Is it running?");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The museum is closed right now (error ${res.status}).`);
  return body as T;
}

export const fetchGraveyard = (repo: string, signal?: AbortSignal) => fetchExhibit<GraveyardData>('graveyard', repo, signal);

export const fetchFossils = (repo: string, signal?: AbortSignal) => fetchExhibit<FossilsData>('fossils', repo, signal);
