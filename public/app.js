const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 4 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-12 0h12m-8 13h4"/>',
  refresh: '<path d="M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5m-4 9a8 8 0 0 0 14 2l3-3m0 5v-5h-5"/>',
  settings: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.link}</svg>`;
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brands = ['전체', '레아쥬', '바이오폭스', '711메디샷'];
const categories = ['전체', '주문·신청', '교육·자료', '홍보·콘텐츠', '업무·기타'];
const brandClass = brand => ({ '레아쥬': 'reage', '바이오폭스': 'biofox', '711메디샷': 'medishot' }[brand] || 'common');
const badge = brand => `<span class="badge ${brandClass(brand)}">${escape(brand)}</span>`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateLabel = value => value ? value.slice(5, 10).replace('-', '.') : '';
const fullDate = value => value ? value.slice(0, 10).replaceAll('-', '.') : '';
const HOME_LINK_URLS = ['https://yooeonwoo.github.io/biofox-catalog/', 'https://naver.me/Gct6XOu3', 'http://pf.kakao.com/_rYUxhn'];
const state = { records: [], brand: '전체', query: '', eventTab: '진행 중', category: '전체', adminType: '전체', authenticated: false, configured: false, demo: false, loaded: false, error: '', route: 'home', editing: null, noticesExpanded: false };
const titles = { home: '홈', events: '이벤트 / 행사', links: '링크모음', search: '검색 결과', admin: '정보 관리' };

function demoRecords() {
  const date = today();
  const offset = days => { const d = new Date(`${date}T12:00:00+09:00`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const base = { body: '', owner: '예시 담당팀', pinned: false, archived: false, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
  return [
    { ...base, id: 'demo-notice', type: 'notice', brand: '공통', title: '[예시] 팀 공유 자료는 이곳에서 확인하세요', description: '', pinned: true },
    { ...base, id: 'demo-notice-2', type: 'notice', brand: '바이오폭스', title: '[예시] 행사 안내 자료 업데이트', description: '' },
    ...['레아쥬', '바이오폭스', '711메디샷'].map((brand, i) => ({ ...base, id: `demo-link-${i}`, type: 'link', brand, title: ['[예시] 파트너 주문 안내', '[예시] 브랜드 교육 자료', '[예시] 런칭 안내 자료'][i], description: '', category: categories[i + 1], url: 'https://example.com', shareText: '화면 확인용 예시 링크입니다. 실제 운영 자료가 아닙니다.', pinned: true })),
    { ...base, id: 'demo-event-1', type: 'event', brand: '레아쥬', title: '[예시] 파트너 대상 행사', description: '', startDate: offset(-2), endDate: offset(8) },
    { ...base, id: 'demo-event-2', type: 'event', brand: '바이오폭스', title: '[예시] 브랜드 교육 세미나', description: '', startDate: offset(4), endDate: offset(4) },
    { ...base, id: 'demo-event-3', type: 'event', brand: '711메디샷', title: '[예시] 지난 런칭 행사', description: '', startDate: offset(-12), endDate: offset(-5) },
  ];
}
const records = () => state.demo ? demoRecords() : state.records;
const eventStatus = r => r.archived || r.endDate < today() ? '종료' : r.startDate > today() ? '예정' : '진행 중';
const statusBadge = r => { const label = eventStatus(r); return `<span class="status ${label === '종료' ? 'ended' : label === '예정' ? 'upcoming' : ''}">${label}</span>`; };
const linkActive = r => !r.archived && (!r.endDate || r.endDate >= today());
const matches = r => (state.brand === '전체' || r.brand === state.brand || r.brand === '공통') && (!state.query || [r.title, r.brand, r.description, r.body, r.category, r.owner].some(v => (v || '').toLocaleLowerCase().includes(state.query.toLocaleLowerCase())));
const filtered = type => records().filter(r => (!type || r.type === type) && matches(r));
const priority = list => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
const action = (name, id) => `data-action="${name}" data-id="${escape(id)}"`;
const validUrl = url => { try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };

function empty(title, description, button = '') {
  return `<div class="empty"><h3>${escape(title)}</h3>${button}</div>`;
}
function linkCard(r) {
  const url = validUrl(r.url);
  return `<article class="panel link-card"><div class="card-top">${badge(r.brand)}<span class="card-category">${escape(r.category)}</span></div><h3><button ${action('detail', r.id)}>${escape(r.title)}</button></h3>${r.description ? `<p>${escape(r.description)}</p>` : ''}<div class="card-actions">${url ? `<a class="button small" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${icon('external')}열기</a><button class="button small" ${action('copy', r.id)} aria-label="${escape(r.title)} 링크 복사">${icon('copy')}링크 복사</button>` : ''}</div>${r.shareText ? `<button class="copy-note" ${action('copy-message', r.id)}>${icon('copy')} 안내문 + 링크 복사</button>` : ''}</article>`;
}
function noticeRow(r) {
  return `<button class="notice-row" ${action('detail', r.id)}>${r.pinned ? '<span class="badge important">중요</span>' : badge(r.brand)}<span class="notice-main"><b>${escape(r.title)}</b><p>${escape(r.description)}</p></span><span class="notice-date">${dateLabel(r.updatedAt)}</span>${icon('arrow')}</button>`;
}
function eventCard(r, compact = false) {
  if (compact) return `<article class="panel event-card"><div class="event-date">${r.startDate.slice(5, 7)}월<strong>${Number(r.startDate.slice(8, 10))}</strong></div><div class="event-info"><div>${badge(r.brand)} ${statusBadge(r)}</div><h3>${escape(r.title)}</h3><p>${fullDate(r.startDate)} — ${fullDate(r.endDate)}</p></div><button class="button small" ${action('detail', r.id)} aria-label="${escape(r.title)} 상세 보기">상세${icon('arrow')}</button></article>`;
  return `<article class="panel event-tile"><div class="card-top">${badge(r.brand)}${statusBadge(r)}</div><h3>${escape(r.title)}</h3><p>${escape(r.description)}</p><div class="event-meta">${icon('calendar')}${fullDate(r.startDate)} — ${fullDate(r.endDate)}</div>${r.owner ? `<div class="event-meta">${icon('settings')}${escape(r.owner)}</div>` : ''}<div class="card-actions"><button class="button" ${action('detail', r.id)}>상세 보기${icon('arrow')}</button><button class="button" ${action('copy-page', r.id)}>${icon('copy')}안내 공유</button></div></article>`;
}
function sectionHead(title, glyph, route, subtitle = '') {
  return `<div class="section-head"><div><h2>${icon(glyph)}${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${route ? `<a class="text-link" href="#${route}">전체 보기${icon('arrow')}</a>` : ''}</div>`;
}
function home() {
  const allNotices = priority(filtered('notice').filter(r => !r.archived));
  const notices = state.noticesExpanded ? allNotices : allNotices.slice(0, 3);
  const links = filtered('link').filter(r => linkActive(r) && HOME_LINK_URLS.includes(r.url)).sort((a, b) => HOME_LINK_URLS.indexOf(a.url) - HOME_LINK_URLS.indexOf(b.url));
  const events = filtered('event').filter(r => eventStatus(r) !== '종료').sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 3);
  return `<section class="section">${sectionHead('공지', 'bell', null)}${notices.length ? `<div class="panel">${notices.map(noticeRow).join('')}</div>${allNotices.length > 3 ? `<button class="text-link" data-action="notice-expand" aria-expanded="${state.noticesExpanded}">${state.noticesExpanded ? '접기' : `공지 ${allNotices.length}개 모두 보기`}${icon('arrow')}</button>` : ''}` : empty('등록된 공지가 없습니다')}</section>
    <section class="section">${sectionHead('자주 쓰는 링크', 'link', 'links')}${links.length ? `<div class="link-grid">${links.map(linkCard).join('')}</div>` : empty('등록된 링크가 없습니다')}</section>
    <section class="section">${sectionHead('다가오는 행사', 'calendar', 'events')}${events.length ? `<div class="event-list">${events.map(r => eventCard(r, true)).join('')}</div>` : empty('등록된 행사가 없습니다')} </section>`;
}
function eventsPage() {
  const list = filtered('event').filter(r => eventStatus(r) === state.eventTab).sort((a, b) => state.eventTab === '종료' ? b.endDate.localeCompare(a.endDate) : a.startDate.localeCompare(b.startDate));
  return `<div class="filter-row"><div class="tabs" role="group" aria-label="행사 상태">${['진행 중', '예정', '종료'].map(tab => `<button class="tab ${state.eventTab === tab ? 'active' : ''}" data-action="event-tab" data-value="${tab}" aria-pressed="${state.eventTab === tab}">${tab} <span class="count-badge">${filtered('event').filter(r => eventStatus(r) === tab).length}</span></button>`).join('')}</div><span class="result-count">${list.length}개의 행사</span></div>${list.length ? `<div class="events-grid">${list.map(r => eventCard(r)).join('')}</div>` : empty(`${state.eventTab} 행사가 없습니다`, '다른 상태나 브랜드를 선택하거나 검색어를 변경해 보세요.')}`;
}
function linksPage() {
  const list = priority(filtered('link').filter(r => linkActive(r) && (state.category === '전체' || r.category === state.category)));
  return `<div class="filter-row"><div class="tabs" role="group" aria-label="링크 분류">${categories.map(category => `<button class="tab ${category === state.category ? 'active' : ''}" data-action="category" data-value="${category}" aria-pressed="${category === state.category}">${category}</button>`).join('')}</div><span class="result-count">${list.length}개의 링크</span></div>${list.length ? `<div class="link-grid">${list.map(linkCard).join('')}</div>` : empty('찾는 링크가 없습니다', '다른 분류나 브랜드를 선택하거나 검색어를 변경해 보세요.')}`;
}
function searchPage() {
  const list = filtered().filter(r => !r.archived && (r.type !== 'link' || linkActive(r)));
  if (!list.length) return empty('검색 결과가 없습니다', '다른 검색어를 입력하거나 브랜드 필터를 전체로 변경해 보세요.');
  return ['notice', 'event', 'link'].map(type => { const rows = list.filter(r => r.type === type); if (!rows.length) return ''; return `<section class="section">${sectionHead(`${{ notice: '공지', event: '이벤트 / 행사', link: '공유 링크' }[type]} <span class="count-badge">${rows.length}</span>`, { notice: 'bell', event: 'calendar', link: 'link' }[type], null)}<div class="${type === 'notice' ? 'panel' : type === 'link' ? 'link-grid' : 'events-grid'}">${rows.map(type === 'notice' ? noticeRow : type === 'link' ? linkCard : r => eventCard(r)).join('')}</div></section>`; }).join('');
}
function adminPage() {
  if (!state.authenticated) return empty('관리자 로그인이 필요합니다', '직원은 로그인 없이 이용할 수 있습니다. 등록과 수정을 하려면 관리자 로그인을 해주세요.', '<button class="button primary" data-action="login">관리자 로그인</button>');
  const list = priority(state.records.filter(r => matches(r) && (state.adminType === '전체' || r.type === state.adminType)));
  return `<div class="admin-toolbar"><div><button class="button subtle" data-action="logout">로그아웃</button><button class="button primary" data-action="new">${icon('plus')}새 정보 등록</button></div></div><div class="filter-row"><div class="tabs" role="group" aria-label="관리 정보 종류">${[['전체', '전체'], ['notice', '공지'], ['event', '이벤트 / 행사'], ['link', '공유 링크']].map(([value, label]) => `<button class="tab ${state.adminType === value ? 'active' : ''}" data-action="admin-tab" data-value="${value}" aria-pressed="${state.adminType === value}">${label}</button>`).join('')}</div><span class="result-count">${list.length}개의 정보</span></div>${list.length ? `<div class="panel">${list.map(r => `<article class="admin-record"><div>${badge(r.brand)} <span class="card-category">${{ notice: '공지', event: '행사', link: '링크' }[r.type]}${r.archived ? ' · 보관됨' : ''}${r.pinned ? ' · 홈 우선 표시' : ''}</span><h3>${escape(r.title)}</h3><p>최종 수정 ${fullDate(r.updatedAt)}${r.owner ? ` · ${escape(r.owner)}` : ''}</p></div><div><button class="button small" ${action('edit', r.id)}>수정</button><button class="button small danger" ${action('delete', r.id)}>삭제</button></div></article>`).join('')}</div>` : empty('등록된 정보가 없습니다', '실제 링크와 행사 내용을 등록하면 팀이 함께 볼 수 있습니다.')}`;
}
function render() {
  const page = state.query && state.route !== 'admin' ? 'search' : state.route;
  $('page-title').textContent = titles[page];
  $('breadcrumb').textContent = { home: '홈', events: '이벤트 / 행사', links: '링크모음', search: '통합 검색', admin: '정보 관리' }[page];
  document.title = `더마노바 관제센터 · ${$('breadcrumb').textContent}`;
  $('navigation').innerHTML = [['home', 'home', '홈'], ['events', 'calendar', '이벤트 / 행사'], ['links', 'link', '링크모음']].map(([route, glyph, label]) => `<a class="nav-item ${state.route === route ? 'active' : ''}" href="#${route}" ${state.route === route ? 'aria-current="page"' : ''} title="${label}">${icon(glyph)}<span class="nav-text">${label}</span>${route !== 'home' ? `<span class="nav-count">${records().filter(r => route === 'links' ? r.type === 'link' && linkActive(r) : r.type === 'event' && eventStatus(r) !== '종료').length}</span>` : ''}</a>`).join('');
  $('brand-filters').innerHTML = brands.map(brand => `<button class="brand-filter ${state.brand === brand ? 'selected' : ''} ${brandClass(brand)}" data-brand="${brand}" aria-pressed="${state.brand === brand}">${brand !== '전체' ? '<span class="brand-dot"></span>' : ''}${brand}</button>`).join('');
  $('mode-banner').innerHTML = state.demo ? '<div class="demo-banner"><span><b>예시 자료</b> · 실제 운영 정보 아님</span><button data-action="demo">예시 닫기</button></div>' : '';
  $('demo-toggle').textContent = state.demo ? '예시 닫기' : '예시 보기';
  $('load-error').innerHTML = state.error ? `<div class="error-banner">${escape(state.error)} <button data-action="refresh">다시 불러오기</button></div>` : '';
  $('admin-entry').innerHTML = `${icon('settings')}<span class="nav-text">${state.authenticated ? '정보 관리' : '관리자'}</span>`;
  $('content').innerHTML = !state.loaded && !state.demo ? '<div class="loading">불러오는 중…</div>' : ({ home, events: eventsPage, links: linksPage, search: searchPage, admin: adminPage }[page])();
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const payload = await response.json();
  if (!response.ok) { if (response.status === 401 && path !== '/api/login') { state.authenticated = false; render(); } throw new Error(payload.error || '처리 중 문제가 발생했습니다.'); }
  return payload;
}
async function load({ silent = false } = {}) {
  try {
    const payload = await api('/api/content');
    const changed = JSON.stringify(payload.records) !== JSON.stringify(state.records);
    state.records = payload.records; state.loaded = true; state.error = '';
    if (!silent || changed) render();
    if (!state.demo) {
      const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
      if (id && !$('detail-dialog').open) detail(id);
    }
  } catch (error) { state.loaded = true; state.error = error.message || '정보를 불러오지 못했습니다. 연결 상태를 확인해 주세요.'; render(); }
}
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3300); }
async function copy(text, message = '복사했습니다.') {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else { const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); const ok = document.execCommand('copy'); input.remove(); if (!ok) throw new Error(); }
    toast(message);
  } catch { toast('복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.'); }
}
const pageUrl = r => `${location.origin}/#${r.type === 'event' ? 'events' : r.type === 'link' ? 'links' : 'home'}?id=${encodeURIComponent(r.id)}`;
function detail(id) {
  const r = records().find(item => item.id === id);
  if (!r) { toast('해당 정보를 찾을 수 없습니다.'); return; }
  const url = validUrl(r.url);
  $('detail-content').innerHTML = `<div class="dialog-top"><button class="icon-button close-dialog" aria-label="닫기">×</button></div><div>${badge(r.brand)} ${r.type === 'event' ? statusBadge(r) : r.archived ? '<span class="status ended">보관됨</span>' : ''}</div><h2 id="detail-title">${escape(r.title)}</h2><p class="detail-summary">${escape(r.description)}</p><div class="detail-meta">${r.type === 'event' ? `<span>${icon('calendar')} ${fullDate(r.startDate)} — ${fullDate(r.endDate)}</span>` : ''}${r.owner ? `<span>담당 ${escape(r.owner)}</span>` : ''}<span>최종 수정 ${fullDate(r.updatedAt)}</span></div>${r.body ? `<div class="detail-body">${escape(r.body)}</div>` : ''}${state.demo ? '<p class="form-hint">예시 자료 · 실제 운영 정보 아님</p>' : ''}${url ? `<div class="detail-url">${escape(url)}</div>` : ''}<div class="dialog-actions">${url ? `<a class="button primary" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${icon('external')}링크 열기</a><button class="button" ${action('copy', r.id)}>${icon('copy')}링크 복사</button>` : ''}${r.shareText && url ? `<button class="button" ${action('copy-message', r.id)}>안내문 + 링크 복사</button>` : ''}${!state.demo ? `<button class="button" ${action('copy-page', r.id)}>${icon('copy')}이 안내 공유</button>` : ''}</div>`;
  if (!$('detail-dialog').open) $('detail-dialog').showModal();
}
function route() {
  const next = location.hash.slice(1).split('?')[0] || 'home';
  state.route = titles[next] && next !== 'search' ? next : 'home';
  state.query = ''; $('search').value = '';
  if (state.route === 'admin') state.demo = false;
  $('detail-dialog').close(); render();
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  if (id && state.loaded) detail(id);
}
function login() { $('login-error').textContent = ''; $('login-form').reset(); $('login-dialog').showModal(); }
function editor(id) {
  const record = id ? state.records.find(r => r.id === id) : null;
  state.editing = record || null;
  const form = $('editor-form'); form.reset();
  $('editor-title').textContent = record ? '정보 수정' : '새 정보 등록';
  for (const [key, value] of Object.entries(record || {})) if (form.elements.namedItem(key)) { const element = form.elements.namedItem(key); if (element.type === 'checkbox') element.checked = value; else element.value = value; }
  $('editor-error').textContent = ''; editorFields(); $('editor-dialog').showModal();
}
function editorFields() {
  const form = $('editor-form'); const type = form.elements.type.value;
  form.querySelectorAll('.event-field').forEach(el => { el.hidden = type !== 'event'; el.querySelector('input').required = type === 'event'; if (type !== 'event') el.querySelector('input').value = ''; });
  form.querySelectorAll('.link-field').forEach(el => { el.hidden = type !== 'link'; });
  form.elements.url.required = type === 'link';
}
async function handleAction(button) {
  const name = button.dataset.action; const r = records().find(item => item.id === button.dataset.id);
  if (name === 'copy-repository') await copy('https://github.com/yooeonwoo/dermanova-control.git', 'GitHub 주소를 복사했습니다.');
  if (name === 'detail') detail(button.dataset.id);
  if (name === 'copy' && r) await copy(r.url);
  if (name === 'copy-message' && r) await copy(`${r.shareText}\n\n${r.url}`);
  if (name === 'copy-page' && r) { if (state.demo) toast('예시 자료는 공유할 수 없습니다. 실제 자료를 등록해 주세요.'); else await copy(`${r.title}\n${pageUrl(r)}`); }
  if (name === 'event-tab') { state.eventTab = button.dataset.value; render(); }
  if (name === 'category') { state.category = button.dataset.value; render(); }
  if (name === 'admin-tab') { state.adminType = button.dataset.value; render(); }
  if (name === 'notice-expand') { state.noticesExpanded = !state.noticesExpanded; render(); }
  if (name === 'demo') { state.demo = !state.demo; $('detail-dialog').close(); if (state.route === 'admin') { location.hash = 'home'; state.route = 'home'; } render(); }
  if (name === 'refresh') { button.disabled = true; await load(); button.disabled = false; }
  if (name === 'login') login();
  if (name === 'new') editor();
  if (name === 'edit') editor(button.dataset.id);
  if (name === 'logout') { await api('/api/logout', { method: 'POST', body: '{}' }); state.authenticated = false; render(); toast('로그아웃했습니다.'); }
  if (name === 'delete' && r && confirm(`“${r.title}”을 삭제할까요? 직원 화면에서도 삭제됩니다.`)) { await api(`/api/records/${encodeURIComponent(r.id)}`, { method: 'DELETE', body: '{}' }); await load(); toast('삭제했습니다.'); }
}
document.addEventListener('click', async event => {
  const close = event.target.closest('.close-dialog');
  if (close) { close.closest('dialog').close(); return; }
  const brand = event.target.closest('[data-brand]');
  if (brand) { state.brand = brand.dataset.brand; render(); return; }
  const button = event.target.closest('[data-action]');
  if (button) { try { await handleAction(button); } catch (error) { toast(error.message); } }
});
$('search').addEventListener('input', event => { state.query = event.target.value.trim(); render(); });
$('refresh').innerHTML = `${icon('refresh')}<span class="refresh-text">새로고침</span>`;
$('refresh').dataset.action = 'refresh';
$('search-icon').innerHTML = icon('search');
$('demo-toggle').dataset.action = 'demo';
$('admin-entry').addEventListener('click', () => { location.hash = 'admin'; if (!state.authenticated) login(); });
$('editor-form').elements.type.addEventListener('change', editorFields);
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('login-error').textContent = '';
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: new FormData(event.target).get('password') }) }); state.authenticated = true; state.demo = false; $('login-dialog').close(); location.hash = 'admin'; state.route = 'admin'; render(); toast('로그인했습니다.'); }
  catch (error) { $('login-error').textContent = error.message; } finally { button.disabled = false; }
});
$('editor-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('editor-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.target)); data.pinned = !!data.pinned; data.archived = !!data.archived;
  if (state.editing) data.updatedAt = state.editing.updatedAt;
  try { await api(state.editing ? `/api/records/${state.editing.id}` : '/api/records', { method: state.editing ? 'PUT' : 'POST', body: JSON.stringify(data) }); $('editor-dialog').close(); await load(); toast('저장했습니다.'); }
  catch (error) { $('editor-error').textContent = error.message; } finally { button.disabled = false; }
});
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); } });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
$('detail-dialog').addEventListener('close', () => { if (location.hash.includes('?id=')) history.replaceState(null, '', `#${state.route}`); });
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('dialog[open]')) load({ silent: true }); });
setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) load({ silent: true }); }, 60000);
$('today').textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' }).format(new Date());
route();
try { const session = await api('/api/session'); state.authenticated = session.authenticated; state.configured = session.configured; } catch { /* Content loading below displays connection errors. */ }
await load();
