export const brands = ['공통', '레아쥬', '바이오폭스', '711메디샷'];
export const categories = ['주문·신청', '교육·자료', '홍보·콘텐츠', '업무·기타'];
export function validateRecord(input) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || !['notice', 'event', 'link'].includes(input.type)) fail('등록할 정보 종류를 확인해 주세요.');
  const text = (key, max, required = false) => {
    if (input[key] != null && typeof input[key] !== 'string') fail('입력 형식을 확인해 주세요.');
    const value = (input[key] || '').trim();
    if ((required && !value) || value.length > max) fail(`${key === 'title' ? '제목' : '입력 내용'}을 확인해 주세요. (최대 ${max}자)`);
    return value;
  };
  if (!brands.includes(input.brand)) fail('브랜드를 선택해 주세요.');
  const record = {
    type: input.type, title: text('title', 120, true), brand: input.brand,
    description: text('description', 600), body: text('body', 12000),
    url: text('url', 2000, input.type === 'link'), owner: text('owner', 100),
    category: text('category', 40), startDate: text('startDate', 10), endDate: text('endDate', 10),
    shareText: text('shareText', 3000), pinned: input.pinned === true,
    archived: input.archived === true,
  };
  if (record.url) {
    let parsed;
    try { parsed = new URL(record.url); } catch { fail('https://로 시작하는 올바른 링크를 입력해 주세요.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('http 또는 https 링크만 등록할 수 있습니다.');
  }
  if (record.type === 'link' && !categories.includes(record.category)) fail('링크 분류를 선택해 주세요.');
  for (const key of ['startDate', 'endDate']) {
    const value = record[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) fail('날짜를 확인해 주세요.');
  }
  if (record.type === 'event' && (!record.startDate || !record.endDate)) fail('행사 시작일과 종료일을 입력해 주세요.');
  if (record.startDate && record.endDate && record.startDate > record.endDate) fail('종료일은 시작일 이후여야 합니다.');
  return record;
}
