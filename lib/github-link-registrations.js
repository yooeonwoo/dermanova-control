import { createHash } from 'node:crypto';
import { validateRecord } from './records.js';

const fields = ['type', 'title', 'brand', 'description', 'body', 'url', 'owner', 'category', 'startDate', 'endDate', 'shareText', 'pinned', 'archived'];
const canonical = url => new URL(url).href;

export function prepareLinkRegistrations(entries = []) {
  if (!Array.isArray(entries)) throw new Error('GitHub 링크 등록 파일은 배열이어야 합니다.');
  const ids = new Set();
  const urls = new Set();
  return entries.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(entry.id) || ids.has(entry.id)) throw new Error('GitHub 링크 등록 ID를 확인해 주세요.');
    if (entry.type !== 'link') throw new Error('GitHub 등록 파일에는 공유 링크만 넣을 수 있습니다.');
    ids.add(entry.id);
    const record = validateRecord(entry);
    const url = canonical(record.url);
    if (urls.has(url)) throw new Error('GitHub 등록 파일에 같은 URL이 중복되어 있습니다.');
    urls.add(url);
    const supplied = fields.filter(field => Object.hasOwn(entry, field));
    const desired = Object.fromEntries(supplied.map(field => [field, record[field]]));
    const fingerprint = createHash('sha256').update(JSON.stringify(desired)).digest('hex');
    return { id: entry.id, record, desired, fingerprint };
  });
}

export function hasPendingLinkRegistrations(document, registrations) {
  return registrations.some(entry => document.gitLinkRegistrations?.[entry.id]?.fingerprint !== entry.fingerprint);
}

export function applyLinkRegistrations(document, registrations, now = Date.now()) {
  if (!Array.isArray(document.records)) throw new Error('기존 관제센터 자료 형식을 확인해 주세요.');
  const ledger = Object.assign(Object.create(null), document.gitLinkRegistrations);
  let applied = 0;
  for (const entry of registrations) {
    if (ledger[entry.id]?.fingerprint === entry.fingerprint) continue;
    const previousId = ledger[entry.id]?.recordId || entry.id;
    const byId = document.records.find(record => record.id === previousId);
    if (byId && byId.type !== 'link') throw new Error('다른 정보와 GitHub 링크 등록 ID가 겹칩니다.');
    const sameUrl = document.records.filter(record => record.type === 'link' && record.url && canonical(record.url) === canonical(entry.record.url));
    if (sameUrl.length > 1 || (byId && sameUrl.some(record => record.id !== byId.id))) throw new Error('같은 URL의 기존 링크를 먼저 확인해 주세요.');
    const previous = byId || sameUrl[0];
    const timestamp = new Date(Math.max(now, (Date.parse(previous?.updatedAt) || 0) + 1)).toISOString();
    const saved = {
      ...validateRecord(previous ? { ...previous, ...entry.desired } : entry.record),
      id: previous?.id || entry.id,
      createdAt: previous?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (previous) document.records[document.records.indexOf(previous)] = saved;
    else document.records.push(saved);
    ledger[entry.id] = { fingerprint: entry.fingerprint, recordId: saved.id };
    applied++;
  }
  if (applied) document.gitLinkRegistrations = ledger;
  return applied;
}
