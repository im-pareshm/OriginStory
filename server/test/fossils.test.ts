import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CommitEvent, Fossil } from '../src/api-types.ts';
import { type Blame, hashString } from '../src/blame.ts';
import { buildFossils, pickFossils, pickSample, Strata } from '../src/fossils.ts';
import { normalizeRepoUrl } from '../src/url.ts';
import { createRepo, type TestRepo } from './helpers/git-repo.ts';

const seconds = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------

test('pickSample takes the same paths whatever order they arrive in, up to the limit', () => {
  const paths = Array.from({ length: 50 }, (_, i) => `src/file-${i}.js`);
  const sample = pickSample(paths, 10);
  assert.equal(sample.length, 10);
  assert.deepEqual(pickSample([...paths].reverse(), 10), sample);
  const byHash = [...paths].sort((a, b) => hashString(a) - hashString(b));
  assert.deepEqual(sample, byHash.slice(0, 10), 'chosen by path hash, so not just the alphabetically first');
  assert.deepEqual(pickSample(['b', 'a'], 10).sort(), ['a', 'b'], 'small repos are taken whole');
});

const commitAt = (author: string, at: number): CommitEvent => ({ hash: `${author}-${at}`, author, at, message: 'm' });

const fossil = (path: string, year: number, text = `${path} line`): Fossil => ({
  path,
  line: 1,
  text,
  commit: commitAt('Ada', Date.UTC(year, 0, 1)),
  url: null,
});

test('pickFossils puts code before config and docs, then oldest first', () => {
  const picked = pickFossils([
    fossil('README.md', 2010),
    fossil('src/new.js', 2020),
    fossil('package.json', 2011),
    fossil('src/old.js', 2015),
  ]);
  assert.deepEqual(
    picked.map((f) => f.path),
    ['src/old.js', 'src/new.js', 'README.md', 'package.json'],
  );
});

test('pickFossils shows a line that survives in many files once, and stops at the limit', () => {
  const header = '// Copyright (c) The Authors';
  const picked = pickFossils([fossil('a.js', 2012, header), fossil('b.js', 2010, header), fossil('c.js', 2014)]);
  assert.deepEqual(
    picked.map((f) => f.path),
    ['b.js', 'c.js'],
    'the oldest copy of the shared line is kept',
  );
  assert.equal(pickFossils(Array.from({ length: 20 }, (_, i) => fossil(`f${i}.js`, 2000 + i)), 5).length, 5);
});

type BlameEntry = [author: string, at: number, text: string];

/** A parsed blame, in the shape parseBlame returns. */
function blame(entries: BlameEntry[]): Blame {
  const commits = new Map<string, CommitEvent>();
  const lines = entries.map(([author, at, text], i) => {
    const commit = commitAt(author, at);
    commits.set(commit.hash, commit);
    return { sha: commit.hash, line: i + 1, text };
  });
  return { commits, lines };
}

/** The only core of a Strata that was given one file. */
function onlyCore(strata: Strata) {
  const [core] = strata.orderedCores();
  assert.ok(core);
  return core;
}

test('Strata groups lines into UTC months and per-file runs of years', () => {
  const strata = new Strata();
  strata.add(
    'a.js',
    blame([
      ['Ada', Date.UTC(2019, 0, 31, 23, 30), 'const first = 1;'], // last half hour of January, UTC
      ['Ada', Date.UTC(2019, 1, 1, 0, 30), 'const second = 2;'],
      ['Grace', Date.UTC(2021, 5, 1), 'const third = 3;'],
      ['Ada', Date.UTC(2019, 1, 2), '}'],
    ]),
  );

  assert.deepEqual(strata.layers(), [
    { month: '2019-01', lines: 1, authors: [['Ada', 1]] },
    { month: '2019-02', lines: 2, authors: [['Ada', 2]] },
    { month: '2021-06', lines: 1, authors: [['Grace', 1]] },
  ]);
  const core = onlyCore(strata);
  assert.equal(core.lines, 4);
  assert.deepEqual(core.runs, [
    [2019, 2],
    [2021, 1],
    [2019, 1],
  ]);
  assert.equal(core.oldest?.text, 'const first = 1;');
});

test('Strata never picks a punctuation-only line as the oldest fossil', () => {
  const strata = new Strata();
  strata.add(
    'b.js',
    blame([
      ['Ada', Date.UTC(2010, 0, 1), '}'],
      ['Ada', Date.UTC(2015, 0, 1), 'return value;'],
    ]),
  );
  assert.equal(onlyCore(strata).oldest?.text, 'return value;');

  const onlyBraces = new Strata();
  onlyBraces.add('c.js', blame([['Ada', Date.UTC(2010, 0, 1), '});']]));
  assert.equal(onlyCore(onlyBraces).oldest, null);
});

test('Strata gives the same answer whatever order the blames finish in', () => {
  const at = Date.UTC(2020, 2, 1);
  const files: [path: string, blame: Blame][] = [
    ['z.js', blame([['Zoe', at, 'zeta']])],
    ['a.js', blame([['Ann', at, 'alpha']])],
    ['m.js', blame([['Max', at, 'mu mu']])],
  ];
  const forwards = new Strata();
  const backwards = new Strata();
  for (const [path, b] of files) forwards.add(path, b);
  for (const [path, b] of [...files].reverse()) backwards.add(path, b);

  assert.deepEqual(forwards.layers(), backwards.layers());
  assert.deepEqual(forwards.layers()[0]?.authors, [
    ['Ann', 1],
    ['Max', 1],
    ['Zoe', 1],
  ]);
  assert.deepEqual(
    forwards.orderedCores().map((c) => c.path),
    ['a.js', 'm.js', 'z.js'],
  );
  assert.deepEqual(forwards.orderedCores(), backwards.orderedCores());
});

test('Strata keeps the top five authors of a month, most lines first', () => {
  const at = Date.UTC(2020, 0, 1);
  const strata = new Strata();
  const entries: BlameEntry[] = [];
  const counts: [name: string, count: number][] = [['A', 6], ['B', 5], ['C', 4], ['D', 3], ['E', 2], ['F', 1]];
  for (const [name, count] of counts) {
    for (let i = 0; i < count; i++) entries.push([name, at, `line by ${name}`]);
  }
  strata.add('x.js', blame(entries));
  assert.deepEqual(
    strata.layers()[0]?.authors.map(([name]) => name),
    ['A', 'B', 'C', 'D', 'E'],
  );
});

// ---------------------------------------------------------------------------
// End to end on a real repo
// ---------------------------------------------------------------------------

const repoLink = normalizeRepoUrl('museum/example');

function digSite(name: string): TestRepo {
  const repo = createRepo(name);
  repo.write('src/old.js', 'const ancient = 1;\nfunction keep() {\n  return ancient;\n}\n');
  repo.write('README.md', '# Example project\n');
  repo.write('package-lock.json', '{}\n');
  repo.write('data.txt', Buffer.from('looks like text\0but is not\n'));
  repo.commit('Ada', 'start', seconds(2019, 3, 10));

  repo.write('src/new.js', 'export const modern = true;\n');
  repo.write('src/old.js', 'const ancient = 1;\nfunction keep() {\n  return ancient;\n}\nconst added = 2;\n');
  repo.commit('Grace', 'more', seconds(2023, 6, 20));
  return repo;
}

test('buildFossils dates every line of the eligible files and finds the fossils', async () => {
  const repo = digSite('dig-site');
  const data = await buildFossils(repoLink, repo.dir);

  assert.equal(data.repo.head, repo.head());
  assert.deepEqual(data.sample, { blamed: 3, eligible: 4, tracked: 5, complete: true }, 'the lockfile is skipped; the binary .txt is tried but has no lines to date');
  assert.deepEqual(
    data.layers.map((l) => [l.month, l.lines]),
    [
      ['2019-03', 5],
      ['2023-06', 2],
    ],
  );
  assert.deepEqual(
    data.cores.map((c) => [c.path, c.runs]),
    [
      ['README.md', [[2019, 1]]],
      ['src/new.js', [[2023, 1]]],
      ['src/old.js', [[2019, 4], [2023, 1]]],
    ],
  );
  assert.deepEqual(
    data.fossils.map((f) => [f.path, f.line, f.text]),
    [
      ['src/old.js', 1, 'const ancient = 1;'],
      ['src/new.js', 1, 'export const modern = true;'],
      ['README.md', 1, '# Example project'],
    ],
  );
  assert.equal(data.fossils[0]?.url, `https://github.com/museum/example/blob/${repo.head()}/src/old.js#L1`);
  assert.equal(data.fossils[0]?.commit.author, 'Ada');
});

test('buildFossils marks the sample incomplete when the file limit or time budget cuts it short', async () => {
  const repo = digSite('dig-site-limits');

  const limited = await buildFossils(repoLink, repo.dir, { maxFiles: 1 });
  assert.equal(limited.sample.eligible, 4);
  assert.equal(limited.sample.complete, false);
  assert.ok(limited.sample.blamed <= 1);

  const outOfTime = await buildFossils(repoLink, repo.dir, { budgetMs: 0 });
  assert.equal(outOfTime.sample.blamed, 0);
  assert.equal(outOfTime.sample.complete, false);
  assert.deepEqual(outOfTime.layers, []);
});
