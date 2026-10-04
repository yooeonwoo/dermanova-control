import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

export function createBlobDocument(pathname, initial, sdk = { get, put }) {
  const read = async () => {
    // Keep a strong ETag for conditional writes; gzip responses may supply a weak ETag.
    const result = await sdk.get(pathname, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } });
    if (!result) return { value: structuredClone(initial), etag: null };
    if (result.statusCode !== 200 || !result.stream) throw new Error('저장된 자료를 불러오지 못했습니다.');
    return { value: await new Response(result.stream).json(), etag: result.blob.etag };
  };
  return {
    read: async () => (await read()).value,
    update: async callback => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { value, etag } = await read();
        const result = callback(value);
        try {
          await sdk.put(pathname, JSON.stringify(value), { access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60, allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}) });
          return result;
        } catch (error) {
          if (!(error instanceof BlobPreconditionFailedError || (!etag && /already exists/i.test(error.message)))) throw error;
          console.warn('Blob write conflict', { pathname, etag, message: error.message });
        }
      }
      fail(409, '다른 요청과 겹쳤습니다. 다시 시도해 주세요.');
    },
  };
}

export function createBlobRecordStore(seedRecords = []) {
  const document = createBlobDocument('portal/content.json', { records: seedRecords });
  return {
    list: async () => (await document.read()).records,
    create: record => document.update(value => { value.records.push(record); return record; }),
    update: (id, input) => document.update(value => {
      const index = value.records.findIndex(record => record.id === id);
      if (index < 0) fail(404, '등록된 정보를 찾을 수 없습니다.');
      const previous = value.records[index];
      if (input.updatedAt !== previous.updatedAt) fail(409, '다른 관리자가 수정했습니다. 새로고침 후 다시 편집해 주세요.');
      value.records[index] = { ...input, id, createdAt: previous.createdAt, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt) + 1)).toISOString() };
      return value.records[index];
    }),
    delete: id => document.update(value => {
      if (!value.records.some(record => record.id === id)) fail(404, '등록된 정보를 찾을 수 없습니다.');
      value.records = value.records.filter(record => record.id !== id);
    }),
  };
}

export const createBlobSecurityStore = () => createBlobDocument('portal/security.json', { sessions: {}, attempts: {} });
