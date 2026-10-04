import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createPortal } from '../server.js';

test('initial content loads only once and deleted records remain deleted after restart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dermanova-seed-'));
  const seedRecords = [{ id: 'initial-link', type: 'link', title: '초기 링크', brand: '공통', category: '업무·기타', url: 'https://example.com' }];
  const start = async () => { const server = createPortal({ dataDir, seedRecords }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server; };
  const close = server => new Promise(resolve => server.close(resolve));
  try {
    const first = await start();
    const initial = await (await fetch(`http://127.0.0.1:${first.address().port}/api/content`)).json();
    assert.equal(initial.records[0].title, '초기 링크');
    await close(first);
    const db = new DatabaseSync(join(dataDir, 'portal.sqlite'));
    db.exec('DELETE FROM records'); db.close();
    const second = await start();
    const afterRestart = await (await fetch(`http://127.0.0.1:${second.address().port}/api/content`)).json();
    assert.equal(afterRestart.records.length, 0);
    await close(second);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test('shared records persist; editing requires authentication and same-origin requests', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dermanova-test-'));
  let server;
  const start = async () => { server = createPortal({ dataDir, password: 'test-password-only' }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; };
  const stop = async () => { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); };
  try {
    let origin = await start();
    let cookie = '';
    const request = (path, method = 'GET', data, requestOrigin = origin) => fetch(origin + path, { method, headers: { Origin: requestOrigin, Cookie: cookie, 'Content-Type': 'application/json' }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    const link = { type: 'link', title: '공유 링크', brand: '바이오폭스', category: '교육·자료', url: 'https://example.com', pinned: true };
    assert.deepEqual((await (await request('/api/content')).json()).records, []);
    assert.equal((await request('/api/records', 'POST', link)).status, 401);
    assert.equal((await request('/api/login', 'POST', { password: 'wrong' })).status, 401);
    const login = await request('/api/login', 'POST', { password: 'test-password-only' });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/records', 'POST', link, 'https://other.example')).status, 403);
    assert.equal((await request('/api/records', 'POST', { ...link, url: 'javascript:alert(1)' })).status, 400);
    assert.equal((await request('/api/records', 'POST', { type: 'event', title: '잘못된 행사', brand: '공통', startDate: '2026-02-30', endDate: '2026-03-02' })).status, 400);
    const created = await request('/api/records', 'POST', link);
    assert.equal(created.status, 201);
    const { record } = await created.json();
    assert.equal((await (await request('/api/content')).json()).records[0].title, '공유 링크');
    assert.equal((await request(`/api/records/${record.id}`, 'PUT', { ...record, updatedAt: 'stale' })).status, 409);
    assert.equal((await request(`/api/records/${record.id}`, 'PUT', { ...record, title: '수정한 공유 링크' })).status, 200);
    // A second visitor sees the server's saved record, without any cookie.
    const shared = await (await fetch(origin + '/api/content')).json();
    assert.equal(shared.records[0].title, '수정한 공유 링크');
    assert.equal((await request('/.env')).status, 404);
    await stop(); origin = await start(); cookie = '';
    assert.equal((await (await request('/api/content')).json()).records[0].title, '수정한 공유 링크');
    assert.equal((await request(`/api/records/${record.id}`, 'DELETE', {})).status, 401);
    const relogin = await request('/api/login', 'POST', { password: 'test-password-only' });
    cookie = relogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await request(`/api/records/${record.id}`, 'DELETE', {})).status, 200);
    assert.equal((await (await request('/api/content')).json()).records.length, 0);
    await request('/api/logout', 'POST', {});
    assert.equal((await (await request('/api/session')).json()).authenticated, false);
  } finally { if (server?.listening) await stop(); rmSync(dataDir, { recursive: true, force: true }); }
});

test('unconfigured admin stays locked and repeated password attempts are limited', async () => {
  for (const password of ['', 'test-only']) {
    const dataDir = mkdtempSync(join(tmpdir(), 'dermanova-auth-'));
    const server = createPortal({ dataDir, password });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const login = () => fetch(origin + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
      if (!password) assert.equal((await login()).status, 503);
      else { for (let i = 0; i < 10; i++) assert.equal((await login()).status, 401); assert.equal((await login()).status, 429); }
    } finally { await new Promise(resolve => server.close(resolve)); rmSync(dataDir, { recursive: true, force: true }); }
  }
});
