import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headFromLsRemote, toUserError, withDigSlot } from '../src/dig.js';
import { GitError } from '../src/git.js';
import { UserError } from '../src/url.js';

test('headFromLsRemote finds the HEAD hash, or null for an empty repo', () => {
  const hash = 'a'.repeat(40);
  assert.equal(headFromLsRemote(`${hash}\tHEAD\n`), hash);
  assert.equal(headFromLsRemote(''), null);
  assert.equal(headFromLsRemote(`${hash}\trefs/heads/main\n`), null);
});

const gitFailure = (stderr) => new GitError('git clone exited with code 128', { stderr });

test('toUserError explains a missing or private repo as 404', () => {
  for (const stderr of [
    'remote: Repository not found.\nfatal: repository not found',
    "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    'fatal: Authentication failed',
    'fatal: unable to access: The requested URL returned error: 403',
    "fatal: 'x' does not appear to be a git repository",
  ]) {
    const err = toUserError(gitFailure(stderr));
    assert.ok(err instanceof UserError, stderr);
    assert.equal(err.status, 404, stderr);
    assert.match(err.message, /public/);
  }
});

test('toUserError explains an unreachable host as 502', () => {
  for (const stderr of ['fatal: unable to access: Could not resolve host: nope.invalid', 'Failed to connect to example.org port 443']) {
    const err = toUserError(gitFailure(stderr));
    assert.equal(err.status, 502, stderr);
    assert.match(err.message, /reach that host/);
  }
});

test('toUserError explains a timeout or oversized output as 422 "too big"', () => {
  const err = toUserError(new GitError('git log timed out', { timedOut: true }));
  assert.ok(err instanceof UserError);
  assert.equal(err.status, 422);
  assert.match(err.message, /too big/);
});

test('toUserError passes through visitor errors as-is and server problems untouched', () => {
  const visitor = new UserError('already friendly', 404);
  assert.equal(toUserError(visitor), visitor);

  const missingGit = new GitError('Could not run git: spawn git ENOENT');
  assert.equal(toUserError(missingGit), missingGit, 'a missing git binary must become a 500, not blame the visitor');

  const unknownGit = gitFailure('fatal: something nobody planned for');
  assert.equal(toUserError(unknownGit), unknownGit);

  const bug = new TypeError('cannot read properties of undefined');
  assert.equal(toUserError(bug), bug);
});

/** A task whose finish the test controls. */
function controlledTask(log, name) {
  let finish;
  let fail;
  const task = () => {
    log.push(`start ${name}`);
    return new Promise((resolve, reject) => {
      finish = (value) => {
        log.push(`end ${name}`);
        resolve(value);
      };
      fail = (err) => {
        log.push(`fail ${name}`);
        reject(err);
      };
    });
  };
  return { task, finish: (v) => finish(v), fail: (e) => fail(e) };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('withDigSlot runs at most two digs at once and starts the next when one finishes', async () => {
  const log = [];
  const [a, b, c] = ['a', 'b', 'c'].map((name) => controlledTask(log, name));
  const results = [withDigSlot(a.task), withDigSlot(b.task), withDigSlot(c.task)];
  await tick();
  assert.deepEqual(log, ['start a', 'start b'], 'the third dig waits for a free slot');

  a.finish('A');
  await tick();
  assert.deepEqual(log, ['start a', 'start b', 'end a', 'start c']);

  b.finish('B');
  c.finish('C');
  assert.deepEqual(await Promise.all(results), ['A', 'B', 'C']);
});

test('withDigSlot frees the slot when a dig fails, and passes the error on', async () => {
  const log = [];
  const [a, b, c] = ['a', 'b', 'c'].map((name) => controlledTask(log, name));
  const failing = withDigSlot(a.task);
  const others = [withDigSlot(b.task), withDigSlot(c.task)];
  await tick();

  a.fail(new Error('clone failed'));
  await assert.rejects(failing, /clone failed/);
  await tick();
  assert.ok(log.includes('start c'), 'a failed dig still hands its slot to the next one');

  b.finish();
  c.finish();
  await Promise.all(others);
});
