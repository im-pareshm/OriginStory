import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraveyard } from '../src/graveyard.ts';
import { normalizeRepoUrl } from '../src/url.ts';
import { createRepo, DAY, lines, START } from './helpers/git-repo.ts';

const repoLink = normalizeRepoUrl('museum/example');

function threeGraves() {
  const repo = createRepo('three-graves', 'trunk');
  repo.write('first.txt', lines(1));
  repo.write('second.txt', lines(2));
  repo.write('third.txt', lines(3));
  repo.write('survivor.txt', lines(1));
  repo.commit('Ada', 'plant everything'); // day 0
  repo.remove('first.txt');
  repo.commit('Ada', 'first goes'); // day 1
  repo.remove('second.txt');
  repo.commit('Grace', 'second goes'); // day 2
  repo.remove('third.txt');
  repo.commit('Linus', 'third goes'); // day 3
  return repo;
}

test('buildGraveyard reports the repo and its graves, newest death first', async () => {
  const repo = threeGraves();
  const data = await buildGraveyard(repoLink, repo.dir);

  assert.deepEqual(data.repo, {
    name: 'museum/example',
    url: 'https://github.com/museum/example',
    host: 'github.com',
    branch: 'trunk',
    head: repo.head(),
    commitUrlBase: 'https://github.com/museum/example/commit/',
    commitCount: 4,
    contributorCount: 3,
    aliveFileCount: 1,
    firstCommitAt: START * 1000,
    lastCommitAt: (START + 3 * DAY) * 1000,
  });
  assert.equal(data.totalGraves, 3);
  assert.equal(data.truncated, false);
  assert.deepEqual(
    data.graves.map((g) => [g.path, g.died.author, g.lines]),
    [
      ['third.txt', 'Linus', 3],
      ['second.txt', 'Grace', 2],
      ['first.txt', 'Ada', 1],
    ],
  );
  assert.equal(typeof data.generatedAt, 'number');
});

test('buildGraveyard keeps only the most recent graves past the limit and says so', async () => {
  const repo = createRepo('over-the-limit');
  for (const name of ['a', 'b', 'c']) repo.write(`${name}.txt`, lines(1));
  repo.commit('Ada', 'plant');
  for (const name of ['a', 'b', 'c']) {
    repo.remove(`${name}.txt`);
    repo.commit('Ada', `remove ${name}`);
  }

  const data = await buildGraveyard(repoLink, repo.dir, { maxGraves: 2 });
  assert.equal(data.totalGraves, 3, 'the total still counts every grave');
  assert.equal(data.truncated, true);
  assert.deepEqual(
    data.graves.map((g) => g.path),
    ['c.txt', 'b.txt'],
  );
});

test('buildGraveyard returns an empty cemetery for a repo that never deleted anything', async () => {
  const repo = createRepo('tidy');
  repo.write('only.txt', lines(1));
  repo.commit('Ada', 'just one file');
  const data = await buildGraveyard(repoLink, repo.dir);
  assert.equal(data.totalGraves, 0);
  assert.deepEqual(data.graves, []);
  assert.equal(data.repo.aliveFileCount, 1);
});
