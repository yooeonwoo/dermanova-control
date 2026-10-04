import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { importOperationLinks } from '../lib/import-links.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2);
const filename = args.find(arg => !arg.startsWith('--'));
if (!filename || args.includes('--help')) {
  console.log('사용법: node scripts/import-links.js <links.json> [--dry-run]');
  console.log('JSON: operation_links 행 배열. tags는 문자열 또는 {name} 배열을 지원합니다.');
  process.exit(filename ? 0 : 1);
}
const dataDir = resolve(process.env.DATA_DIR || 'data');
const database = resolve(dataDir, 'portal.sqlite');
if (!existsSync(database)) throw new Error('먼저 공유포털을 한 번 실행해 주세요.');
const payload = JSON.parse(readFileSync(resolve(filename), 'utf8').replace(/^\uFEFF/, ''));
const rows = Array.isArray(payload) ? payload : payload.links;
const db = new DatabaseSync(database, { timeout: 5000 });
try {
  if (!args.includes('--dry-run')) {
    const backups = resolve(dataDir, 'backups');
    mkdirSync(backups, { recursive: true });
    const backup = resolve(backups, `before-link-import-${Date.now()}.sqlite`);
    db.prepare('VACUUM INTO ?').run(backup);
    console.log('가져오기 전 백업을 저장했습니다.');
  }
  console.log(JSON.stringify(importOperationLinks(db, rows, { dryRun: args.includes('--dry-run') }), null, 2));
} finally { db.close(); }
