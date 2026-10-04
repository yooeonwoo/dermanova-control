import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { createBlobDocument } from '../lib/blob-store.js';
import { createPortal } from '../server.js';

test('cloud document retries concurrent writes without losing another update', async () => {
  let stored = { items: [] }; let version = 1;
  const sdk = {
    get: async (pathname, options) => {
      assert.equal(options.useCache, false);
      assert.equal(options.headers['Accept-Encoding'], 'identity');
      return { statusCode: 200, stream: new Response(JSON.stringify(stored)).body, blob: { etag: String(version) } };
    },
    put: async (pathname, body, options) => {
      if (options.ifMatch !== String(version)) throw new BlobPreconditionFailedError();
      stored = JSON.parse(body); version++;
    },
  };
  const document = createBlobDocument('test.json', {}, sdk);
  await Promise.all([document.update(value => value.items.push('one')), document.update(value => value.items.push('two'))]);
  assert.deepEqual(stored.items.sort(), ['one', 'two']);
});

test('cloud admin sessions work across server instances and logout revokes both', async () => {
  let state = { sessions: {}, attempts: {} };
  const securityStorage = { read: async () => structuredClone(state), update: async callback => { const next = structuredClone(state); const result = callback(next); state = next; return result; } };
  const storage = { list: async () => [] };
  const servers = [createPortal({ storage, securityStorage, password: 'cloud-test-only' }), createPortal({ storage, securityStorage, password: 'cloud-test-only' })];
  for (const server of servers) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  const origins = servers.map(server => `http://127.0.0.1:${server.address().port}`);
  try {
    const login = await fetch(origins[0] + '/api/login', { method: 'POST', headers: { Origin: origins[0], 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'cloud-test-only' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const session = await (await fetch(origins[1] + '/api/session', { headers: { Cookie: cookie } })).json();
    assert.equal(session.authenticated, true);
    assert.equal((await fetch(origins[1] + '/api/logout', { method: 'POST', headers: { Origin: origins[1], Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
    assert.equal((await (await fetch(origins[0] + '/api/session', { headers: { Cookie: cookie } })).json()).authenticated, false);
    const publicContent = await (await fetch(origins[0] + '/api/content')).json();
    assert.equal('sessions' in publicContent, false);
  } finally { for (const server of servers) await new Promise(resolve => server.close(resolve)); }
});
