import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { ApiError } from '../src/api-types.ts';
import { createApp, type ExhibitBuilder } from '../src/app.ts';
import { UserError } from '../src/url.ts';

// The exhibits are fakes: these tests check routing and error handling, offline.
const calls: [exhibit: string, cloneUrl: string][] = [];
let nextResult: () => unknown = () => ({});
const fakeExhibit =
  (name: string): ExhibitBuilder =>
  async (repo) => {
    calls.push([name, repo.cloneUrl]);
    return nextResult();
  };

let server: Server;
let base: string;
before(async () => {
  server = createApp({ graveyard: fakeExhibit('graveyard'), fossils: fakeExhibit('fossils') }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const get = async (path: string): Promise<{ status: number; body: unknown }> => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** The `error` message of an error response. */
const errorOf = (body: unknown): string => (body as ApiError).error;

test('GET /api/health answers ok', async () => {
  assert.deepEqual(await get('/api/health'), { status: 200, body: { ok: true } });
});

test('exhibit routes pass the normalized repo to the right exhibit and return its JSON', async () => {
  calls.length = 0;
  nextResult = () => ({ hello: 'graves' });
  assert.deepEqual(await get('/api/graveyard?repo=sindresorhus/ky'), { status: 200, body: { hello: 'graves' } });
  nextResult = () => ({ hello: 'fossils' });
  assert.deepEqual(await get(`/api/fossils?repo=${encodeURIComponent('https://github.com/a/b/tree/main')}`), {
    status: 200,
    body: { hello: 'fossils' },
  });
  assert.deepEqual(calls, [
    ['graveyard', 'https://github.com/sindresorhus/ky'],
    ['fossils', 'https://github.com/a/b'],
  ]);
});

test('a bad link is answered with 400 and never reaches the exhibit', async () => {
  calls.length = 0;
  const missing = await get('/api/graveyard');
  assert.equal(missing.status, 400);
  assert.match(errorOf(missing.body), /Paste a link/);
  const local = await get('/api/fossils?repo=https://localhost/a/b');
  assert.equal(local.status, 400);
  assert.deepEqual(calls, []);
});

test("an exhibit's visitor-facing error keeps its status and message", async () => {
  nextResult = () => {
    throw new UserError('That repository is empty.', 404);
  };
  assert.deepEqual(await get('/api/graveyard?repo=a/b'), { status: 404, body: { error: 'That repository is empty.' } });
});

test('an unexpected failure becomes a generic 500 that leaks no details', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  nextResult = () => {
    throw new Error('ENOENT /srv/secret/path');
  };
  const res = await get('/api/fossils?repo=a/b');
  assert.equal(res.status, 500);
  assert.match(errorOf(res.body), /Something went wrong on our side/);
  assert.doesNotMatch(JSON.stringify(res.body), /secret/);
  assert.equal(logged.mock.callCount(), 1, 'the real error is logged on the server');
});

test('unknown routes are 404', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
});
