import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, GitError } from './git.js';
import { UserError } from './url.js';

const MAX_CONCURRENT_DIGS = 2;
const inflight = new Map();

/**
 * Clones a normalized repo into a temp folder, runs `work(gitDir)` on it and deletes the
 * clone. Every request clones fresh; results are not cached between requests (decision,
 * 2026-10-15 — see AGENTS.md). Requests for the same exhibit of the same repo that arrive
 * together share one dig.
 */
export async function dig(repo, exhibit, work, { emptyMessage } = {}) {
  // Cheap check first: fails fast on missing, private or empty repos, before any clone.
  await remoteHead(repo, emptyMessage);

  const key = `${exhibit}:${repo.key}`;
  if (!inflight.has(key)) {
    const job = withDigSlot(() => excavate(repo, work)).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return inflight.get(key);
}

/** What every exhibit says about the repo it was built from. */
export async function repoBasics(repo, gitDir) {
  const [branch, head] = await Promise.all([
    git(['symbolic-ref', '--short', 'HEAD'], { cwd: gitDir }).catch(() => ''),
    git(['rev-parse', 'HEAD'], { cwd: gitDir }),
  ]);
  return {
    name: repo.name,
    url: repo.webUrl,
    host: repo.host,
    branch: branch.trim() || null,
    head: head.trim(),
    commitUrlBase: repo.commitUrlBase,
  };
}

async function remoteHead(repo, emptyMessage = "That repository is empty. There's nothing to exhibit yet.") {
  let output;
  try {
    output = await git(['ls-remote', '--', repo.cloneUrl, 'HEAD'], { timeoutMs: 20_000 });
  } catch (err) {
    throw toUserError(err);
  }
  const hash = output.split('\n').find((line) => line.endsWith('\tHEAD'))?.split('\t')[0];
  if (!hash) throw new UserError(emptyMessage, 404);
  return hash;
}

async function excavate(repo, work) {
  const workdir = await mkdtemp(join(tmpdir(), 'repo-museum-'));
  const gitDir = join(workdir, 'repo.git');
  try {
    // Bare + single branch + no tags: only what the default branch's history needs.
    await git(['clone', '--bare', '--single-branch', '--no-tags', '--quiet', '--', repo.cloneUrl, gitDir], { timeoutMs: 180_000 });
    return await work(gitDir);
  } catch (err) {
    throw toUserError(err);
  } finally {
    await rm(workdir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

function toUserError(err) {
  if (err instanceof UserError) return err;
  if (err instanceof GitError) {
    if (err.timedOut) {
      return new UserError('This repository is too big for the museum to dig up right now. Try a smaller one.', 422);
    }
    const stderr = err.stderr.toLowerCase();
    if (/not found|could not read username|authentication|terminal prompts disabled|403|401|does not appear to be a git repository/.test(stderr)) {
      return new UserError("Couldn't open that repository. Check that it's public and the link is right.", 404);
    }
    if (/could not resolve host|unable to access|failed to connect|timed out/.test(stderr)) {
      return new UserError("Couldn't reach that host. Check the link and try again.", 502);
    }
    if (err.message.startsWith('Could not run git')) return err; // a server problem, not the visitor's
  }
  return err;
}

let activeDigs = 0;
const waiting = [];

/** Caps how many repos are cloned at once so a burst of visitors can't exhaust the machine. */
function withDigSlot(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeDigs++;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeDigs--;
          waiting.shift()?.();
        });
    };
    if (activeDigs < MAX_CONCURRENT_DIGS) run();
    else waiting.push(run);
  });
}
