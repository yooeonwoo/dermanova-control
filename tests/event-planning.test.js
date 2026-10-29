import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validateRecord } from '../lib/records.js';
const base = { type: 'event', title: '기획 행사', brand: '공통' };
test('planning events allow missing dates and require dates when resumed', () => {
  assert.equal(validateRecord({ ...base, planning: true }).planning, true);
  assert.throws(() => validateRecord(base), /시작일/);
  assert.throws(() => validateRecord({ ...base, planning: true, startDate: '2026-02-30' }), /날짜/);
});
test('planning overrides dates and archive state; ordinary events retain date classification', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const status = source.match(/const eventStatus = (.*);/)[1];
  const classify = runInNewContext(`(${status})`, { today: () => '2026-10-29' });
  assert.equal(classify({ planning: true, archived: true, endDate: '2020-01-01' }), '기획/보류');
  assert.equal(classify({ startDate: '2026-10-01', endDate: '2026-10-29' }), '진행 중');
  assert.equal(classify({ startDate: '2026-11-01', endDate: '2026-11-02' }), '예정');
  assert.equal(classify({ startDate: '2026-10-01', endDate: '2026-10-28' }), '종료');
  assert.ok(source.includes("['진행 중', '예정', '종료', '기획/보류']"));
});
