// Builds small, real git repos in the OS temp dir for tests, with fixed authors and dates.
// Everything is deleted when the test file finishes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after } from 'node:test';

export const DAY = 86_400;
/** 2023-11-14T22:13:20Z: the first commit's time, so timestamps are easy to assert. */
export const START = 1_700_000_000;

// Created when a test file imports this module, so `after` registers at file level and the
// folder outlives every test in the file (registered inside a test, it would go after that one).
const scratch = mkdtempSync(join(tmpdir(), 'repo-museum-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** The temp folder for this test file; removed after its last test. */
export const scratchDir = () => scratch;

/** Text with `n` numbered lines. */
export const lines = (n, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join('\n') + '\n';

const identity = (author) => ({
  name: author,
  email: `${author.toLowerCase().replace(/\s+/g, '.')}@example.invalid`,
});

/**
 * A repo on branch `branch` where each commit is one day after the previous one, unless
 * `commit()` is given an explicit time.
 */
export function createRepo(name, branch = 'trunk') {
  const dir = join(scratchDir(), name);
  mkdirSync(dir);
  let day = 0;
  const run = (args, env = {}) =>
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
  run(['init', '-q', '-b', branch]);

  /** Env vars that make the next git command author and commit as `author` at `seconds`. */
  const as = (author, seconds) => {
    const who = identity(author);
    const when = `@${seconds} +0000`;
    return {
      GIT_AUTHOR_NAME: who.name,
      GIT_AUTHOR_EMAIL: who.email,
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_NAME: who.name,
      GIT_COMMITTER_EMAIL: who.email,
      GIT_COMMITTER_DATE: when,
    };
  };

  return {
    dir,
    run,
    as,
    write(path, content) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    },
    remove(path) {
      unlinkSync(join(dir, path));
    },
    /** Commits everything as `author`, one day after the previous commit unless `at` (seconds) is given. */
    commit(author, message, at = START + day++ * DAY) {
      run(['add', '-A']);
      run(['commit', '-q', '--allow-empty', '-m', message], as(author, at));
    },
    head() {
      return run(['rev-parse', 'HEAD']).trim();
    },
  };
}
