import type { GraveyardData } from './api-types.ts';
import { dig, repoBasics } from './dig.ts';
import { git } from './git.ts';
import { LOG_ARGS, parseHistory } from './history.ts';
import type { NormalizedRepo } from './url.ts';

const MAX_GRAVES = 5000;

/** Digs up the graveyard for a normalized repo: one `git log` pass over a fresh clone. */
export function getGraveyard(repo: NormalizedRepo): Promise<GraveyardData> {
  return dig(repo, 'graveyard', (gitDir) => buildGraveyard(repo, gitDir), {
    emptyMessage: 'That repository is empty. Nothing has lived here yet, so nothing has died.',
  });
}

/** The graveyard for the clone at `gitDir`. Separate from `getGraveyard` so tests can run it on a local repo. */
export async function buildGraveyard(repo: NormalizedRepo, gitDir: string, { maxGraves = MAX_GRAVES } = {}): Promise<GraveyardData> {
  const [log, basics] = await Promise.all([git(LOG_ARGS, { cwd: gitDir, timeoutMs: 180_000 }), repoBasics(repo, gitDir)]);
  const history = parseHistory(log);
  const graves = history.graves.sort((a, b) => b.died.at - a.died.at);

  return {
    repo: {
      ...basics,
      commitCount: history.commitCount,
      contributorCount: history.contributorCount,
      aliveFileCount: history.aliveFileCount,
      firstCommitAt: history.firstCommitAt,
      lastCommitAt: history.lastCommitAt,
    },
    totalGraves: graves.length,
    truncated: graves.length > maxGraves,
    graves: graves.slice(0, maxGraves),
    generatedAt: Date.now(),
  };
}
