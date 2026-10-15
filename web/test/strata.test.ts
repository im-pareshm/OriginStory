import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageColor, ageRange, bandLayers, grainFor, strataStats, yearMid } from '../src/strata.ts';
import type { Layer } from '../src/types.ts';

const DAY = 86_400_000;
const layer = (month: string, lines: number, authors: [string, number][] = []): Layer => ({ month, lines, authors });
const span = (first: string, last: string) => [layer(first, 1), layer(last, 1)];

test('grainFor picks months for short histories, quarters for medium, years for long', () => {
  assert.equal(grainFor([]), 'month');
  assert.equal(grainFor([layer('2020-01', 5)]), 'month');
  assert.equal(grainFor(span('2020-01', '2020-06')), 'month', 'five months');
  assert.equal(grainFor(span('2020-01', '2020-07')), 'quarter', 'six months');
  assert.equal(grainFor(span('2020-01', '2022-11')), 'quarter', 'just under three years');
  assert.equal(grainFor(span('2020-01', '2022-12')), 'year', 'three calendar years');
  assert.equal(grainFor(span('2001-01', '2024-01')), 'year');
});

test('bandLayers merges months into years, summing lines and keeping the top three authors', () => {
  const bands = bandLayers(
    [
      layer('2021-03', 4, [['Ann', 4]]),
      layer('2020-02', 10, [['Ann', 6], ['Bob', 4]]),
      layer('2020-11', 5, [['Cy', 3], ['Bob', 1]]),
      layer('2020-12', 1, [['Dee', 1]]),
    ],
    'year',
  );
  assert.deepEqual(bands, [
    {
      key: '2020',
      label: '2020',
      start: Date.UTC(2020, 0, 1),
      end: Date.UTC(2021, 0, 1),
      lines: 16,
      authors: [['Ann', 6], ['Bob', 5], ['Cy', 3]], // Dee (1 line) falls outside the top three
    },
    { key: '2021', label: '2021', start: Date.UTC(2021, 0, 1), end: Date.UTC(2022, 0, 1), lines: 4, authors: [['Ann', 4]] },
  ]);
});

test('bandLayers labels quarters and months, oldest first', () => {
  const layers = [layer('2021-08', 2), layer('2021-01', 1), layer('2021-03', 3)];
  assert.deepEqual(
    bandLayers(layers, 'quarter').map((b) => [b.key, b.label, b.lines, b.start, b.end]),
    [
      ['2021-Q1', 'Q1 2021', 4, Date.UTC(2021, 0, 1), Date.UTC(2021, 3, 1)],
      ['2021-Q3', 'Q3 2021', 2, Date.UTC(2021, 6, 1), Date.UTC(2021, 9, 1)],
    ],
  );
  assert.deepEqual(
    bandLayers(layers, 'month').map((b) => [b.key, b.label]),
    [
      ['2021-01', 'Jan 2021'],
      ['2021-03', 'Mar 2021'],
      ['2021-08', 'Aug 2021'],
    ],
  );
  assert.equal(bandLayers([layer('2021-12', 1)], 'month')[0].end, Date.UTC(2022, 0, 1), 'December ends at the next new year');
});

test('bandLayers picks the grain itself when none is given', () => {
  assert.deepEqual(
    bandLayers(span('2010-05', '2015-05')).map((b) => b.key),
    ['2010', '2015'],
  );
});

test('strataStats finds the half-life month and the share of recent and ancient lines', () => {
  const layers = [layer('2015-01', 10), layer('2020-01', 10), layer('2021-01', 20)];
  const now = Date.UTC(2021, 5, 1);
  assert.deepEqual(strataStats(layers, now), {
    totalLines: 40,
    medianAt: Date.UTC(2020, 0, 1) + 15 * DAY, // half the lines (20 of 40) are reached in Jan 2020
    oldestAt: Date.UTC(2015, 0, 1),
    recentShare: 0.5, // only Jan 2021 is within the last 12 months
    ancientShare: 0.25, // only Jan 2015 is more than five years old
  });
});

test('strataStats has nothing to say about an empty or lineless repo', () => {
  assert.equal(strataStats([], Date.now()), null);
  assert.equal(strataStats([layer('2020-01', 0)], Date.now()), null);
});

test('ageRange spans from the oldest month to the end of the newest', () => {
  assert.deepEqual(ageRange([]), [0, 1]);
  assert.deepEqual(ageRange([layer('2020-01', 1), layer('2022-06', 1)]), [Date.UTC(2020, 0, 1), Date.UTC(2022, 5, 1) + 31 * DAY]);
  const [first, last] = ageRange([layer('2020-01', 1)]);
  assert.ok(last > first, 'a single month still has a non-empty range');
});

test('ageColor runs from deep ochre for the oldest lines to pale sand for the newest, clamped', () => {
  const range: [number, number] = [Date.UTC(2010, 0, 1), Date.UTC(2020, 0, 1)];
  assert.equal(ageColor(range[0], range), 'oklch(0.520 0.080 62)');
  assert.equal(ageColor(range[1], range), 'oklch(0.900 0.050 62)');
  assert.equal(ageColor(Date.UTC(1990, 0, 1), range), ageColor(range[0], range));
  assert.equal(ageColor(Date.UTC(2030, 0, 1), range), ageColor(range[1], range));
  assert.equal(ageColor((range[0] + range[1]) / 2, range), 'oklch(0.710 0.065 62)');
});

test('yearMid is the first of July, UTC', () => {
  assert.equal(yearMid(2020), Date.UTC(2020, 6, 1));
});
