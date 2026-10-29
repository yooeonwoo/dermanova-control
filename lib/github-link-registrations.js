import { createHash } from 'node:crypto';
import { validateRecord } from './records.js';

const fields = ['type', 'title', 'brand', 'description', 'body', 'url', 'owner', 'category', 'startDate', 'endDate', 'shareText', 'pinned', 'archived'];
const canonical = url => new URL(url).href;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;

const labels = { link: '링크', event: '행사', notice: '공지' };

export function prepareRegistrations(entries = [], { type, uniqueUrl = false } = {}) {
  if (!type || !['link', 'event', 'notice'].includes(type)) throw new Error('등록 종류를 확인해 주세요.');
  if (!Array.isArray(entries)) throw new Error(`GitHub ${labels[type]} 등록 파일은 배열이어야 합니다.`);
  const ids = new Set();
  const urls = new Set();
  return entries.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !idPattern.test(entry.id) || ids.has(entry.id)) {
      throw new Error(`GitHub ${labels[type]} 등록 ID를 확인해 주세요.`);
    }
    if (entry.type !== type) throw new Error(`GitHub ${labels[type]} 등록 파일에는 ${labels[type]}만 넣을 수 있습니다.`);
    ids.add(entry.id);
    const record = validateRecord(entry);
    if (uniqueUrl) {
      const url = canonical(record.url);
      if (urls.has(url)) throw new Error('GitHub 등록 파일에 같은 URL이 중복되어 있습니다.');
      urls.add(url);
    }
    const supplied = fields.filter(field => Object.hasOwn(entry, field));
    const desired = Object.fromEntries(supplied.map(field => [field, record[field]]));
    const fingerprint = createHash('sha256').update(JSON.stringify(desired)).digest('hex');
    return { id: entry.id, record, desired, fingerprint };
  });
}

export function prepareLinkRegistrations(entries = []) {
  return prepareRegistrations(entries, { type: 'link', uniqueUrl: true });
}

export function prepareEventRegistrations(entries = []) {
  return prepareRegistrations(entries, { type: 'event' });
}

export function prepareNoticeRegistrations(entries = []) {
  return prepareRegistrations(entries, { type: 'notice' });
}

export function hasPendingRegistrations(document, registrations, ledgerKey) {
  return registrations.some(entry => document[ledgerKey]?.[entry.id]?.fingerprint !== entry.fingerprint);
}

export function hasPendingLinkRegistrations(document, registrations) {
  return hasPendingRegistrations(document, registrations, 'gitLinkRegistrations');
}

export function applyRegistrations(document, registrations, { ledgerKey, type, matchByUrl = false } = {}, now = Date.now()) {
  if (!Array.isArray(document.records)) throw new Error('기존 관제센터 자료 형식을 확인해 주세요.');
  if (!ledgerKey || !type) throw new Error('등록 적용 설정을 확인해 주세요.');
  const ledger = Object.assign(Object.create(null), document[ledgerKey]);
  let applied = 0;
  for (const entry of registrations) {
    if (ledger[entry.id]?.fingerprint === entry.fingerprint) continue;
    const previousId = ledger[entry.id]?.recordId || entry.id;
    const byId = document.records.find(record => record.id === previousId);
    if (byId && byId.type !== type) throw new Error(`다른 정보와 GitHub ${labels[type]} 등록 ID가 겹칩니다.`);
    let previous = byId;
    if (matchByUrl) {
      const sameUrl = document.records.filter(record => record.type === type && record.url && canonical(record.url) === canonical(entry.record.url));
      if (sameUrl.length > 1 || (byId && sameUrl.some(record => record.id !== byId.id))) {
        throw new Error('같은 URL의 기존 링크를 먼저 확인해 주세요.');
      }
      previous = byId || sameUrl[0];
    }
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
  if (applied) document[ledgerKey] = ledger;
  return applied;
}

export function applyLinkRegistrations(document, registrations, now = Date.now()) {
  return applyRegistrations(document, registrations, { ledgerKey: 'gitLinkRegistrations', type: 'link', matchByUrl: true }, now);
}

export function applyEventRegistrations(document, registrations, now = Date.now()) {
  return applyRegistrations(document, registrations, { ledgerKey: 'gitEventRegistrations', type: 'event' }, now);
}

export function applyNoticeRegistrations(document, registrations, now = Date.now()) {
  return applyRegistrations(document, registrations, { ledgerKey: 'gitNoticeRegistrations', type: 'notice' }, now);
}
