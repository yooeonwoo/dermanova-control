import { readFileSync } from 'node:fs';
import { createPortal } from '../server.js';
import { createBlobRecordStore, createBlobSecurityStore } from '../lib/blob-store.js';

const seedRecords = JSON.parse(readFileSync(new URL('../lib/initial-content.json', import.meta.url), 'utf8'));
const linkRegistrations = JSON.parse(readFileSync(new URL('../lib/link-registrations.json', import.meta.url), 'utf8'));
const portal = createPortal({ storage: createBlobRecordStore(seedRecords, { linkRegistrations }), securityStorage: createBlobSecurityStore(), secureCookie: true });

export default function handler(req, res) {
  const route = req.query?.route;
  const path = Array.isArray(route) ? route.join('/') : route || '';
  req.url = `/api/${path}`;
  portal.emit('request', req, res);
}
