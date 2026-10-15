import type { GraveyardData } from './types';

export async function fetchGraveyard(repo: string, signal?: AbortSignal): Promise<GraveyardData> {
  let res: Response;
  try {
    res = await fetch(`/api/graveyard?repo=${encodeURIComponent(repo)}`, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error("Couldn't reach the museum's server. Is it running?");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The museum is closed right now (error ${res.status}).`);
  return body as GraveyardData;
}
