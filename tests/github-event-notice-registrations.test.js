import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { createBlobRecordStore } from '../lib/blob-store.js';
import {
  prepareEventRegistrations, prepareNoticeRegistrations,
  applyEventRegistrations, applyNoticeRegistrations,
} from '../lib/github-link-registrations.js';

const eventEntries = JSON.parse(readFileSync(new URL('../lib/event-registrations.json', import.meta.url), 'utf8'));
const noticeEntries = JSON.parse(readFileSync(new URL('../lib/notice-registrations.json', import.meta.url), 'utf8'));

const adminEvent = {
  id: '684a1f15-e1d9-440b-b69f-e3a454a6c45e', type: 'event', title: '[test]큐어부스터 10+5행사',
  brand: '바이오폭스', description: '조대표님 생신 기념 큐어부스터 10+5행사',
  body: '조대표님 생신 기념 큐어부스터 10+5행사 진행\n행사 기간: 2026년 10월 4일 ~ 10월 10일',
  url: '', owner: '', category: '', startDate: '2026-10-04', endDate: '2026-10-10', shareText: '',
  pinned: false, archived: false, createdAt: '2026-10-04T11:06:08.698Z', updatedAt: '2026-10-04T11:06:08.698Z',
};
const adminNotice = {
  id: '04d4d0ef-c8a2-47e0-8eb5-49aa3cbffa8f', type: 'notice', title: '10/5, 10/9 배송 휴무 안내',
  brand: '공통', description: '10월 5일(월), 10월 9일(금)은 배송 휴무입니다.',
  body: '10월 5일(월), 10월 9일(금)은 배송 휴무입니다.',
  url: '', owner: '', category: '', startDate: '', endDate: '', shareText: '',
  pinned: true, archived: false, createdAt: '2026-10-04T13:01:51.140Z', updatedAt: '2026-10-04T13:01:51.140Z',
};
const otherEvent = {
  id: 'b574e347-7566-4e82-950b-9b95933ae9ef', type: 'event', title: "'송선미가 쏜다!' 리페어크림 증정이벤트",
  brand: '바이오폭스', description: '큐어부스터 / 큐어부스터라이트쿼터 개당 리페어크림 증정',
  body: '증정 조건', url: '', owner: '', category: '', startDate: '2026-10-10', endDate: '2026-10-31', shareText: '',
  pinned: false, archived: false, createdAt: '2026-10-04T11:06:08.695Z', updatedAt: '2026-10-04T11:06:08.695Z',
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

test('repo event/notice registrations archive existing admin records by id and leave others alone', async () => {
  const blob = memoryBlob({ records: [adminEvent, adminNotice, otherEvent] });
  const open = () => createBlobRecordStore([], {
    eventRegistrations: eventEntries,
    noticeRegistrations: noticeEntries,
    sdk: blob.sdk,
  });
  const records = await open().list();
  const seedIds = new Set([adminEvent.id, adminNotice.id, otherEvent.id]);
  const expectedLength = 3
    + eventEntries.filter(entry => !seedIds.has(entry.id)).length
    + noticeEntries.filter(entry => !seedIds.has(entry.id)).length;
  assert.equal(records.length, expectedLength);
  assert.equal(records.find(r => r.id === adminEvent.id).archived, true);
  assert.equal(records.find(r => r.id === adminNotice.id).archived, true);
  assert.equal(records.find(r => r.id === otherEvent.id).planning, true);
  assert.equal(records.find(r => r.id === otherEvent.id).body, otherEvent.body);
  assert.equal(blob.puts(), 1);
  assert.equal((await open().list()).find(r => r.id === adminEvent.id).archived, true);
  assert.equal(blob.puts(), 1);
});

test('a new event registration creates a record, and editing the entry updates the same id', async () => {
  const entry = {
    id: 'github-sample-event', type: 'event', title: '샘플 행사', brand: '레아쥬',
    description: '설명', body: '본문', startDate: '2026-11-01', endDate: '2026-11-07', pinned: true, archived: false,
  };
  const blob = memoryBlob({ records: [] });
  const first = await createBlobRecordStore([], { eventRegistrations: [entry], sdk: blob.sdk }).list();
  assert.equal(first.length, 1);
  assert.equal(first[0].id, entry.id);
  assert.equal(first[0].title, '샘플 행사');
  assert.equal(first[0].pinned, true);
  const changed = [{ ...entry, title: '샘플 행사(수정)', pinned: false }];
  const next = await createBlobRecordStore([], { eventRegistrations: changed, sdk: blob.sdk }).list();
  assert.equal(next.length, 1);
  assert.equal(next[0].id, entry.id);
  assert.equal(next[0].title, '샘플 행사(수정)');
  assert.equal(next[0].pinned, false);
  assert.equal(next[0].createdAt, first[0].createdAt);
});

test('removing an event entry from the file does not delete or unarchive the saved record', async () => {
  const entry = {
    id: 'github-keep-event', type: 'event', title: '유지 행사', brand: '공통',
    description: '', body: '', startDate: '2026-12-01', endDate: '2026-12-02', pinned: false, archived: true,
  };
  const blob = memoryBlob({ records: [] });
  await createBlobRecordStore([], { eventRegistrations: [entry], sdk: blob.sdk }).list();
  const afterRemoval = await createBlobRecordStore([], { eventRegistrations: [], sdk: blob.sdk }).list();
  assert.equal(afterRemoval.length, 1);
  assert.equal(afterRemoval[0].id, entry.id);
  assert.equal(afterRemoval[0].archived, true);
});

test('conflicting types and invalid event dates are rejected without mutating the document', () => {
  assert.throws(() => prepareEventRegistrations([{ ...eventEntries[0], type: 'notice' }]), /행사만/);
  assert.throws(() => prepareNoticeRegistrations([{ ...noticeEntries[0], type: 'event' }]), /공지만/);
  assert.throws(() => prepareEventRegistrations([{
    id: 'bad-event', type: 'event', title: '날짜 없음', brand: '공통', startDate: '', endDate: '',
  }]), /시작일/);
  const eventDoc = { records: [{ ...adminEvent, type: 'link', url: 'https://example.org/x', category: '업무·기타' }] };
  const eventBefore = structuredClone(eventDoc);
  assert.throws(() => applyEventRegistrations(eventDoc, prepareEventRegistrations(eventEntries)), /겹칩니다/);
  assert.deepEqual(eventDoc, eventBefore);
  const noticeDoc = { records: [{ ...adminNotice, type: 'link', url: 'https://example.org/y', category: '업무·기타' }] };
  const noticeBefore = structuredClone(noticeDoc);
  assert.throws(() => applyNoticeRegistrations(noticeDoc, prepareNoticeRegistrations(noticeEntries)), /겹칩니다/);
  assert.deepEqual(noticeDoc, noticeBefore);
});
