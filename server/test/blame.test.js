import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCodeFile, isFossilCandidate, isMeaningful, parseBlame, parseTree } from '../src/blame.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

const header = (author, seconds, summary) =>
  [`author ${author}`, `author-mail <${author}@x>`, `author-time ${seconds}`, 'author-tz +0000', `summary ${summary}`, 'filename f.js'];

test('parseBlame reads commit details once and reuses them for later lines', () => {
  const text = [
    `${A} 1 1 2`,
    ...header('Ada', 1_000_000_000, 'first'),
    '\tconst answer = 42;',
    `${A} 2 2`,
    '\t}',
    `${B} 3 3 1`,
    ...header('Grace', 1_600_000_000, 'second'),
    '\tmodule.exports = answer;',
    `${A} 4 4 1`,
    'filename f.js',
    '\t// tail',
    '',
  ].join('\n');

  const { commits, lines } = parseBlame(text);
  assert.equal(commits.size, 2);
  assert.deepEqual(commits.get(A), { hash: A, author: 'Ada', at: 1_000_000_000_000, message: 'first' });
  assert.deepEqual(
    lines.map(({ sha, line, text }) => [sha, line, text]),
    [
      [A, 1, 'const answer = 42;'],
      [A, 2, '}'],
      [B, 3, 'module.exports = answer;'],
      [A, 4, '// tail'],
    ],
  );
});

test('parseBlame keeps tabs inside line content and sorts by final line', () => {
  const text = [`${B} 1 2 1`, ...header('Grace', 1, 's'), '\t\tindented', `${A} 1 1 1`, ...header('Ada', 2, 't'), '\ttop', ''].join('\n');
  assert.deepEqual(
    parseBlame(text).lines.map((l) => l.text),
    ['top', '\tindented'],
  );
});

test('parseBlame rejects binary content', () => {
  assert.equal(parseBlame(`${A} 1 1 1\nauthor Ada\n\tbin\0ary\n`), null);
});

test('parseTree reads blobs, including paths with spaces, and skips submodules', () => {
  const text =
    `100644 blob ${A}     120\tsrc/index.js\0` +
    `100644 blob ${B}   9000\tdocs/a file.md\0` +
    `160000 commit ${A}       -\tvendor/lib\0`;
  assert.deepEqual(parseTree(text), [
    { path: 'src/index.js', mode: '100644', size: 120 },
    { path: 'docs/a file.md', mode: '100644', size: 9000 },
  ]);
});

test('isFossilCandidate keeps hand-written text and drops generated, vendored or binary files', () => {
  const ok = (path, size = 100, mode = '100644') => isFossilCandidate({ path, size, mode });
  assert.equal(ok('src/index.js'), true);
  assert.equal(ok('Makefile'), true);
  assert.equal(ok('package-lock.json'), false);
  assert.equal(ok('web/yarn.lock'), false);
  assert.equal(ok('node_modules/x/index.js'), false);
  assert.equal(ok('public/app.min.js'), false);
  assert.equal(ok('assets/logo.PNG'), false);
  assert.equal(ok('src/big.js', 300 * 1024), false);
  assert.equal(ok('src/empty.js', 0), false);
  assert.equal(ok('link', 10, '120000'), false);
});

test('isCodeFile keeps source files and leaves config, docs and dotfiles out of the fossil hunt', () => {
  assert.equal(isCodeFile('lib/router/index.js'), true);
  assert.equal(isCodeFile('bin/cli'), true);
  assert.equal(isCodeFile('.editorconfig'), false);
  assert.equal(isCodeFile('docs/guide.md'), false);
  assert.equal(isCodeFile('tsconfig.json'), false);
  assert.equal(isCodeFile('LICENSE'), false);
  assert.equal(isCodeFile('History.md'), false);
});

test('isMeaningful ignores lines that are only punctuation', () => {
  assert.equal(isMeaningful('  }'), false);
  assert.equal(isMeaningful(' */'), false);
  assert.equal(isMeaningful('end'), false);
  assert.equal(isMeaningful('var app = express();'), true);
});
