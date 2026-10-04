import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { validateRecord } from './lib/records.js';

const root = dirname(fileURLToPath(import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

export function createPortal({ dataDir = process.env.DATA_DIR || resolve(root, 'data'), password = process.env.ADMIN_PASSWORD || '', publicOrigin = process.env.PUBLIC_ORIGIN || '', secureCookie = process.env.COOKIE_SECURE === 'true', seedRecords = [] } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, 'portal.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS portal_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  if (!db.prepare("SELECT value FROM portal_meta WHERE key = 'initial_content_loaded'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT COUNT(*) AS count FROM records').get().count === 0) {
        const insert = db.prepare('INSERT INTO records VALUES (?, ?, ?, ?)');
        for (const item of seedRecords) insert.run(item.id, JSON.stringify(validateRecord(item)), item.createdAt || new Date().toISOString(), item.updatedAt || new Date().toISOString());
      }
      db.prepare('INSERT INTO portal_meta VALUES (?, ?)').run('initial_content_loaded', '1');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  const sessions = new Map();
  const attempts = new Map();
  const salt = randomBytes(16);
  const hash = password ? scryptSync(password, salt, 32) : null;
  const all = () => db.prepare('SELECT * FROM records ORDER BY updated_at DESC').all().map(row => ({ ...JSON.parse(row.content), id: row.id, createdAt: row.created_at, updatedAt: row.updated_at }));
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const json = (res, status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(value)); };
  const cookie = token => `portal_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 28800 : 0}${secureCookie ? '; Secure' : ''}`;
  const body = async req => {
    let result = ''; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 65536) fail(413, '입력 내용이 너무 큽니다.'); result += chunk; }
    try { return JSON.parse(result); } catch { fail(400, '입력 내용을 확인해 주세요.'); }
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = /(?:^|;\s*)portal_session=([^;]*)/.exec(req.headers.cookie || '')?.[1];
      for (const [key, expiry] of sessions) if (expiry < Date.now()) sessions.delete(key);
      for (const [key, attempt] of attempts) if (Date.now() - attempt.start > 900000) attempts.delete(key);
      const authenticated = !!token && sessions.has(token);
      if (url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) {
          const expectedOrigin = publicOrigin || `${secureCookie ? 'https' : 'http'}://${req.headers.host}`;
          if (req.headers.origin !== expectedOrigin || req.headers['content-type']?.split(';')[0] !== 'application/json') fail(403, '이 페이지에서 다시 시도해 주세요.');
        }
        if (url.pathname === '/api/content' && req.method === 'GET') return json(res, 200, { records: all(), updatedAt: new Date().toISOString() });
        if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, { authenticated, configured: !!hash });
        if (url.pathname === '/api/login' && req.method === 'POST') {
          if (!hash) fail(503, '관리자 설정이 필요합니다. 서버에서 npm run setup을 실행해 주세요.');
          const key = req.socket.remoteAddress;
          const attempt = attempts.get(key) || { count: 0, start: Date.now() };
          if (attempt.count >= 10) fail(429, '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.');
          const input = await body(req);
          attempt.count++; attempts.set(key, attempt);
          if (typeof input.password !== 'string' || input.password.length > 200 || !timingSafeEqual(hash, scryptSync(input.password, salt, 32))) fail(401, '비밀번호를 확인해 주세요.');
          attempts.delete(key);
          const newToken = randomBytes(32).toString('hex');
          if (token) sessions.delete(token);
          sessions.set(newToken, Date.now() + 28800000);
          return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(newToken) });
        }
        if (url.pathname === '/api/logout' && req.method === 'POST') { sessions.delete(token); return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('') }); }
        if (url.pathname.startsWith('/api/records')) {
          if (!authenticated) fail(401, '관리자 로그인이 필요합니다.');
          if (url.pathname === '/api/records' && req.method === 'POST') {
            const record = validateRecord(await body(req));
            const id = randomUUID(); const now = new Date().toISOString();
            db.prepare('INSERT INTO records VALUES (?, ?, ?, ?)').run(id, JSON.stringify(record), now, now);
            return json(res, 201, { record: { ...record, id, createdAt: now, updatedAt: now } });
          }
          const id = /^\/api\/records\/([\w-]+)$/.exec(url.pathname)?.[1];
          if (id && ['PUT', 'DELETE'].includes(req.method)) {
            const previous = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
            if (!previous) fail(404, '등록된 정보를 찾을 수 없습니다.');
            if (req.method === 'DELETE') { db.prepare('DELETE FROM records WHERE id = ?').run(id); return json(res, 200, { ok: true }); }
            const input = await body(req);
            if (input.updatedAt !== previous.updated_at) fail(409, '다른 관리자가 수정했습니다. 새로고침 후 다시 편집해 주세요.');
            const record = validateRecord(input); const now = new Date().toISOString();
            db.prepare('UPDATE records SET content = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(record), now, id);
            return json(res, 200, { record: { ...record, id, createdAt: previous.created_at, updatedAt: now } });
          }
        }
        fail(404, '요청한 기능을 찾을 수 없습니다.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) fail(405, '지원하지 않는 요청입니다.');
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'], '/logo.png': ['logo.png', 'image/png'] };
      const file = files[url.pathname];
      if (!file) fail(404, '페이지를 찾을 수 없습니다.');
      const content = readFileSync(resolve(root, 'public', file[0]));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.message);
      json(res, error.status || 500, { error: error.status ? error.message : '처리 중 문제가 발생했습니다. 다시 시도해 주세요.' });
    }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seedRecords = JSON.parse(readFileSync(resolve(root, 'lib/initial-content.json'), 'utf8'));
  createPortal({ seedRecords }).listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () => console.log(`더마노바 관제센터: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3000}`));
}
