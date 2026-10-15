import assert from 'node:assert/strict';
import { test } from 'node:test';
import { git } from '../src/git.ts';
import { LOG_ARGS, parseHistory, unquotePath } from '../src/history.ts';
import { createRepo, DAY, lines, START, type TestRepo } from './helpers/git-repo.ts';

// ---------------------------------------------------------------------------
// Pure parsing, on hand-written `git log` output.
// ---------------------------------------------------------------------------

const commitHeader = (hash: string, author: string, seconds: number, subject: string) => `\x1e${hash}\x1f${author}\x1f${seconds}\x1f${subject}\n\n`;

test('unquotePath decodes the C-style quoting git uses for unusual paths', () => {
  assert.equal(unquotePath('plain/path.js'), 'plain/path.js');
  assert.equal(unquotePath('"tab\\there.txt"'), 'tab\there.txt');
  assert.equal(unquotePath('"say \\"hi\\".txt"'), 'say "hi".txt');
  assert.equal(unquotePath('"back\\\\slash"'), 'back\\slash');
  assert.equal(unquotePath('"caf\\303\\251.md"'), 'café.md'); // octal UTF-8 bytes
});

test('parseHistory returns an empty history for empty input', () => {
  assert.deepEqual(parseHistory(''), {
    graves: [],
    aliveFileCount: 0,
    commitCount: 0,
    contributorCount: 0,
    firstCommitAt: null,
    lastCommitAt: null,
  });
});

test('parseHistory buries a file whose birth it never saw, with an unknown birth', () => {
  const text =
    commitHeader('a'.repeat(40), 'Ada', 100, 'remove ghost') +
    `:100644 000000 ${'1'.repeat(40)} ${'0'.repeat(40)} D\tghost.txt\n` +
    '0\t5\tghost.txt\n';
  const [grave] = parseHistory(text).graves;
  assert.ok(grave);
  assert.equal(grave.path, 'ghost.txt');
  assert.equal(grave.born, null);
  assert.equal(grave.lastWords, null);
  assert.equal(grave.lines, 5);
  assert.equal(grave.died.message, 'remove ghost');
  assert.equal(grave.died.at, 100_000);
});

// ---------------------------------------------------------------------------
// End to end: real throwaway repos, read with the same `git log` the server runs.
// ---------------------------------------------------------------------------

const historyOf = async (repo: TestRepo) => parseHistory(await git(LOG_ARGS, { cwd: repo.dir }));
// Windows forbids quotes in file names; elsewhere a quote forces git to C-quote the path.
const ODD_PATH = process.platform === 'win32' ? 'dir with space/ünï.txt' : 'dir with space/ünï "q".txt';

test('parseHistory follows files through birth, edits, renames, deletion and rebirth', async () => {
  const repo = createRepo('lifecycle');
  repo.write('a.txt', lines(3));
  repo.write('b.txt', lines(2));
  repo.write(ODD_PATH, lines(1));
  repo.write('logo.bin', Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02, 0x00]));
  repo.write('keep.txt', lines(1));
  repo.commit('Ada', 'add the first files'); // day 0

  repo.write('a.txt', lines(4));
  repo.commit('Grace', 'grow a'); // day 1

  repo.run(['mv', 'b.txt', 'c.txt']);
  repo.commit('Grace', 'rename b to c'); // day 2

  repo.remove('c.txt');
  repo.remove('a.txt');
  repo.remove('logo.bin');
  repo.remove(ODD_PATH);
  repo.commit('Ada', 'clear out old files'); // day 3

  repo.write('a.txt', lines(1));
  repo.commit('Ada', 'bring a back'); // day 4

  repo.remove('a.txt');
  repo.commit('Linus', 'remove a again'); // day 5

  const history = await historyOf(repo);
  assert.equal(history.commitCount, 6);
  assert.equal(history.contributorCount, 3);
  assert.equal(history.aliveFileCount, 1); // keep.txt
  assert.equal(history.firstCommitAt, START * 1000);
  assert.equal(history.lastCommitAt, (START + 5 * DAY) * 1000);
  assert.equal(history.graves.length, 5);

  const graveOf = (path: string, lifeNumber = 1) => history.graves.find((g) => g.path === path && g.lifeNumber === lifeNumber);

  const renamed = graveOf('c.txt');
  assert.ok(renamed);
  assert.deepEqual(renamed.formerNames, ['b.txt'], 'a rename carries the life over, not a death and a birth');
  assert.equal(renamed.born?.message, 'add the first files');
  assert.equal(renamed.lastWords?.message, 'rename b to c');
  assert.equal(renamed.died.message, 'clear out old files');
  assert.equal(renamed.lines, 2);
  assert.equal(renamed.touches, 2);
  assert.deepEqual(renamed.authors.sort(), ['Ada', 'Grace']);

  const firstLife = graveOf('a.txt', 1);
  assert.ok(firstLife);
  assert.equal(firstLife.born?.at, START * 1000);
  assert.equal(firstLife.lastWords?.message, 'grow a');
  assert.equal(firstLife.died.at, (START + 3 * DAY) * 1000);
  assert.equal(firstLife.lines, 4, 'lines at death come from the deleting commit');

  const secondLife = graveOf('a.txt', 2);
  assert.ok(secondLife, 'a file re-created at the same path starts life number 2');
  assert.equal(secondLife.born?.message, 'bring a back');
  assert.equal(secondLife.died.author, 'Linus');
  assert.equal(secondLife.lines, 1);

  const binary = graveOf('logo.bin');
  assert.ok(binary);
  assert.equal(binary.binary, true);
  assert.equal(binary.lines, null);

  assert.ok(graveOf(ODD_PATH), 'quoted and non-ASCII paths come back exactly');
});

test('parseHistory buries a file once when two branches both delete it', async () => {
  const repo = createRepo('parallel');
  repo.write('shared.txt', lines(2));
  repo.write('other.txt', lines(1));
  repo.commit('Ada', 'start');

  repo.run(['switch', '-q', '-c', 'side']);
  repo.remove('shared.txt');
  repo.commit('Grace', 'drop shared on side');

  repo.run(['switch', '-q', 'trunk']);
  repo.remove('shared.txt');
  repo.write('other.txt', lines(2));
  repo.commit('Ada', 'drop shared on trunk');

  repo.run(['merge', '-q', '--no-ff', '-m', 'merge side', 'side'], repo.as('Ada', START + 10 * DAY));

  const history = await historyOf(repo);
  assert.equal(history.commitCount, 4);
  assert.deepEqual(
    history.graves.map((g) => g.path),
    ['shared.txt'],
  );
});
