import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RepoBasics } from './api-types.ts';
import { git, GitError } from './git.ts';
import { type NormalizedRepo, UserError } from './url.ts';

const MAX_CONCURRENT_DIGS = 2;
const inflight = new Map<string, Promise<unknown>>();

/**
 * Clones a normalized repo into a temp folder, runs `work(gitDir)` on it and deletes the
 * clone. Every request clones fresh; results are not cached between requests (decision,
 * 2026-10-15 — see AGENTS.md). Requests for the same exhibit of the same repo that arrive
 * together share one dig.
 */
export async function dig<T>(
  repo: NormalizedRepo,
  exhibit: string,
  work: (gitDir: string) => Promise<T>,
  { emptyMessage }: { emptyMessage?: string } = {},
): Promise<T> {
  // Cheap check first: fails fast on missing, private or empty repos, before any clone.
  await remoteHead(repo, emptyMessage);

  const key = `${exhibit}:${repo.key}`;
  let job = inflight.get(key) as Promise<T> | undefined;
  if (!job) {
    job = withDigSlot(() => excavate(repo, work)).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

/** What every exhibit says about the repo it was built from. */
export async function repoBasics(repo: NormalizedRepo, gitDir: string): Promise<RepoBasics> {
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

async function remoteHead(repo: NormalizedRepo, emptyMessage = "That repository is empty. There's nothing to exhibit yet."): Promise<string> {
  let output: string;
  try {
    output = await git(['ls-remote', '--', repo.cloneUrl, 'HEAD'], { timeoutMs: 20_000 });
  } catch (err) {
    throw toUserError(err);
  }
  const hash = headFromLsRemote(output);
  if (!hash) throw new UserError(emptyMessage, 404);
  return hash;
}

/** The commit hash `git ls-remote <url> HEAD` reports for HEAD, or null for an empty repo. */
export function headFromLsRemote(output: string): string | null {
  return output.split('\n').find((line) => line.endsWith('\tHEAD'))?.split('\t')[0] ?? null;
}

async function excavate<T>(repo: NormalizedRepo, work: (gitDir: string) => Promise<T>): Promise<T> {
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

/** Turns git failures into messages a visitor can act on; anything else passes through as a 500. */
export function toUserError(err: unknown): unknown {
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
const waiting: (() => void)[] = [];

/** Caps how many repos are cloned at once so a burst of visitors can't exhaust the machine. */
export function withDigSlot<T>(task: () => Promise<T>): Promise<T> {
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
