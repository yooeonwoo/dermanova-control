import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { createBlobRecordStore } from '../lib/blob-store.js';
import { prepareLinkRegistrations, applyLinkRegistrations } from '../lib/github-link-registrations.js';

const entries = JSON.parse(readFileSync(new URL('../lib/link-registrations.json', import.meta.url), 'utf8'));
const original = {
  id: 'existing-record', type: 'link', title: '기존 자료', brand: '공통', category: '교육·자료',
  url: 'https://example.org/original', description: '기존 설명', body: '기존 상세 내용', owner: '교육팀',
  pinned: true, archived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
};

function memoryBlob(initial) {
  let value = structuredClone(initial);
  let version = 1;
  let puts = 0;
  return {
    sdk: {
      get: async () => ({ statusCode: 200, stream: new Response(JSON.stringify(value)).body, blob: { etag: String(version) } }),
      put: async (pathname, body, options) => {
        if (options.ifMatch !== String(version)) throw new BlobPreconditionFailedError();
        value = JSON.parse(body); version++; puts++;
      },
    },
    snapshot: () => structuredClone(value),
    puts: () => puts,
  };
}

test('GitHub registration preserves approved content and existing records, and runs once', async () => {
  const blob = memoryBlob({ records: [original] });
  const open = () => createBlobRecordStore([], { linkRegistrations: entries, sdk: blob.sdk });
  const records = await open().list();
  assert.equal(records.length, 2);
  assert.deepEqual(records.find(record => record.id === original.id), original);
  const saved = records.find(record => record.id === entries[0].id);
  for (const field of ['title', 'description', 'brand', 'category', 'url', 'pinned', 'archived']) assert.deepEqual(saved[field], entries[0][field]);
  assert.equal(saved.pinned, false);
  assert.equal((await open().list()).length, 2);
  assert.equal(blob.puts(), 1);
});

test('administrator edits and deletions survive another deployment of the same registration', async () => {
  const blob = memoryBlob({ records: [original] });
  const open = () => createBlobRecordStore([], { linkRegistrations: entries, sdk: blob.sdk });
  const store = open();
  const saved = (await store.list()).find(record => record.id === entries[0].id);
  await store.update(saved.id, { ...saved, title: '관리자가 수정한 제목' });
  assert.equal((await open().list()).find(record => record.id === saved.id).title, '관리자가 수정한 제목');
  await open().delete(saved.id);
  assert.deepEqual(await open().list(), [original]);
});

test('a changed registration updates the same saved record and preserves unrelated fields', async () => {
  const existing = { ...original, url: entries[0].url + '/' };
  const blob = memoryBlob({ records: [existing] });
  const first = createBlobRecordStore([], { linkRegistrations: entries, sdk: blob.sdk });
  const saved = (await first.list())[0];
  assert.equal(saved.id, original.id);
  assert.equal(saved.owner, original.owner);
  assert.equal(saved.body, original.body);
  await first.update(saved.id, { ...saved, url: 'https://example.org/administrator-edited-url' });
  const changed = [{ ...entries[0], description: '사용자가 변경해 전달한 설명' }];
  const next = await createBlobRecordStore([], { linkRegistrations: changed, sdk: blob.sdk }).list();
  assert.equal(next.length, 1);
  assert.equal(next[0].id, original.id);
  assert.equal(next[0].description, changed[0].description);
  assert.equal(next[0].owner, original.owner);
  assert.equal(next[0].body, original.body);
  assert.equal(next[0].createdAt, original.createdAt);
});

test('concurrent registration syncs retain both additions and the previous records', async () => {
  const blob = memoryBlob({ records: [original] });
  const another = { ...entries[0], id: 'github-another-link', title: '다른 자료', url: 'https://example.org/another' };
  const first = createBlobRecordStore([], { linkRegistrations: entries, sdk: blob.sdk });
  const second = createBlobRecordStore([], { linkRegistrations: [another], sdk: blob.sdk });
  await Promise.all([first.list(), second.list()]);
  const stored = blob.snapshot();
  assert.equal(stored.records.length, 3);
  assert.deepEqual(stored.records.find(record => record.id === original.id), original);
  assert.ok(stored.gitLinkRegistrations[entries[0].id]);
  assert.ok(stored.gitLinkRegistrations[another.id]);
});

test('conflicting record IDs and duplicate manifest URLs cannot overwrite unrelated information', () => {
  assert.throws(() => prepareLinkRegistrations([entries[0], { ...entries[0], id: 'second-id' }]), /중복/);
  const document = { records: [{ ...original, id: entries[0].id, type: 'notice' }] };
  const before = structuredClone(document);
  assert.throws(() => applyLinkRegistrations(document, prepareLinkRegistrations(entries)), /겹칩니다/);
  assert.deepEqual(document, before);
});
