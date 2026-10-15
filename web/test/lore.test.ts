import assert from 'node:assert/strict';
import { test } from 'node:test';
import { epitaph, fileName, formatDate, formatLifespan, hashString, lifespanMs, percent, plural } from '../src/lore.ts';
import type { CommitEvent, Grave } from '../src/types.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const BORN = Date.UTC(2020, 0, 1);

const event = (author: string, at: number): CommitEvent => ({ hash: 'h', author, at, message: 'm' });

/** An ordinary grave: lived 30 days, edited twice, ~100 lines, created and deleted by different people. */
function grave(overrides: Partial<Grave> = {}, lived = 30 * DAY): Grave {
  return {
    path: 'src/thing.js',
    formerNames: [],
    born: event('Ada', BORN),
    lastWords: event('Ada', BORN),
    died: event('Grace', BORN + lived),
    lines: 100,
    binary: false,
    touches: 3,
    authors: ['Ada', 'Grace'],
    lifeNumber: 1,
    ...overrides,
  };
}

test('lifespanMs is the time from birth to death, or null when the birth is unknown', () => {
  assert.equal(lifespanMs(grave({}, 5 * DAY)), 5 * DAY);
  assert.equal(lifespanMs(grave({ born: null })), null);
});

test('formatLifespan picks the unit a person would use', () => {
  assert.equal(formatLifespan(null), 'unknown');
  assert.equal(formatLifespan(10_000), '1 minute', 'never "0 minutes"');
  assert.equal(formatLifespan(30 * MINUTE), '30 minutes');
  assert.equal(formatLifespan(5 * HOUR), '5 hours');
  assert.equal(formatLifespan(DAY), '1 day');
  assert.equal(formatLifespan(59 * DAY), '59 days');
  assert.equal(formatLifespan(91 * DAY), '3 months');
  assert.equal(formatLifespan(3 * YEAR), '3 years', 'no trailing ".0"');
  assert.equal(formatLifespan(3.5 * YEAR), '3.5 years');
});

test('plural adds an s except for exactly one', () => {
  assert.equal(plural(1, 'line'), '1 line');
  assert.equal(plural(0, 'line'), '0 lines');
  assert.equal(plural(2, 'grave'), '2 graves');
  assert.equal(plural(1500, 'commit'), `${(1500).toLocaleString()} commits`);
});

test('percent never rounds a real share down to 0%', () => {
  assert.equal(percent(0), '0%');
  assert.equal(percent(0.004), '<1%');
  assert.equal(percent(0.5), '50%');
  assert.equal(percent(0.996), '100%');
});

test('formatDate shows the day, month and year in the visitor\'s locale', () => {
  const text = formatDate(Date.UTC(2021, 6, 15, 12));
  assert.match(text, /2021/);
  assert.match(text, /15/);
  assert.equal(text, new Date(Date.UTC(2021, 6, 15, 12)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
});

test('fileName is the last path segment', () => {
  assert.equal(fileName('a/b/c.js'), 'c.js');
  assert.equal(fileName('c.js'), 'c.js');
  assert.equal(fileName('weird/'), 'weird/', 'never an empty name');
});

test('hashString is stable', () => {
  assert.equal(hashString('src/thing.js'), hashString('src/thing.js'));
  assert.notEqual(hashString('a'), hashString('b'));
  assert.ok(Number.isInteger(hashString('x')) && hashString('x') >= 0);
});

test('epitaph carves the most telling fact, in priority order', () => {
  const cases: [string, Grave, string][] = [
    ['reborn beats everything', grave({ lifeNumber: 3 }, 10 * MINUTE), 'Died 3 times. Probably not the last.'],
    ['under an hour', grave({}, 10 * MINUTE), 'Barely committed before it was gone.'],
    ['under a day, same author', grave({ died: event('Ada', BORN + 5 * HOUR) }, 5 * HOUR), 'Made and unmade by the same hand, the same day.'],
    ['under a day, someone else', grave({}, 5 * HOUR), 'Gone too soon.'],
    ['empty', grave({ lines: 0 }), 'Was always empty inside.'],
    ['binary', grave({ binary: true, lines: null }), 'Spoke only in bytes.'],
    ['over five years', grave({}, 6 * YEAR), 'Lived a long and full life.'],
    ['two or more renames', grave({ formerNames: ['a.js', 'b.js'] }), 'Went by many names.'],
    ['never edited', grave({ touches: 1 }), 'Never changed. Never wanted to.'],
    ['over 1000 lines', grave({ lines: 1500 }), 'A giant among files.'],
    ['five or more authors', grave({ authors: ['A', 'B', 'C', 'D', 'E'] }), 'Loved by 5 contributors.'],
    ['deleted by its creator', grave({ died: event('Ada', BORN + 30 * DAY) }), 'Its maker giveth, and its maker taketh away.'],
  ];
  for (const [why, g, expected] of cases) assert.equal(epitaph(g), expected, why);
});

test('epitaph falls back to a resting phrase that stays the same for the same path', () => {
  const plain = grave();
  const words = epitaph(plain);
  assert.equal(epitaph({ ...plain }), words);
  assert.match(words, /\.$/);
  const phrases = new Set(Array.from({ length: 40 }, (_, i) => epitaph(grave({ path: `file-${i}.js` }))));
  assert.ok(phrases.size > 1, 'different paths get different phrases');
});

test('epitaph handles a grave with no known birth', () => {
  assert.doesNotThrow(() => epitaph(grave({ born: null, lastWords: null })));
});
