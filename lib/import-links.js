import { randomUUID } from 'node:crypto';
import { validateRecord, brands, categories } from './records.js';

export function convertOperationLink(row) {
  const tags = (Array.isArray(row.tags) ? row.tags : []).map(tag => typeof tag === 'string' ? tag : tag?.name).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim());
  const brandNames = [
    ['레아쥬', /^(레아쥬|reage)$/i], ['바이오폭스', /^(바이오폭스|biofox)$/i], ['711메디샷', /^(711\s*메디샷|711\s*medishot)$/i],
  ].filter(([, pattern]) => tags.some(tag => pattern.test(tag.replace(/^#/, ''))));
  const brand = brands.includes(row.brand) ? row.brand : brandNames.length === 1 ? brandNames[0][0] : '공통';
  const category = categories.includes(row.category) ? row.category : categories.find(value => tags.includes(value)) || '업무·기타';
  const record = validateRecord({
    type: 'link', title: row.title, url: row.url, description: row.description || '',
    brand, category, pinned: row.is_pinned === true || row.isPinned === true,
    body: tags.length ? tags.map(tag => `#${tag.replace(/^#/, '')}`).join(' ') : '',
  });
  return record;
}

export function importOperationLinks(db, rows, { dryRun = false } = {}) {
  if (!Array.isArray(rows)) throw new Error('링크 목록이 담긴 JSON 배열이 필요합니다.');
  const result = { total: rows.length, imported: 0, duplicate: 0, inactive: 0, invalid: [] };
  const canonical = value => new URL(value).href;
  const existing = new Set(db.prepare('SELECT content FROM records').all().map(row => JSON.parse(row.content)).filter(row => row.type === 'link' && row.url).map(row => canonical(row.url)));
  const pending = [];
  rows.forEach((row, index) => {
    if (row?.is_active === false) { result.inactive++; return; }
    try {
      if (!row || typeof row !== 'object') throw new Error('링크 형식을 확인해 주세요.');
      const record = convertOperationLink(row);
      const key = canonical(record.url);
      if (existing.has(key)) { result.duplicate++; return; }
      existing.add(key);
      pending.push({ record, id: randomUUID() });
      result.imported++;
    } catch (error) { result.invalid.push({ row: index + 1, reason: error.message }); }
  });
  if (!dryRun && pending.length) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const now = new Date().toISOString();
      const insert = db.prepare('INSERT INTO records (id,content,created_at,updated_at) VALUES (?,?,?,?)');
      for (const { id, record } of pending) insert.run(id, JSON.stringify(record), now, now);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return result;
}
