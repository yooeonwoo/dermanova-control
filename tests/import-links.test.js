import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { importOperationLinks } from '../lib/import-links.js';

test('import preserves source values and tags, excludes inactive/invalid rows, and is idempotent', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, content TEXT, created_at TEXT, updated_at TEXT)');
  const rows = [
    { title: '브랜드 교육 자료', url: 'https://example.com', description: '원문 설명', is_pinned: true, tags: [{ name: '바이오폭스' }, { name: '교육·자료' }, { name: '거래처' }] },
    { title: '같은 링크', url: 'https://example.com/', tags: [] },
    { title: '삭제된 링크', url: 'https://example.com/deleted', is_active: false },
    { title: '잘못된 링크', url: 'javascript:alert(1)' },
    { title: '공통 링크', url: 'https://example.org/team', brand: '공통', category: '주문·신청' },
  ];
  try {
    const preview = importOperationLinks(db, rows, { dryRun: true });
    assert.equal(preview.imported, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 0);
    const result = importOperationLinks(db, rows);
    assert.equal(result.imported, 2); assert.equal(result.duplicate, 1); assert.equal(result.inactive, 1); assert.equal(result.invalid.length, 1);
    const records = db.prepare('SELECT content FROM records').all().map(row => JSON.parse(row.content));
    const education = records.find(row => row.title === '브랜드 교육 자료');
    assert.equal(education.description, '원문 설명');
    assert.equal(education.pinned, true); assert.equal(education.brand, '바이오폭스'); assert.equal(education.category, '교육·자료');
    assert.equal(education.body, '#바이오폭스 #교육·자료 #거래처');
    assert.equal(records.find(row => row.title === '공통 링크').brand, '공통');
    assert.equal(records.find(row => row.title === '공통 링크').category, '주문·신청');
    const repeat = importOperationLinks(db, rows);
    assert.equal(repeat.imported, 0); assert.equal(repeat.duplicate, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 2);
  } finally { db.close(); }
});
