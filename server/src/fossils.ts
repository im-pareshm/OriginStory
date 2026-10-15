import type { CommitEvent, Core, Fossil, FossilsData, Layer } from './api-types.ts';
import { type Blame, hashString, isCodeFile, isFossilCandidate, isMeaningful, parseBlame, parseTree } from './blame.ts';
import { dig, repoBasics } from './dig.ts';
import { git } from './git.ts';
import { fileUrl, type NormalizedRepo } from './url.ts';

// Blame is the slow part. A fixed sample keeps big repos to about a minute, and because
// the sample is chosen by path hash, the same repo gives the same answer every visit.
const MAX_FILES = 400;
const BUDGET_MS = 60_000;
const BLAME_TIMEOUT_MS = 20_000;
const CONCURRENT_BLAMES = 4;
const MAX_FOSSILS = 12;
const MAX_FOSSIL_TEXT = 160;

/** Dates every surviving line in a sample of the repo's files with `git blame`. */
export function getFossils(repo: NormalizedRepo): Promise<FossilsData> {
  return dig(repo, 'fossils', (gitDir) => buildFossils(repo, gitDir));
}

/**
 * The fossils exhibit for the clone at `gitDir`. Separate from `getFossils` so tests can
 * run it on a local repo; the options exist only so tests can shrink the limits.
 */
export async function buildFossils(
  repo: NormalizedRepo,
  gitDir: string,
  { maxFiles = MAX_FILES, budgetMs = BUDGET_MS } = {},
): Promise<FossilsData> {
  const [tree, basics] = await Promise.all([
    git(['ls-tree', '-r', '-l', '-z', 'HEAD'], { cwd: gitDir }),
    repoBasics(repo, gitDir),
  ]);
  const tracked = parseTree(tree);
  const eligible = tracked.filter(isFossilCandidate);
  const sample = pickSample(
    eligible.map((entry) => entry.path),
    maxFiles,
  );

  const strata = new Strata();
  const attempted = await blameEach(gitDir, sample, Date.now() + budgetMs, (path, blame) => strata.add(path, blame));

  const cores: Core[] = strata.orderedCores().map(({ oldest, ...core }) => ({
    ...core,
    oldest: oldest && {
      path: core.path,
      line: oldest.line,
      text: oldest.text.trim().slice(0, MAX_FOSSIL_TEXT),
      commit: oldest.commit,
      url: fileUrl(repo, basics.head, core.path, oldest.line),
    },
  }));

  return {
    repo: basics,
    layers: strata.layers(),
    cores,
    fossils: pickFossils(cores.map((core) => core.oldest).filter((fossil) => fossil !== null)),
    sample: {
      blamed: cores.length,
      eligible: eligible.length,
      tracked: tracked.length,
      // Every eligible file was tried (some may still have turned out to be binary).
      complete: sample.length === eligible.length && attempted === sample.length,
    },
    generatedAt: Date.now(),
  };
}

/** Up to `max` paths, chosen by path hash so the same repo always gives the same sample. */
export function pickSample(paths: string[], max = MAX_FILES): string[] {
  return [...paths].sort((a, b) => hashString(a) - hashString(b) || a.localeCompare(b)).slice(0, max);
}

/**
 * The fossils worth showing: code first (config and docs only fill in when a repo has too
 * little code), then oldest first. A line that survives in many files (a license header,
 * "Module dependencies.") shows once.
 */
export function pickFossils(candidates: Fossil[], max = MAX_FOSSILS): Fossil[] {
  const seen = new Set<string>();
  return [...candidates]
    .sort((a, b) => Number(isCodeFile(b.path)) - Number(isCodeFile(a.path)) || a.commit.at - b.commit.at || a.path.localeCompare(b.path))
    .filter((fossil) => !seen.has(fossil.text) && seen.add(fossil.text))
    .slice(0, max);
}

/**
 * Runs blame over `paths` a few at a time, stopping new work once the deadline passes.
 * Resolves with how many paths were attempted.
 */
async function blameEach(gitDir: string, paths: string[], deadline: number, onBlame: (path: string, blame: Blame) => void): Promise<number> {
  let next = 0;
  const worker = async () => {
    while (next < paths.length && Date.now() < deadline) {
      const path = paths[next++]!;
      let output: string;
      try {
        output = await git(['blame', '--porcelain', '-w', 'HEAD', '--', path], { cwd: gitDir, timeoutMs: BLAME_TIMEOUT_MS });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Could not run git')) throw err;
        continue; // one stubborn file shouldn't sink the exhibit
      }
      const blame = parseBlame(output);
      if (blame && blame.lines.length) onBlame(path, blame);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENT_BLAMES }, worker));
  return next;
}

const monthOf = (at: number) => {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** A file's core before its oldest line is trimmed and linked. */
interface RawCore {
  path: string;
  lines: number;
  runs: [year: number, count: number][];
  oldest: { line: number; text: string; commit: CommitEvent } | null;
}

/** Accumulates blamed files into monthly layers and per-file cores as they arrive. */
export class Strata {
  months = new Map<string, { lines: number; authors: Map<string, number> }>(); // keyed 'YYYY-MM'
  cores: RawCore[] = [];

  add(path: string, { commits, lines }: Blame): void {
    const runs: RawCore['runs'] = [];
    let oldest: RawCore['oldest'] = null;
    for (const { sha, line, text } of lines) {
      const commit = commits.get(sha)!; // parseBlame registers every sha a line points at
      const month = monthOf(commit.at);
      let layer = this.months.get(month);
      if (!layer) this.months.set(month, (layer = { lines: 0, authors: new Map() }));
      layer.lines++;
      layer.authors.set(commit.author, (layer.authors.get(commit.author) ?? 0) + 1);

      const year = new Date(commit.at).getUTCFullYear();
      const last = runs.at(-1);
      if (last && last[0] === year) last[1]++;
      else runs.push([year, 1]);

      if (isMeaningful(text) && (!oldest || commit.at < oldest.commit.at)) oldest = { line, text, commit };
    }
    this.cores.push({ path, lines: lines.length, runs, oldest });
  }

  /** Cores by path. Blames finish in any order; sorting keeps every visit's answer the same. */
  orderedCores(): RawCore[] {
    return [...this.cores].sort((a, b) => a.path.localeCompare(b.path));
  }

  layers(): Layer[] {
    return [...this.months]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { lines, authors }]) => ({
        month,
        lines,
        // Ties go by name, not by which file happened to be blamed first.
        authors: [...authors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
      }));
  }
}
