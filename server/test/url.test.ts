import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileUrl, normalizeRepoUrl, UserError } from '../src/url.ts';

const rejects = (input: unknown) =>
  assert.throws(
    () => normalizeRepoUrl(input),
    (err) => err instanceof UserError && err.status === 400,
    `expected ${JSON.stringify(input)} to be rejected`,
  );

test('normalizeRepoUrl expands owner/repo shorthand to GitHub', () => {
  assert.deepEqual(normalizeRepoUrl('sindresorhus/ky'), {
    cloneUrl: 'https://github.com/sindresorhus/ky',
    webUrl: 'https://github.com/sindresorhus/ky',
    host: 'github.com',
    name: 'sindresorhus/ky',
    key: 'github.com/sindresorhus/ky',
    commitUrlBase: 'https://github.com/sindresorhus/ky/commit/',
  });
});

test('normalizeRepoUrl upgrades http, adds a missing scheme and drops query and hash', () => {
  for (const input of ['http://github.com/a/b', 'github.com/a/b', '  https://github.com/a/b?tab=readme#top  ']) {
    assert.equal(normalizeRepoUrl(input).cloneUrl, 'https://github.com/a/b', input);
  }
});

test('normalizeRepoUrl trims subfolder links and .git on two-segment hosts', () => {
  assert.equal(normalizeRepoUrl('https://github.com/a/b/tree/main/src/lib').cloneUrl, 'https://github.com/a/b');
  assert.equal(normalizeRepoUrl('https://github.com/a/b.git').cloneUrl, 'https://github.com/a/b');
  assert.equal(normalizeRepoUrl('https://codeberg.org/a/b/src/branch/main').cloneUrl, 'https://codeberg.org/a/b');
  assert.equal(normalizeRepoUrl('https://bitbucket.org/a/b/src/main/').cloneUrl, 'https://bitbucket.org/a/b');
});

test('normalizeRepoUrl keys repos case-insensitively but keeps the original case for cloning', () => {
  const repo = normalizeRepoUrl('https://github.com/Owner/Repo');
  assert.equal(repo.cloneUrl, 'https://github.com/Owner/Repo');
  assert.equal(repo.key, 'github.com/owner/repo');
  assert.equal(normalizeRepoUrl('owner/repo').key, repo.key);
});

test('normalizeRepoUrl keeps nested GitLab group paths and the commit link format per host', () => {
  const repo = normalizeRepoUrl('https://gitlab.com/group/sub/project.git');
  assert.equal(repo.cloneUrl, 'https://gitlab.com/group/sub/project.git');
  assert.equal(repo.webUrl, 'https://gitlab.com/group/sub/project');
  assert.equal(repo.name, 'sub/project');
  assert.equal(repo.commitUrlBase, 'https://gitlab.com/group/sub/project/-/commit/');
  assert.equal(normalizeRepoUrl('https://bitbucket.org/a/b').commitUrlBase, 'https://bitbucket.org/a/b/commits/');
  assert.equal(normalizeRepoUrl('https://git.example.org/team/repo').commitUrlBase, null);
});

test('normalizeRepoUrl rejects empty, oversized and malformed input', () => {
  for (const input of [undefined, null, '', '   ', 'x'.repeat(301), 'https://exa mple.com/a/b', 'git@github.com:a/b']) {
    rejects(input);
  }
});

test('normalizeRepoUrl accepts only plain https links that point at a repository', () => {
  rejects('ssh://github.com/a/b');
  rejects('file:///etc/passwd/x');
  rejects('ftp://example.org/a/b');
  rejects('https://user:token@github.com/a/b');
  rejects('https://github.com:8443/a/b');
  rejects('https://github.com/only-owner');
  rejects('https://github.com/');
});

test('normalizeRepoUrl rejects local and private-network hosts', () => {
  for (const host of [
    'localhost',
    'api.localhost',
    'printer.local',
    'db.internal',
    'intranet', // single-label names resolve on the local network
    '127.0.0.1',
    '0.0.0.0',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata endpoint
    '100.64.0.1',
    '[::1]',
    '2130706433', // 127.0.0.1 written as a number; URL parsing normalizes it
    '0x7f.0.0.1',
  ]) {
    rejects(`https://${host}/a/b`);
  }
});

test('normalizeRepoUrl allows public IPv4 hosts just outside the private ranges', () => {
  for (const host of ['172.15.0.1', '172.32.0.1', '100.128.0.1', '8.8.8.8']) {
    assert.equal(normalizeRepoUrl(`https://${host}/a/b`).host, host);
  }
});

test('fileUrl links to one line at a commit, in each host format', () => {
  const sha = 'abc123';
  assert.equal(
    fileUrl(normalizeRepoUrl('a/b'), sha, 'src/my file.js', 7),
    'https://github.com/a/b/blob/abc123/src/my%20file.js#L7',
  );
  assert.equal(
    fileUrl(normalizeRepoUrl('https://gitlab.com/g/p'), sha, 'x.js', 1),
    'https://gitlab.com/g/p/-/blob/abc123/x.js#L1',
  );
  assert.equal(
    fileUrl(normalizeRepoUrl('https://codeberg.org/a/b'), sha, 'x.js', 2),
    'https://codeberg.org/a/b/src/commit/abc123/x.js#L2',
  );
  assert.equal(
    fileUrl(normalizeRepoUrl('https://bitbucket.org/a/b'), sha, 'x.js', 3),
    'https://bitbucket.org/a/b/src/abc123/x.js#lines-3',
  );
  assert.equal(fileUrl(normalizeRepoUrl('https://git.example.org/a/b'), sha, 'x.js', 1), null);
});

test('fileUrl encodes each path segment but keeps the slashes', () => {
  assert.equal(
    fileUrl(normalizeRepoUrl('a/b'), 'c0ffee', 'docs/what#is?this/café.md', 1),
    'https://github.com/a/b/blob/c0ffee/docs/what%23is%3Fthis/caf%C3%A9.md#L1',
  );
});
