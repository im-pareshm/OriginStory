import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { UserError } from '../src/url.js';

// The exhibits are fakes: these tests check routing and error handling, offline.
const calls = [];
let nextResult;
const fakeExhibit = (name) => async (repo) => {
  calls.push([name, repo.cloneUrl]);
  return nextResult();
};

let server;
let base;
before(async () => {
  server = createApp({ graveyard: fakeExhibit('graveyard'), fossils: fakeExhibit('fossils') }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json().catch(() => null) };
};

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
  assert.match(missing.body.error, /Paste a link/);
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
  assert.match(res.body.error, /Something went wrong on our side/);
  assert.doesNotMatch(JSON.stringify(res.body), /secret/);
  assert.equal(logged.mock.callCount(), 1, 'the real error is logged on the server');
});

test('unknown routes are 404', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
});
