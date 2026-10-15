import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { git, GitError } from '../src/git.js';
import { createRepo, lines, scratchDir } from './helpers/git-repo.js';

test('git resolves with stdout', async () => {
  assert.match(await git(['--version']), /^git version \d/);
});

test('git rejects with a GitError carrying stderr when git exits non-zero', async () => {
  await assert.rejects(git(['rev-parse', '--verify', 'no-such-ref'], { cwd: createRepo('exit-code').dir }), (err) => {
    assert.ok(err instanceof GitError);
    assert.equal(err.timedOut, false);
    assert.match(err.message, /exited with code/);
    assert.match(err.stderr, /no-such-ref|Needed a single revision/);
    return true;
  });
});

test('git kills a command that runs past its timeout', async () => {
  // `cat-file --batch` waits for requests on stdin, which stays open, so it never ends by itself.
  const started = Date.now();
  await assert.rejects(git(['cat-file', '--batch'], { cwd: createRepo('timeout').dir, timeoutMs: 200 }), (err) => {
    assert.ok(err instanceof GitError);
    assert.equal(err.timedOut, true);
    assert.match(err.message, /timed out/);
    return true;
  });
  assert.ok(Date.now() - started < 10_000, 'the timeout kills git promptly');
});

test('git kills a command whose output passes the size cap', async () => {
  await assert.rejects(git(['--version'], { maxBytes: 3 }), (err) => {
    assert.ok(err instanceof GitError);
    assert.equal(err.timedOut, true, 'reported like a timeout, so visitors get the "too big" message');
    assert.match(err.message, /too much output/);
    return true;
  });
});

test('git refuses every transport except https, so a pasted link cannot reach local files', async () => {
  const target = createRepo('local-target');
  target.write('secret.txt', lines(1));
  target.commit('Ada', 'secret');

  for (const url of [pathToFileURL(target.dir).href, target.dir]) {
    await assert.rejects(git(['ls-remote', '--', url, 'HEAD']), (err) => {
      assert.ok(err instanceof GitError);
      assert.match(err.stderr, /transport '?file'? not allowed/i, `expected ${url} to be blocked`);
      return true;
    });
  }
  await assert.rejects(git(['ls-remote', '--', 'ext::sh -c touch% pwned', 'HEAD']), /exited with code/);
});

test('git reports a missing git binary as "Could not run git", which is a server problem', () => {
  // git.js copies the environment when it loads, so run it in a separate Node process whose
  // PATH has no git. (A second copy of the module in this process would also corrupt the
  // coverage report for git.js.)
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH'));
  env.PATH = scratchDir();
  const script = `
    const { git, GitError } = await import(${JSON.stringify(new URL('../src/git.js', import.meta.url).href)});
    try { await git(['--version']); console.log('resolved'); }
    catch (err) { console.log(JSON.stringify({ isGitError: err instanceof GitError, message: err.message })); }`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.isGitError, true);
  assert.match(result.message, /^Could not run git/);
});
