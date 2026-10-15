import { dig, repoBasics } from './dig.js';
import { git } from './git.js';
import { LOG_ARGS, parseHistory } from './history.js';

const MAX_GRAVES = 5000;

/** Digs up the graveyard for a normalized repo: one `git log` pass over a fresh clone. */
export function getGraveyard(repo) {
  return dig(
    repo,
    'graveyard',
    async (gitDir) => {
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
        truncated: graves.length > MAX_GRAVES,
        graves: graves.slice(0, MAX_GRAVES),
        generatedAt: Date.now(),
      };
    },
    { emptyMessage: 'That repository is empty. Nothing has lived here yet, so nothing has died.' },
  );
}
