import { hashString, isCodeFile, isFossilCandidate, isMeaningful, parseBlame, parseTree } from './blame.js';
import { dig, repoBasics } from './dig.js';
import { git } from './git.js';
import { fileUrl } from './url.js';

// Blame is the slow part. A fixed sample keeps big repos to about a minute, and because
// the sample is chosen by path hash, the same repo gives the same answer every visit.
const MAX_FILES = 400;
const BUDGET_MS = 60_000;
const BLAME_TIMEOUT_MS = 20_000;
const CONCURRENT_BLAMES = 4;
const MAX_FOSSILS = 12;
const MAX_FOSSIL_TEXT = 160;

/** Dates every surviving line in a sample of the repo's files with `git blame`. */
export function getFossils(repo) {
  return dig(repo, 'fossils', async (gitDir) => {
    const [tree, basics] = await Promise.all([
      git(['ls-tree', '-r', '-l', '-z', 'HEAD'], { cwd: gitDir }),
      repoBasics(repo, gitDir),
    ]);
    const tracked = parseTree(tree);
    const eligible = tracked.filter(isFossilCandidate);
    const sample = eligible
      .map((entry) => entry.path)
      .sort((a, b) => hashString(a) - hashString(b) || a.localeCompare(b))
      .slice(0, MAX_FILES);

    const strata = new Strata();
    const attempted = await blameEach(gitDir, sample, Date.now() + BUDGET_MS, (path, blame) => strata.add(path, blame));

    const cores = strata.cores.map(({ oldest, ...core }) => ({
      ...core,
      oldest: oldest && {
        path: core.path,
        line: oldest.line,
        text: oldest.text.trim().slice(0, MAX_FOSSIL_TEXT),
        commit: oldest.commit,
        url: fileUrl(repo, basics.head, core.path, oldest.line),
      },
    }));
    // Code first; config and docs only fill in when a repo has too little code to fill the case.
    // A line that survives in many files (a license header, "Module dependencies.") shows once.
    const seen = new Set();
    const fossils = cores
      .map((core) => core.oldest)
      .filter(Boolean)
      .sort((a, b) => isCodeFile(b.path) - isCodeFile(a.path) || a.commit.at - b.commit.at || a.path.localeCompare(b.path))
      .filter((fossil) => !seen.has(fossil.text) && seen.add(fossil.text))
      .slice(0, MAX_FOSSILS);

    return {
      repo: basics,
      layers: strata.layers(),
      cores,
      fossils,
      sample: {
        blamed: cores.length,
        eligible: eligible.length,
        tracked: tracked.length,
        // Every eligible file was tried (some may still have turned out to be binary).
        complete: sample.length === eligible.length && attempted === sample.length,
      },
      generatedAt: Date.now(),
    };
  });
}

/**
 * Runs blame over `paths` a few at a time, stopping new work once the deadline passes.
 * Resolves with how many paths were attempted.
 */
async function blameEach(gitDir, paths, deadline, onBlame) {
  let next = 0;
  const worker = async () => {
    while (next < paths.length && Date.now() < deadline) {
      const path = paths[next++];
      let output;
      try {
        output = await git(['blame', '--porcelain', '-w', 'HEAD', '--', path], { cwd: gitDir, timeoutMs: BLAME_TIMEOUT_MS });
      } catch (err) {
        if (err.message.startsWith('Could not run git')) throw err;
        continue; // one stubborn file shouldn't sink the exhibit
      }
      const blame = parseBlame(output);
      if (blame && blame.lines.length) onBlame(path, blame);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENT_BLAMES }, worker));
  return next;
}

const monthOf = (at) => {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Accumulates blamed files into monthly layers and per-file cores as they arrive. */
class Strata {
  months = new Map(); // 'YYYY-MM' -> { lines, authors: Map<name, lines> }
  cores = [];

  add(path, { commits, lines }) {
    const runs = [];
    let oldest = null;
    for (const { sha, line, text } of lines) {
      const commit = commits.get(sha);
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

  layers() {
    return [...this.months]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { lines, authors }]) => ({
        month,
        lines,
        authors: [...authors].sort((a, b) => b[1] - a[1]).slice(0, 5),
      }));
  }
}
