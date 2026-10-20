import './style.css';
import { SUBJECTS, unitLabel, subUnit, defaultScoring, ITEM_TEMPLATES } from './curriculum.js';
import * as st from './store.js';
const { S } = st;

/* ───────── 도우미 ───────── */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const cnt = o => Object.values(o || {}).filter(Boolean).length;
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function md(date) { if (!date) return ''; const [, m, d] = String(date).split('-'); return Number(m) + '.' + d; }
function wd(date) { if (!date) return ''; const [y, m, d] = String(date).split('-').map(Number); return WD[new Date(y, m - 1, d).getDay()]; }
function pg(p) { p = String(p || '').trim(); return !p ? '' : (/^\d/.test(p) ? 'p.' + p : p); }
function n1(v) { return v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toString(); }
function rot(a, b) { let h = 0; for (const c of a + b) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 15) - 7; }
const LOGO = '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="lgBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1C1C20"/><stop offset="1" stop-color="#0A0A0C"/></linearGradient><radialGradient id="lgGlow"><stop offset=".55" stop-color="#FF6E1E" stop-opacity=".55"/><stop offset="1" stop-color="#FF6E1E" stop-opacity="0"/></radialGradient><linearGradient id="lgDisc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9634"/><stop offset="1" stop-color="#F05214"/></linearGradient></defs><rect width="100" height="100" rx="22.5" fill="url(#lgBg)"/><circle cx="50" cy="50" r="44" fill="url(#lgGlow)"/><circle cx="50" cy="50" r="30" fill="url(#lgDisc)"/><polyline points="35.7,52 41.2,49.5 47.5,62.5 56.3,39.9 66,39.9" fill="none" stroke="#101012" stroke-width="5.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ROLE = { owner: '만든 사람', editor: '담당 교사', stamper: '협력 교사' };

/* ───────── 화면용 데이터 ───────── */
let VM = { v: -1 };
function normScoring(sc) {
  const s = Object.assign(defaultScoring(), clone(sc || {}));
  s.stamp = Object.assign(defaultScoring().stamp, s.stamp || {});
  s.items = s.items || [];
  return s;
}
function cd() {
  if (VM.v === S.ver) return VM.data;
  const d = S.d, c = d?.cls || {};
  const sessions = (d?.sessions || []).map(s => {
    const m = d.marks[s.id] || {}, stamps = {}, absent = {};
    for (const k in m) { if (m[k] === 'stamp') stamps[k] = 1; else if (m[k] === 'absent') absent[k] = 1; }
    return { ...s, stamps, absent };
  });
  VM = { v: S.ver, data: { students: d?.students || [], sessions, scoring: normScoring(c.scoring), itemScores: d?.scores || {},
    csb: { threshold: c.threshold ?? 40, students: d?.csb || {} }, logs: d?.logs || [], members: d?.members || [], loaded: !!d?.loaded || !!d?.cls } };
  return VM.data;
}
function cls() {
  if (!S.cur) return null;
  const meta = S.classes.find(c => c.id === S.cur);
  if (!meta) return null;
  return { ...meta, ...(S.d?.cls || {}), id: S.cur, hours: S.d?.cls?.hours ?? 64 };
}
const students = () => [...cd().students].sort((a, b) => (a.no || 0) - (b.no || 0));
const sessionsAsc = () => [...cd().sessions].sort((a, b) => (a.date + (a.period || 0)).localeCompare(b.date + (b.period || 0)) || a.id.localeCompare(b.id));
function saveScoring(fn) { const sc = clone(cd().scoring); fn(sc); st.updateClass({ scoring: sc }); }

/* ───────── 점수 계산 ───────── */
function stampStats(sid) {
  const ss = cd().sessions; let n = 0, ab = 0;
  for (const s of ss) { if (s.absent[sid]) ab++; else if (s.stamps[sid]) n++; }
  const held = ss.length, denom = cd().scoring.stamp.excludeAbsent ? held - ab : held;
  return { held, stamps: n, absent: ab, missed: held - n - ab, rate: denom > 0 ? n / denom * 100 : 0 };
}
function stampScore(sid) {
  const cfg = cd().scoring.stamp; if (!cfg.enabled) return null;
  const s = stampStats(sid), v = cfg.mode === 'rate' ? s.rate : s.stamps;
  for (const b of [...cfg.bands].sort((a, b) => b.min - a.min)) if (v >= Number(b.min)) return Number(b.score);
  return Number(cfg.floor) || 0;
}
function stampMax() { const cfg = cd().scoring.stamp; if (!cfg.enabled) return 0; return Math.max(Number(cfg.floor) || 0, ...cfg.bands.map(b => Number(b.score) || 0)); }
function itemMax(it) { if (it.type === 'check') return Math.max(Number(it.on) || 0, Number(it.off) || 0); if (it.type === 'level') return Math.max(0, ...it.levels.map(l => Number(l.score) || 0)); return Number(it.max) || 0; }
function itemScore(it, sid) {
  const v = cd().itemScores[it.id]?.[sid];
  if (v == null || v === '') return null;
  if (it.type === 'check') return v ? Number(it.on) || 0 : Number(it.off) || 0;
  if (it.type === 'level') return Number(it.levels[v]?.score ?? 0);
  return Math.min(Math.max(Number(v) || 0, 0), itemMax(it));
}
function totalFor(sid) { let t = stampScore(sid) || 0; for (const it of cd().scoring.items) t += itemScore(it, sid) || 0; return t; }
function totalMax() { return stampMax() + cd().scoring.items.reduce((a, it) => a + itemMax(it), 0); }
function itemDesc(it) {
  if (it.type === 'check') return `제출 ${it.on}점 · 미제출 ${it.off}점`;
  if (it.type === 'level') return it.levels.map(l => `${l.label} ${l.score}`).join(' · ');
  return `점수 직접 입력 · 만점 ${it.max}점`;
}

/* ───────── 최성보 ───────── */
function csbPeek(sid) { return Object.assign({ rate: null, done: false, memo: '' }, cd().csb.students[sid] || {}); }
function csbStatus(sid) {
  const c = cls(), s = stampStats(sid), info = csbPeek(sid), th = Number(cd().csb.threshold) || 40;
  const logs = cd().logs.filter(l => l.student_id === sid);
  const allow = Math.floor((c.hours || 0) / 3), left = allow - s.absent;
  const has = info.rate != null && info.rate !== '';
  const reasons = []; let level = 'ok';
  if (has && Number(info.rate) < th) { level = 'bad'; reasons.push(`학업성취율 ${info.rate}% (기준 ${th}%)`); }
  if (left < 0) { level = 'bad'; reasons.push(`결석 ${s.absent}시간, 허용 ${allow}시간 초과`); }
  if (level !== 'bad') {
    if (has && Number(info.rate) < th + 10) { level = 'warn'; reasons.push(`학업성취율 ${info.rate}%로 기준 근접`); }
    if (left <= 3) { level = 'warn'; reasons.push(`결석 가능 ${Math.max(left, 0)}시간 남음`); }
    if (s.held >= 5 && s.rate < 50) { level = 'warn'; reasons.push(`도장률 ${Math.round(s.rate)}%`); }
  }
  const label = info.done ? '이수 확인' : level === 'bad' ? '보충지도 대상' : level === 'warn' ? '예방지도 권장' : '도달';
  return { level: info.done ? 'ok' : level, label, reasons, allow, left, st: s, info, logs, hours: logs.reduce((a, l) => a + (Number(l.hours) || 0), 0) };
}

/* ───────── 화면 상태 ───────── */
const ui = { tab: 'lesson', session: null, mode: 'stamp', just: null, student: null, pf: 'cards', sc: 'table', item: null, csbFilter: 'all' };
try { const t = localStorage.getItem('ms:tab'); if (t && ['lesson', 'portfolio', 'score', 'csb', 'classes'].includes(t)) ui.tab = t; } catch (e) {}
let deferred = false, rq = false;
const typing = () => { const a = document.activeElement; return a && $('#view')?.contains(a) && a.matches('input,textarea,select'); };
document.addEventListener('focusout', () => setTimeout(() => { if (deferred && !typing()) { deferred = false; render(); } }, 0));
function scheduleRender() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); }
st.onChange(scheduleRender);

const app = document.getElementById('app');
function shell() {
  app.innerHTML = `
  <header class="top">
    <div class="top-in">
      <div class="brand"><span class="mark">${LOGO}</span><b>수학 도장노트</b></div>
      <button class="class-btn" data-act="pickClass" id="classBtn" type="button"><span>반 선택</span></button>
      <div class="save" id="saveState"><i></i><span></span></div>
      <button class="me-btn" id="meBtn" type="button" data-act="account" aria-label="내 계정"></button>
    </div>
    <div class="notice"><div class="notice-in"><span class="tag" id="noticeTag">공지</span><span class="txt" id="noticeTxt"></span></div></div>
  </header>
  <main id="view"></main>
  <nav class="tabs" aria-label="메뉴"><div class="in">
    <button type="button" data-act="tab" data-v="lesson"><svg viewBox="0 0 24 24"><circle cx="12" cy="11" r="7"/><circle cx="12" cy="11" r="4.5"/><path d="M8 21h8"/></svg>수업·도장</button>
    <button type="button" data-act="tab" data-v="portfolio"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>포트폴리오</button>
    <button type="button" data-act="tab" data-v="score"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>점수</button>
    <button type="button" data-act="tab" data-v="csb"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>최성보</button>
    <button type="button" data-act="tab" data-v="classes"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>설정</button>
  </div></nav>`;
}
let mode = '';
function render(force) {
  if (!st.configured) { if (mode !== 'setup') { mode = 'setup'; app.innerHTML = viewSetup(); } return; }
  if (!S.user) { if (mode !== 'login') { mode = 'login'; app.innerHTML = viewLogin(); } return; }
  if (!S.meLoaded) { if (mode !== 'wait') { mode = 'wait'; app.innerHTML = '<div class="loading">불러오는 중…</div>'; } return; }
  if (st.needSignup()) { if (mode !== 'signup') { mode = 'signup'; app.innerHTML = viewSignup(); } return; }
  if (mode !== 'app') { mode = 'app'; shell(); }
  if (!force && typing()) { deferred = true; return; }
  const c = cls();
  $('#meBtn').textContent = (S.me.name || '나').trim().slice(0, 1);
  $('#classBtn').innerHTML = c ? `<span>${esc(c.name)}</span><small>${esc(SUBJECTS[c.subject]?.name || '')}</small><small>▾</small>` : '<span>반 선택</span><small>▾</small>';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === ui.tab));
  renderStatus(); renderNotice();
  const v = $('#view'), wrap = v.querySelector('.tbl-wrap'), sl = wrap ? wrap.scrollLeft : 0;
  if (ui.page && PAGES[ui.page.name]) v.innerHTML = PAGES[ui.page.name]();
  else if (ui.tab === 'classes') v.innerHTML = viewSettings();
  else if (!c) v.innerHTML = viewEmpty();
  else if (c.status !== 'active') v.innerHTML = viewPending(c);
  else if (!cd().loaded) v.innerHTML = '<div class="loading">반 정보를 불러오는 중…</div>';
  else v.innerHTML = ({ lesson: viewLesson, portfolio: viewPortfolio, score: viewScore, csb: viewCsb })[ui.tab]();
  const w2 = v.querySelector('.tbl-wrap'); if (w2 && sl) w2.scrollLeft = sl;
  ui.just = null;
}
function renderStatus() {
  const el = $('#saveState'); let s, t;
  const n = S.outbox.length;
  if (!S.online) { s = 'offline'; t = n ? `오프라인 · ${n}건 대기` : '오프라인'; }
  else if (n || S.syncing) { s = 'saving'; t = n ? `저장 중 · ${n}건` : '저장 중'; }
  else if (S.lastError) { s = 'error'; t = '연결 확인'; }
  else { s = 'saved'; t = '동기화됨'; }
  el.className = 'save ' + s; el.querySelector('span').textContent = t;
}
const TABNAME = { lesson: '수업·도장', portfolio: '포트폴리오', score: '점수', csb: '최성보', classes: '반 관리' };
function renderNotice() {
  const tag = $('#noticeTag'), txt = $('#noticeTxt'), c = cls(), o = S.peers;
  if (!S.online) { tag.textContent = '오프라인'; txt.textContent = '인터넷이 끊겨도 도장은 계속 찍을 수 있습니다. 연결되면 자동으로 저장됩니다.'; }
  else if (o.length) { tag.textContent = '접속'; txt.innerHTML = '<span class="dot-live"></span>지금 함께: ' + o.map(p => `<b>${esc(p.name || st.nameOf(p.id))}</b> (${esc(TABNAME[p.tab] || '보는 중')})`).join(', '); }
  else if (c && c.status === 'active') { tag.textContent = '공지'; txt.innerHTML = `반 코드 <b class="num">${esc(c.id)}</b>를 알려 주면 다른 선생님이 참여를 요청할 수 있습니다.`; }
  else { tag.textContent = '공지'; txt.textContent = '반을 만들거나, 동료 선생님께 받은 반 코드로 참여를 요청하세요.'; }
}

/* ───────── 설정 안 됨 / 로그인 ───────── */
function viewSetup() {
  return `<div class="setup stack"><div class="brand"><span class="mark">${LOGO}</span><b>수학 도장노트</b></div>
  <div class="panel stack"><h2 style="margin:0">서버 연결이 아직 설정되지 않았습니다</h2>
  <p class="hint">저장소의 <code>public/config.js</code> 파일에 Supabase 주소와 공개 키(anon key)를 넣어 주세요. 자세한 순서는 저장소의 README에 있습니다.</p></div></div>`;
}
const G_ICON = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 01-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z"/><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0012 23.5z"/><path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 010-4.4v-3H1.8a11.5 11.5 0 000 10.4z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 001.8 6.8l3.8 3c.9-2.8 3.4-5 6.4-5z"/></svg>';
const K_ICON = '<svg viewBox="0 0 24 24"><path fill="#191919" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.7 6.6l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.5.1.9.1 1.4.1 5.5 0 10-3.5 10-7.9S17.5 3 12 3z"/></svg>';
function viewLogin() {
  return `<div class="login"><div class="login-card">
    <span class="mark">${LOGO}</span>
    <h1>수학 도장노트</h1>
    <p>수업 도장 · 결석 · 포트폴리오 점수 · 최성보를<br>동료 선생님과 함께 기록합니다.</p>
    <div class="oauth">
      <button class="google" type="button" data-act="login" data-v="google">${G_ICON}Google로 시작하기</button>
      <button class="kakao" type="button" data-act="login" data-v="kakao">${K_ICON}카카오로 시작하기</button>
    </div>
    <button class="link" type="button" data-act="loginOther" style="justify-self:center;font-size:13px">다른 카카오 계정으로 로그인</button>
    <p class="fine">처음 로그인하면 약관 동의와 간단한 가입 정보 입력 화면이 나옵니다.<br>학생 정보는 참여 승인된 선생님만 볼 수 있습니다.</p>
  </div></div>`;
}


/* ───────── 회원가입 (소셜 로그인 후 1회) ───────── */
const PROVIDER = { google: 'Google', kakao: '카카오' };
const provider = () => S.user?.app_metadata?.provider || '';
const SUBJ_CHOICES = ['공통수학1', '공통수학2', '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '기타'];
const subjChips = (id, picked = []) => `<div class="chips" id="${id}">${SUBJ_CHOICES.map(n => `<button type="button" class="chip ${picked.includes(n) ? 'on' : ''}" data-act="subjChip" data-v="${esc(n)}" aria-pressed="${picked.includes(n)}">${esc(n)}</button>`).join('')}</div>`;
const pickedSubjects = sel => [...document.querySelectorAll(sel + ' .chip.on')].map(b => b.dataset.v);
function viewSignup() {
  const meta = S.user?.user_metadata || {};
  const name = S.me.name && S.me.name !== '선생님' ? S.me.name : (meta.full_name || meta.name || meta.nickname || '');
  return `<div class="login"><div class="login-card signup" style="text-align:left">
    <div class="row" style="gap:12px"><span class="mark" style="width:44px;height:44px;margin:0">${LOGO}</span>
      <div><div class="eyebrow">STEP 2 / 2 · 회원가입</div><h1 style="font-size:22px;color:var(--ink)">가입 정보를 확인해 주세요</h1></div></div>
    <div class="banner"><span>${esc(PROVIDER[provider()] || '소셜')} 계정 <b>${esc(S.user?.email || meta.email || '')}</b>(으)로 로그인했습니다.</span></div>
    <label class="field"><span>이름 (다른 선생님에게 보이는 이름) <b class="hl">*</b></span><input class="inp" id="suName" maxlength="30" value="${esc(name)}" placeholder="예: 김수학" autocomplete="name"></label>
    <label class="field"><span>학교 (선택)</span><input class="inp" id="suSchool" maxlength="60" placeholder="예: ○○고등학교" autocomplete="organization"></label>
    <div class="field"><span>담당 과목 (선택, 여러 개 가능)</span>${subjChips('suSubj')}</div>
    <div class="agree">
      <label class="check all"><input type="checkbox" id="agAll" data-chg="agree"> <b>약관 전체 동의</b></label>
      <div class="agree-row"><label class="check"><input type="checkbox" id="agTerms" data-chg="agree"> <span><b class="hl">[필수]</b> 서비스 이용약관</span></label><button class="link" type="button" data-act="terms" data-v="terms">보기</button></div>
      <div class="agree-row"><label class="check"><input type="checkbox" id="agPrivacy" data-chg="agree"> <span><b class="hl">[필수]</b> 개인정보 수집·이용 동의</span></label><button class="link" type="button" data-act="terms" data-v="privacy">보기</button></div>
      <div class="agree-row"><label class="check"><input type="checkbox" id="agMkt" data-chg="agree"> <span>[선택] 새 기능 소식 받기</span></label></div>
    </div>
    <button class="btn primary block" id="suGo" type="button" data-act="signup" disabled style="min-height:52px;font-size:16px">가입 완료하고 시작하기</button>
    <button class="link" type="button" data-act="switchAccount" style="justify-self:center;font-size:13px">다른 계정으로 로그인</button>
  </div></div>`;
}
const TERMS_HTML = `<div class="terms">
<h3>제1조 (목적)</h3><p>이 약관은 ‘수학 도장노트’(이하 서비스)를 이용하는 선생님과 운영자 사이의 이용 조건을 정합니다. 서비스는 수학 수업의 도장·결석, 포트폴리오 점수, 최소 성취수준 보장지도 기록을 동료 선생님과 함께 관리하도록 돕습니다.</p>
<h3>제2조 (가입)</h3><p>Google 또는 카카오 계정으로 로그인한 뒤 이 약관과 개인정보 수집·이용에 동의하면 가입됩니다. 서비스는 교사와 교육 관계자를 위한 것입니다.</p>
<h3>제3조 (이용자의 의무)</h3><p>① 학생 정보는 수업과 평가 목적에 필요한 범위에서만 입력합니다.<br>② 소속 학교와 교육청의 개인정보 처리 지침을 따릅니다.<br>③ 반 코드는 함께 수업하는 선생님에게만 알려 줍니다.</p>
<h3>제4조 (서비스 제공)</h3><p>서비스는 무료로 제공되며, 기능이 바뀌거나 중단될 때는 앱 안에서 미리 알립니다. 중요한 기록은 엑셀·CSV로 주기적으로 내려받아 보관해 주세요.</p>
<h3>제5조 (탈퇴)</h3><p>앱의 ‘내 계정 → 회원 탈퇴’에서 언제든 탈퇴할 수 있으며, 탈퇴하면 계정 정보와 본인이 주인인 반(혼자 쓰는 반)이 바로 삭제됩니다.</p>
<h3>제6조 (책임)</h3><p>운영자는 서비스를 안정적으로 운영하도록 노력하며, 천재지변이나 외부 서비스(Google·카카오·Supabase) 장애처럼 운영자가 통제할 수 없는 사유로 생긴 손해에는 책임을 지지 않습니다.</p>
</div>`;
const PRIVACY_HTML = `<div class="terms">
<div class="tbl-wrap"><table><tbody>
<tr><th class="l">수집 항목</th><td class="l" style="white-space:normal">이름(표시 이름), 이메일, 로그인 계정 식별값(Google·카카오)<br>선택: 학교명, 담당 과목</td></tr>
<tr><th class="l">수집 목적</th><td class="l" style="white-space:normal">회원 확인, 반을 함께 쓰는 선생님에게 이름 표시, 수정 기록의 작성자 표시</td></tr>
<tr><th class="l">보유 기간</th><td class="l" style="white-space:normal"><b>회원 탈퇴 시까지</b> (탈퇴하면 바로 삭제)</td></tr>
<tr><th class="l">보관 위치</th><td class="l" style="white-space:normal">Supabase 서버 (대한민국 서울 리전)</td></tr>
</tbody></table></div>
<p>동의를 거부할 수 있으나, 거부하면 서비스를 이용할 수 없습니다.</p>
<h3>학생 정보 안내</h3><p>선생님이 입력하는 학생 번호·이름·출결·점수·지도 기록은 그 반에 승인된 선생님만 볼 수 있습니다. 입력과 이용은 소속 학교의 개인정보 처리 지침에 따라 주세요.</p>
</div>`;
/* ───────── 빈 화면 / 대기 ───────── */
function viewEmpty() {
  return `<div class="stack"><div class="empty">
    <div class="seal"><div class="d">시작</div></div>
    <h1 style="font-size:20px">반을 만들거나 참여하세요</h1>
    <p class="hint">반과 과목(공통수학2 · 미적분Ⅰ · 기하)을 정하고 학생 명단을 붙여 넣으면<br>수업마다 도장을 찍고 포트폴리오 점수가 자동으로 계산됩니다.</p>
    <div class="row" style="justify-content:center"><button class="btn primary" data-act="newClass" type="button">+ 새 반 만들기</button>
    <button class="btn outline" data-act="joinSheet" type="button">반 코드로 참여</button></div>
    <button class="link" data-act="loadSample" type="button">예시 반으로 연습해 보기</button>
  </div></div>`;
}
function viewPending(c) {
  return `<div class="stack"><div class="empty">
    <div class="seal"><div class="d">대기</div></div>
    <h1 style="font-size:20px">${esc(c.name)} 참여 승인을 기다리는 중입니다</h1>
    <p class="hint">반을 만든 선생님이 ‘반·설정’ 탭에서 승인하면 기록을 볼 수 있습니다.</p>
    <button class="btn" data-act="refresh" type="button">다시 확인</button>
  </div></div>`;
}

/* ───────── 수업·도장 ───────── */
function viewLesson() {
  const d = cd(), c = cls();
  if (ui.session) { const s = d.sessions.find(x => x.id === ui.session); if (s) return viewStamping(s); return `<div class="empty"><p class="hint">이 수업은 삭제되었거나 아직 불러오는 중입니다.</p><button class="btn" data-act="back" type="button">← 수업 목록</button></div>`; }
  const asc = sessionsAsc(), ord = new Map(asc.map((s, i) => [s.id, i + 1])), ss = asc.slice().reverse(), n = d.students.length;
  const t = today(), todays = asc.filter(s => s.date === t);
  const avg = n ? students().reduce((a, x) => a + stampStats(x.id).rate, 0) / n : 0;
  return `<div class="stack">
    ${installBanner()}
    <section class="hero">
      <div class="row between"><span class="eyebrow">TODAY · ${esc(SUBJECTS[c.subject].name)}</span><span class="role">${esc(ROLE[c.role] || '')}</span></div>
      <div class="big"><b>${md(t)}</b><span>${wd(t)}요일 · ${todays.length ? `오늘 수업 ${todays.length}개` : '오늘 수업 기록 없음'}</span></div>
      <button class="btn primary block" data-act="newSession" type="button">+ 오늘 수업 추가하고 도장 찍기</button>
      <div class="kpis"><span>학생<b>${n}</b>명</span><span>수업<b>${asc.length}</b>회</span><span>평균 도장률<b>${Math.round(avg)}</b>%</span></div>
    </section>
    ${!n ? `<div class="panel"><p class="hint">학생 명단이 비어 있습니다. ${st.canEdit() ? `<button class="link" data-act="tab" data-v="classes" type="button">반·설정 탭에서 학생 추가</button>` : '담당 선생님이 명단을 넣으면 보입니다.'}</p></div>` : ''}
    ${ss.length ? `<div class="sec-h"><span class="no">§ 01</span><h2>수업 기록</h2><span class="aside">${asc.length}회 · 최근 순</span></div><ul class="list">${ss.map(s => `<li><button class="s-card" data-act="openSession" data-id="${s.id}" type="button">
        <span class="s-ord">${String(ord.get(s.id)).padStart(2, '0')}</span>
        <div class="s-date"><b>${md(s.date)}</b><span>${wd(s.date)}${s.period ? ` · ${s.period}교시` : ''}</span></div>
        <div class="s-info"><strong>${esc(s.topic || subUnit(c.subject, s.unit) || '수업')}</strong>
          <span><span class="d">${md(s.date)}(${wd(s.date)}) · </span>${esc([pg(s.pages), unitLabel(c.subject, s.unit).split(' · ')[0]].filter(Boolean).join(' · '))}</span></div>
        <div class="s-cnt"><b>${cnt(s.stamps)}</b>/${n}<br>결석 ${cnt(s.absent)}</div></button></li>`).join('')}</ul>`
      : `<div class="empty"><p class="hint">아직 수업 기록이 없습니다.<br>오늘 수업을 추가하고 학생 이름을 눌러 도장을 찍어 보세요.</p></div>`}
  </div>`;
}
function viewStamping(s) {
  const c = cls(), list = students();
  const n = list.filter(x => s.stamps[x.id] && !s.absent[x.id]).length, ab = list.filter(x => s.absent[x.id]).length;
  const here = S.peers.filter(p => p.session === s.id);
  return `<div class="stack">
    <div class="row between"><button class="link" data-act="back" type="button">← 수업 목록</button>
      <button class="btn sm" data-act="editSession" data-id="${s.id}" type="button">수업 정보 수정</button></div>
    <div class="sess-head">
      <div class="eyebrow">${md(s.date)} (${wd(s.date)})${s.period ? ` · ${s.period}교시` : ''}</div>
      <h2>${esc(s.topic || subUnit(c.subject, s.unit) || '수업')}</h2>
      <div class="meta">${s.pages ? `<span class="pill red">${esc(pg(s.pages))}</span>` : ''}${s.unit ? `<span class="pill">${esc(unitLabel(c.subject, s.unit))}</span>` : ''}</div>
      ${s.memo ? `<p class="hint">${esc(s.memo)}</p>` : ''}
      ${here.length ? `<div class="peers"><span class="dot-live"></span>${here.map(p => esc(p.name || st.nameOf(p.id))).join(', ')} 선생님도 지금 이 수업을 함께 체크하고 있습니다.</div>` : ''}
    </div>
    <div class="seg" role="tablist">
      <button type="button" data-act="mode" data-v="stamp" class="${ui.mode === 'stamp' ? 'on' : ''}">도장 찍기</button>
      <button type="button" data-act="mode" data-v="absent" class="${ui.mode === 'absent' ? 'on' : ''}">결석 체크</button>
    </div>
    <p class="hint">${ui.mode === 'stamp' ? '학생 이름을 누르면 도장이 찍히고, 한 번 더 누르면 지워집니다.' : '결석한 학생을 누르세요. 결석 처리하면 그 수업 도장은 지워집니다.'}</p>
    ${list.length ? `<div class="tiles">${list.map(x => {
      const abs = s.absent[x.id], on = s.stamps[x.id] && !abs;
      return `<button type="button" class="tile ${on ? 'stamped' : ''} ${abs ? 'absent' : ''} ${ui.just === x.id ? 'just' : ''}" data-act="tap" data-sid="${x.id}" aria-pressed="${on ? 'true' : 'false'}">
        <span class="no">${String(x.no ?? '').padStart(2, '0')}</span><span class="nm">${esc(x.name)}</span>
        ${on ? sealHtml(s, x.id) : ''}${abs ? '<span class="ab-tag">결석</span>' : ''}</button>`; }).join('')}</div>`
      : `<div class="empty"><p class="hint">학생이 없습니다.</p></div>`}
  </div>
  <div class="actionbar"><div class="in">
    <div class="counts"><span class="st"><b>${n}</b>도장</span><span><b>${ab}</b>결석</span><span><b>${list.length - n - ab}</b>남음</span></div>
    <button class="btn primary" data-act="stampAll" type="button" ${list.length - n - ab ? '' : 'disabled'}>남은 학생 전체 도장</button>
  </div></div>`;
}
function sealHtml(s, sid) {
  const r = rot(sid, s.id);
  return `<span class="seal" style="--rot:${r}deg;transform:rotate(${r}deg)"><span class="d">${md(s.date)}</span>${s.pages ? `<span class="p">${esc(pg(s.pages))}</span>` : ''}</span>`;
}

/* ───────── 포트폴리오 ───────── */
function viewPortfolio() {
  const d = cd(), list = students(), ss = sessionsAsc();
  if (ui.student) { const x = d.students.find(s => s.id === ui.student); if (x) return viewBook(x); ui.student = null; }
  const seg = `<div class="seg"><button type="button" data-act="pf" data-v="cards" class="${ui.pf === 'cards' ? 'on' : ''}">학생별 도장판</button><button type="button" data-act="pf" data-v="table" class="${ui.pf === 'table' ? 'on' : ''}">전체 출석·도장표</button></div>`;
  let body;
  if (ui.pf === 'table') {
    body = ss.length && list.length ? `<div class="row between"><p class="hint">칸을 누르면 도장을 찍거나 지웁니다. 표는 옆으로 밀어서 보세요.</p><button class="btn sm" data-act="csvAttend" type="button">CSV 저장</button></div>
    <div class="tbl-wrap"><table><thead><tr><th class="l sticky-c">학생</th>${ss.map(s => `<th>${md(s.date)}<br><span style="font-weight:400">${esc(pg(s.pages) || '-')}</span></th>`).join('')}<th>도장</th><th>결석</th></tr></thead>
    <tbody>${list.map(x => { const t = stampStats(x.id); return `<tr><td class="l sticky-c"><span class="num" style="color:var(--muted)">${x.no ?? ''}</span> ${esc(x.name)}</td>${ss.map(s => {
      const ab = s.absent[x.id], on = s.stamps[x.id];
      return `<td><button class="cellbtn" type="button" data-act="cell" data-sid="${x.id}" data-ses="${s.id}" aria-label="${esc(x.name)} ${md(s.date)}">${ab ? '<span class="dot ab">결</span>' : on ? '<span class="dot">印</span>' : '<span class="dot no">·</span>'}</button></td>`; }).join('')}
      <td class="num">${t.stamps}</td><td class="num">${t.absent}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="empty"><p class="hint">수업과 학생이 있어야 표가 만들어집니다.</p></div>`;
  } else {
    body = list.length ? `<ul class="list">${list.map(x => { const t = stampStats(x.id);
      return `<li><button class="stu-row" type="button" data-act="openStudent" data-sid="${x.id}">
        <span class="no">${x.no ?? ''}</span>
        <span style="min-width:0"><span class="nm">${esc(x.name)}</span><span class="sub"> · 도장 ${t.stamps} · 결석 ${t.absent} · 빠짐 ${t.missed}</span>
        <div class="bar"><i style="width:${Math.min(100, t.rate).toFixed(0)}%"></i></div></span>
        <span class="num" style="font-weight:700;color:var(--accent)">${Math.round(t.rate)}%</span></button></li>`; }).join('')}</ul>`
      : `<div class="empty"><p class="hint">학생이 없습니다.</p></div>`;
  }
  return `<div class="stack"><div class="head"><div><h1>포트폴리오</h1><p>수업 ${ss.length}회 · 도장률은 ${d.scoring.stamp.excludeAbsent ? '결석한 수업을 빼고' : '전체 수업 기준으로'} 계산합니다.</p></div></div>${seg}${body}</div>`;
}
function viewBook(x) {
  const ss = sessionsAsc(), t = stampStats(x.id), sc = stampScore(x.id), c = cls();
  return `<div class="stack">
    <div><button class="link" data-act="closeStudent" type="button">← 학생 목록</button></div>
    <div class="panel stack">
      <div class="head"><div><div class="eyebrow">NO. ${x.no ?? ''}</div><h1>${esc(x.name)}</h1></div>
        ${sc != null ? `<span class="pill red">도장 점수 ${n1(sc)} / ${n1(stampMax())}</span>` : ''}</div>
      <div class="stats">
        <div class="stat"><b>${t.stamps}</b><span>도장</span></div>
        <div class="stat"><b>${t.absent}</b><span>결석</span></div>
        <div class="stat"><b>${t.missed}</b><span>빠진 도장</span></div>
        <div class="stat"><b>${Math.round(t.rate)}%</b><span>도장률</span></div>
      </div>
    </div>
    <div class="panel"><h2>도장판</h2>
    ${ss.length ? `<div class="book">${ss.map(s => {
      const ab = s.absent[x.id], on = s.stamps[x.id] && !ab;
      return `<button type="button" class="book-cell" data-act="cell" data-sid="${x.id}" data-ses="${s.id}">
        ${on ? sealHtml(s, x.id) : ab ? `<span class="hole ab">결석</span>` : `<span class="hole">${md(s.date)}<br>${esc(pg(s.pages))}</span>`}
        <span class="cap">${md(s.date)} ${esc(pg(s.pages))}</span><span class="cap">${esc(s.topic || subUnit(c.subject, s.unit) || '')}</span></button>`; }).join('')}</div>
      <p class="hint" style="margin-top:12px">빈 칸을 누르면 도장을 찍을 수 있습니다. 결석은 수업 화면의 ‘결석 체크’에서 바꿉니다.</p>`
      : '<p class="hint">수업 기록이 없습니다.</p>'}
    </div></div>`;
}

/* ───────── 점수 ───────── */
function viewScore() {
  const edit = st.canEdit();
  if (!edit && ui.sc !== 'table') ui.sc = 'table';
  const seg = `<div class="seg">
    <button type="button" data-act="sc" data-v="table" class="${ui.sc === 'table' ? 'on' : ''}">점수표</button>
    ${edit ? `<button type="button" data-act="sc" data-v="entry" class="${ui.sc === 'entry' ? 'on' : ''}">항목 입력</button>
    <button type="button" data-act="sc" data-v="setup" class="${ui.sc === 'setup' ? 'on' : ''}">급간·항목 설정</button>` : ''}</div>`;
  const body = ui.sc === 'entry' ? scoreEntry() : ui.sc === 'setup' ? scoreSetup() : scoreTable();
  return `<div class="stack"><div class="head"><div><h1>포트폴리오 점수</h1><p>만점 <b class="hl num">${n1(totalMax())}</b>점 · 도장 급간 + 추가 항목 ${cd().scoring.items.length}개</p></div></div>
    ${edit ? '' : '<div class="banner warn">협력 교사는 점수를 볼 수만 있습니다. 입력은 담당 교사가 합니다.</div>'}${seg}${body}</div>`;
}
function scoreTable() {
  const d = cd(), list = students(), items = d.scoring.items, on = d.scoring.stamp.enabled;
  if (!list.length) return `<div class="empty"><p class="hint">학생이 없습니다.</p></div>`;
  const totals = list.map(x => totalFor(x.id)), avg = totals.reduce((a, b) => a + b, 0) / list.length;
  return `<div class="row between"><p class="hint">미입력 항목은 0점으로 합산합니다.</p><div class="row"><button class="btn sm" data-act="copyScores" type="button">엑셀용 복사</button><button class="btn sm" data-act="csvScores" type="button">CSV 저장</button></div></div>
  <div class="tbl-wrap"><table><thead><tr><th class="l sticky-c">학생</th>${on ? `<th>도장률</th><th>도장<br>(${n1(stampMax())})</th>` : ''}${items.map(it => `<th>${esc(it.name)}<br>(${n1(itemMax(it))})</th>`).join('')}<th>총점<br>(${n1(totalMax())})</th></tr></thead>
  <tbody>${list.map((x, i) => { const t = stampStats(x.id); return `<tr><td class="l sticky-c"><span class="num" style="color:var(--muted)">${x.no ?? ''}</span> ${esc(x.name)}</td>
    ${on ? `<td class="num">${Math.round(t.rate)}%</td><td class="num">${n1(stampScore(x.id))}</td>` : ''}
    ${items.map(it => { const v = itemScore(it, x.id); return `<td class="num" ${v == null ? 'style="color:var(--muted)"' : ''}>${v == null ? '미입력' : n1(v)}</td>`; }).join('')}
    <td class="num total">${n1(totals[i])}</td></tr>`; }).join('')}</tbody>
  <tfoot><tr><td class="l sticky-c">평균</td>${on ? '<td></td><td></td>' : ''}${items.map(() => '<td></td>').join('')}<td class="num">${n1(avg)}</td></tr></tfoot></table></div>`;
}
function scoreEntry() {
  const d = cd(), items = d.scoring.items, list = students();
  if (!items.length) return `<div class="empty"><p class="hint">추가 항목이 없습니다. ‘급간·항목 설정’에서 오답노트, 모의고사 풀이 업로드, 피드백 같은 항목을 만들어 보세요.</p><button class="btn primary" data-act="sc" data-v="setup" type="button">항목 만들기</button></div>`;
  if (!items.find(i => i.id === ui.item)) ui.item = items[0].id;
  const it = items.find(i => i.id === ui.item), vals = d.itemScores[it.id] || {};
  const done = list.filter(x => vals[x.id] != null && vals[x.id] !== '').length;
  return `<div class="chips">${items.map(i => `<button type="button" class="chip ${i.id === ui.item ? 'on' : ''}" data-act="pickItem" data-id="${i.id}">${esc(i.name)}</button>`).join('')}</div>
  <div class="panel"><div class="row between"><div><h2 style="margin:0">${esc(it.name)}</h2><p class="hint">${esc(itemDesc(it))} · 입력 ${done}/${list.length}명</p></div>
    ${it.type === 'check' ? `<button class="btn sm" data-act="allCheck" type="button">미입력 전원 제출</button>` : ''}</div>
  ${list.map(x => { const v = vals[x.id]; let ctl;
    if (it.type === 'check') ctl = `<div class="chips"><button type="button" class="chip ${v === 1 ? 'on' : ''}" data-act="setVal" data-sid="${x.id}" data-v="1">제출 (${it.on})</button><button type="button" class="chip ${v === 0 ? 'on off' : ''}" data-act="setVal" data-sid="${x.id}" data-v="0">미제출 (${it.off})</button></div>`;
    else if (it.type === 'level') ctl = `<div class="chips">${it.levels.map((l, i) => `<button type="button" class="chip ${v === i ? 'on' : ''}" data-act="setVal" data-sid="${x.id}" data-v="${i}">${esc(l.label)} · ${l.score}</button>`).join('')}</div>`;
    else ctl = `<div class="row"><input class="inp sm" type="number" inputmode="decimal" min="0" max="${it.max}" step="0.5" id="v-${it.id}-${x.id}" data-chg="numVal" data-sid="${x.id}" value="${v ?? ''}"><span class="hint">/ ${it.max}점</span></div>`;
    return `<div class="entry"><span class="no">${x.no ?? ''}</span><strong>${esc(x.name)}</strong><div class="ctl">${ctl}</div></div>`; }).join('')}
  </div>`;
}
function scoreSetup() {
  const cfg = cd().scoring.stamp, items = cd().scoring.items, unit = cfg.mode === 'rate' ? '%' : '개';
  const bands = cfg.bands.map((b, i) => ({ ...b, i })).sort((a, b) => b.min - a.min);
  return `<div class="panel stack">
    <div class="row between"><h2 style="margin:0">도장 급간</h2>
      <label class="check"><input type="checkbox" id="stampOn" data-chg="stampOn" ${cfg.enabled ? 'checked' : ''}> 점수에 반영</label></div>
    <div class="seg"><button type="button" data-act="stampMode" data-v="rate" class="${cfg.mode === 'rate' ? 'on' : ''}">도장률(%) 기준</button><button type="button" data-act="stampMode" data-v="count" class="${cfg.mode === 'count' ? 'on' : ''}">도장 개수 기준</button></div>
    ${cfg.mode === 'rate' ? `<label class="check"><input type="checkbox" id="exAb" data-chg="exAb" ${cfg.excludeAbsent ? 'checked' : ''}> 결석한 수업은 도장률 계산에서 빼기</label>` : ''}
    <div>${bands.map(b => `<div class="bandrow">
      <label>${cfg.mode === 'rate' ? '도장률' : '도장'} <input class="inp sm num" type="number" inputmode="decimal" id="bmin-${b.i}" data-chg="band" data-i="${b.i}" data-k="min" value="${b.min}"> ${unit} 이상</label>
      <span class="hint">→</span>
      <label><input class="inp sm num" type="number" inputmode="decimal" step="0.5" id="bsc-${b.i}" data-chg="band" data-i="${b.i}" data-k="score" value="${b.score}"> 점</label>
      <button class="x" type="button" data-act="delBand" data-i="${b.i}" aria-label="급간 삭제">✕</button></div>`).join('')}
      <div class="bandrow"><label>그 외 (최하 급간)</label><span class="hint">→</span><label><input class="inp sm num" type="number" inputmode="decimal" step="0.5" id="floor" data-chg="floor" value="${cfg.floor}"> 점</label><span></span></div>
    </div>
    <div class="row between"><button class="btn sm" data-act="addBand" type="button">+ 급간 추가</button><span class="hint">도장 만점 <b class="hl num">${n1(stampMax())}</b>점</span></div>
  </div>
  <div class="panel">
    <h2>추가 항목</h2>
    <p class="hint">도장 외에 따로 점수를 주는 항목입니다. 학생별 점수는 ‘항목 입력’에서 넣습니다.</p>
    <div style="margin-top:6px">${items.length ? items.map(it => `<div class="item-row"><div style="min-width:0"><strong>${esc(it.name)}</strong><span>${esc(itemDesc(it))} · 만점 ${n1(itemMax(it))}</span></div>
      <button class="btn sm" data-act="editItem" data-id="${it.id}" type="button">수정</button></div>`).join('') : '<p class="hint" style="padding:8px 0">아직 항목이 없습니다.</p>'}</div>
    <div class="eyebrow" style="margin:12px 0 6px">새 항목 만들기</div>
    <div class="chips">
      <button type="button" class="chip" data-act="newItem" data-v="wrong">+ 중간고사 오답노트</button>
      <button type="button" class="chip" data-act="newItem" data-v="mock">+ 홈페이지 모의고사 풀이 업로드</button>
      <button type="button" class="chip" data-act="newItem" data-v="feedback">+ 피드백</button>
      <button type="button" class="chip" data-act="newItem" data-v="custom">+ 직접 만들기</button>
    </div>
  </div>`;
}
const lvRow = l => `<div class="bandrow lvrow"><label>이름 <input class="inp sm lv-label" style="width:auto" value="${esc(l.label)}"></label><span class="hint">→</span><label><input class="inp sm num lv-score" type="number" inputmode="decimal" step="0.5" value="${l.score}"> 점</label><button class="x" type="button" data-act="delLv" aria-label="단계 삭제">✕</button></div>`;
function itemSheet(it, isNew) {
  openSheet(isNew ? '항목 만들기' : '항목 수정', `
    <label class="field"><span>항목 이름</span><input class="inp" id="itName" value="${esc(it.name)}" placeholder="예: 수행평가 풀이 노트"></label>
    <label class="field"><span>채점 방식</span><select class="inp" id="itType" data-chg="itType">
      <option value="check" ${it.type === 'check' ? 'selected' : ''}>제출 / 미제출</option>
      <option value="level" ${it.type === 'level' ? 'selected' : ''}>단계별 점수 (상·중·하, 횟수 등)</option>
      <option value="number" ${it.type === 'number' ? 'selected' : ''}>점수 직접 입력</option></select></label>
    <div id="tyCheck" ${it.type === 'check' ? '' : 'hidden'} class="grid2">
      <label class="field"><span>제출 점수</span><input class="inp num" type="number" inputmode="decimal" step="0.5" id="itOn" value="${it.on ?? 5}"></label>
      <label class="field"><span>미제출 점수</span><input class="inp num" type="number" inputmode="decimal" step="0.5" id="itOff" value="${it.off ?? 0}"></label></div>
    <div id="tyLevel" ${it.type === 'level' ? '' : 'hidden'}><div id="lvList">${(it.levels || [{ label: '상', score: 5 }, { label: '중', score: 4 }, { label: '하', score: 3 }]).map(lvRow).join('')}</div>
      <button class="btn sm" type="button" data-act="addLv" style="margin-top:8px">+ 단계 추가</button></div>
    <div id="tyNumber" ${it.type === 'number' ? '' : 'hidden'}><label class="field"><span>만점</span><input class="inp num" type="number" inputmode="decimal" id="itMax" value="${it.max ?? 10}"></label></div>
    <div class="row end">${isNew ? '' : `<button class="btn danger" type="button" data-act="delItem" data-id="${it.id}">삭제</button>`}<button class="btn primary" type="button" data-act="saveItem" data-id="${it.id || ''}">저장</button></div>`);
}

/* ───────── 최성보 ───────── */
function viewCsb() {
  const d = cd(), c = cls(), list = students(), edit = st.canEdit();
  const rows = list.map(x => ({ x, s: csbStatus(x.id) }));
  const n = { bad: 0, warn: 0, ok: 0 }; rows.forEach(r => n[r.s.level]++);
  const shown = ui.csbFilter === 'target' ? rows.filter(r => r.s.level !== 'ok') : rows;
  return `<div class="page">
    <div class="head"><div><h1>최성보</h1><p>최소 성취수준 보장지도 · 출석률 2/3 이상, 학업성취율 ${d.csb.threshold}% 이상이면 이수</p></div></div>
    ${sec('01', '현황', `<div class="sum-chips">
      <div class="sum bad"><b>${n.bad}</b><span>보충지도 대상</span></div>
      <div class="sum warn"><b>${n.warn}</b><span>예방지도 권장</span></div>
      <div class="sum ok"><b>${n.ok}</b><span>도달·이수</span></div></div>`)}
    <details class="fold"><summary><span class="no">§ 02</span><span class="t">기준 · 내보내기</span><small>${c.hours}시간 · 결석 허용 ${Math.floor(c.hours / 3)}시간 · 기준 ${d.csb.threshold}%</small></summary><div class="body">
      ${edit ? `<div class="grid2">
        <label class="field"><span>과목 총 수업 시수</span><input class="inp num" type="number" inputmode="numeric" id="csbHours" data-chg="csbHours" value="${c.hours}"></label>
        <label class="field"><span>기준 학업성취율 (%)</span><input class="inp num" type="number" inputmode="numeric" id="csbTh" data-chg="csbTh" value="${d.csb.threshold}"></label></div>` : ''}
      <p class="hint">결석 허용은 총 시수의 1/3입니다. 결석은 수업 화면의 결석 체크에서 자동으로 셉니다. 학업성취율은 학생을 눌러 입력하세요.</p>
      <div class="row"><button class="btn sm" data-act="copyCsb" type="button">엑셀용 복사</button><button class="btn sm" data-act="csvCsb" type="button">CSV 저장</button></div>
    </div></details>
    <section class="sec"><div class="sec-h"><span class="no">§ 03</span><h2>학생별</h2></div>
    <div class="seg"><button type="button" data-act="csbFilter" data-v="all" class="${ui.csbFilter === 'all' ? 'on' : ''}">전체 ${rows.length}명</button><button type="button" data-act="csbFilter" data-v="target" class="${ui.csbFilter === 'target' ? 'on' : ''}">지도 필요 ${n.bad + n.warn}명</button></div>
    ${shown.length ? `<ul class="list">${shown.map(({ x, s }) => `<li><button class="csb-row" type="button" data-act="openCsb" data-sid="${x.id}">
      <span class="no">${x.no ?? ''}</span>
      <span style="min-width:0"><strong>${esc(x.name)}</strong>
        <span class="facts"><span>결석 <b>${s.st.absent}</b>/${s.allow}</span><span>성취율 <b>${s.info.rate == null || s.info.rate === '' ? '-' : s.info.rate + '%'}</b></span><span>지도 <b>${s.logs.length}</b>회 ${n1(s.hours)}h</span></span>
        ${s.reasons.length && !s.info.done ? `<span class="facts">${esc(s.reasons.join(' · '))}</span>` : ''}</span>
      <span class="pill ${s.level}">${s.label}</span></button></li>`).join('')}</ul>`
      : `<div class="empty"><p class="hint">${list.length ? '지도가 필요한 학생이 없습니다.' : '학생이 없습니다.'}</p></div>`}
    </section>
  </div>`;
}
function csbSheet(sid) {
  const x = cd().students.find(s => s.id === sid); if (!x) return;
  const s = csbStatus(sid), info = s.info, edit = st.canEdit();
  openSheet(`${x.no ?? ''}번 ${x.name}`, `
    <div class="row"><span class="pill ${s.level}">${s.label}</span>${s.reasons.map(r => `<span class="pill">${esc(r)}</span>`).join('')}</div>
    <div class="stats">
      <div class="stat"><b>${s.st.absent}</b><span>결석(시간)</span></div>
      <div class="stat"><b>${Math.max(s.left, 0)}</b><span>결석 가능 잔여</span></div>
      <div class="stat"><b>${Math.round(s.st.rate)}%</b><span>도장률</span></div>
      <div class="stat"><b>${n1(s.hours)}</b><span>지도 시간</span></div>
    </div>
    ${edit ? `<div class="grid2">
      <label class="field"><span>학업성취율 (%)</span><input class="inp num" type="number" inputmode="decimal" id="cRate" value="${info.rate ?? ''}" placeholder="예: 38"></label>
      <label class="check" style="align-self:end;min-height:44px"><input type="checkbox" id="cDone" ${info.done ? 'checked' : ''}> 이수 확인 (지도 완료)</label>
    </div>
    <label class="field"><span>메모</span><input class="inp" id="cMemo" value="${esc(info.memo || '')}" placeholder="학생 특이사항"></label>
    <button class="btn primary" type="button" data-act="saveCsb" data-sid="${sid}">저장</button>` : (info.memo ? `<p class="hint">메모: ${esc(info.memo)}</p>` : '')}
    <div class="eyebrow" style="margin-top:6px">지도 기록 ${s.logs.length}건</div>
    ${s.logs.length ? [...s.logs].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(l => `<div class="log k-${esc(l.kind)}">
      <div class="row between"><strong>${esc(l.kind)} · ${md(l.date)} · ${n1(l.hours)}시간</strong>${edit ? `<button class="x" type="button" data-act="delLog" data-sid="${sid}" data-id="${l.id}" aria-label="기록 삭제">✕</button>` : ''}</div>
      <span>${esc(l.content)}</span><span class="t">결과: ${esc(l.result)}${l.created_by ? ` · 기록 ${esc(st.nameOf(l.created_by))}` : ''}</span></div>`).join('') : '<p class="hint">아직 지도 기록이 없습니다.</p>'}
    ${edit ? `<div class="panel stack" style="background:var(--sunk)">
      <h3>지도 기록 추가</h3>
      <div class="grid2">
        <label class="field"><span>날짜</span><input class="inp" type="date" id="lDate" value="${today()}"></label>
        <label class="field"><span>유형</span><select class="inp" id="lKind"><option>예방지도</option><option ${s.level === 'bad' ? 'selected' : ''}>보충지도</option></select></label>
        <label class="field"><span>시간</span><input class="inp num" type="number" inputmode="decimal" step="0.5" id="lHours" value="1"></label>
        <label class="field"><span>결과</span><select class="inp" id="lResult"><option>진행 중</option><option>도달</option><option>미도달</option></select></label>
      </div>
      <label class="field"><span>지도 내용</span><textarea class="inp" id="lContent" placeholder="예: 직선의 방정식 기본 문항 10개 재풀이, 오답 설명"></textarea></label>
      <button class="btn primary" type="button" data-act="addLog" data-sid="${sid}">기록 추가</button>
    </div>` : ''}`);
}

/* ───────── 설정 (메뉴 → 하위 화면) ───────── */
const ICON = {
  info: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  students: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"/><path d="M16 5a3 3 0 010 6M18 14.5c1.6.7 2.6 2.3 3 4.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  archive: '<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V9M10 13h4"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5zM20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  out: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10"/>'
};
const THEME_NAME = { dark: '다크 (기본)', light: '라이트', system: '휴대폰 설정 따르기' };
function getTheme() { try { return localStorage.getItem('ms:theme') || 'dark'; } catch (e) { return 'dark'; } }
function setTheme(t) { try { localStorage.setItem('ms:theme', t); } catch (e) {} document.documentElement.dataset.theme = t; }
const menuRow = (v, icon, title, sub = '', extra = '', act = 'go', cls = '') =>
  `<button class="menu-row ${cls}" type="button" data-act="${act}" data-v="${v}"><svg viewBox="0 0 24 24">${ICON[icon]}</svg><span style="min-width:0"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${extra || '<span></span>'}<span class="chev">›</span></button>`;
const sec = (no, title, body, aside = '') => `<section class="sec"><div class="sec-h"><span class="no">§ ${no}</span><h2>${title}</h2>${aside ? `<span class="aside">${aside}</span>` : ''}</div>${body}</section>`;
const subhead = (back = '설정') => `<div class="subhead"><button class="back" type="button" data-act="back2">${esc(back)}</button></div>`;
const chip = (on, act, k, v, label, cls = '') => `<button type="button" class="chip ${on ? 'on' : ''} ${cls}" data-act="${act}" data-k="${k}" data-v="${esc(v)}" aria-pressed="${on}">${label}</button>`;

function viewSettings() {
  const c = cls(), active = c && c.status === 'active', owner = active && st.isOwner(), edit = active && st.canEdit();
  const loaded = active && cd().loaded, mem = loaded ? cd().members : [];
  const pend = mem.filter(m => m.status === 'pending').length, act = mem.filter(m => m.status === 'active').length;
  return `<div class="page">
    <h1 class="page-title">설정</h1>
    <button class="profile-card" type="button" data-act="go" data-v="account"><span class="me-btn big">${esc((S.me.name || '나').slice(0, 1))}</span>
      <span style="min-width:0;flex:1"><strong>${esc(S.me.name || '')} 선생님</strong><small>${esc(S.me.school || '학교 미입력')} · ${esc(PROVIDER[provider()] || '')} 로그인</small></span><span class="chev" style="color:var(--muted);font-size:20px">›</span></button>
    ${active ? `<div class="menu-label">${esc(c.name)} · ${esc(SUBJECTS[c.subject]?.name || '')}</div><div class="menu">
      ${menuRow('clsInfo', 'info', '반 정보', '학년·반 · 과목 · 학기 · 수업 시수')}
      ${menuRow('students', 'students', '학생 명단', loaded ? `${cd().students.length}명` : '')}
      ${menuRow('members', 'team', '함께 쓰는 선생님', `${act || 1}명 · 반 코드 ${esc(c.id)}`, pend && owner ? `<span class="badge">${pend}</span>` : '')}
      ${menuRow('audit', 'clock', '수정 기록', '누가 언제 무엇을 바꿨는지')}
      ${edit ? menuRow('semester', 'archive', '학기 넘기기', '보관 · 같은 명단으로 새 반') : ''}
      ${menuRow('units', 'book', '단원 보기', '2022 개정 교육과정')}
    </div>` : ''}
    <div class="menu-label">반</div><div class="menu">
      ${menuRow('classList', 'list', '반 목록 · 바꾸기', `${S.classes.length}개`)}
      ${menuRow('newClass', 'plus', '새 반 만들기', '과목 · 학년 · 반 선택')}
      ${menuRow('join', 'key', '반 코드로 참여', '동료 선생님의 반에 참여 요청')}
    </div>
    <div class="menu-label">앱</div><div class="menu">
      ${menuRow('theme', 'moon', '화면 모드', THEME_NAME[getTheme()])}
      ${menuRow('install', 'phone', '휴대폰에 설치', '홈 화면에 앱처럼 두기')}
      ${menuRow('terms', 'doc', '약관 · 개인정보 안내')}
      ${menuRow('', 'out', '로그아웃', '', '', 'logout', 'danger')}
    </div>
  </div>`;
}

/* 반 만들기 · 반 정보 (같은 양식) */
function termChoices() { const d = new Date(), y = d.getFullYear(); return [`${y}학년도 1학기`, `${y}학년도 2학기`, `${y + 1}학년도 1학기`]; }
function defaultTerm() { const d = new Date(); return `${d.getFullYear()}학년도 ${d.getMonth() + 1 >= 8 ? 2 : 1}학기`; }
function formFromClass(c) {
  let grade = c.grade ?? null, room = c.room ?? '', roomText = '';
  if (!grade) { const m = String(c.name || '').match(/^\s*(\d)\s*학년\s*(.*)$/); if (m) { grade = Number(m[1]); room = m[2].replace(/반$/, '').trim(); } }
  if (room && !/^\d{1,2}$/.test(String(room))) { roomText = String(room); room = 'custom'; }
  return { subject: c.subject, grade, room: room ? String(room) : null, roomText, term: c.term || defaultTerm(), hours: c.hours || 64, hoursText: '' };
}
function formName(f) {
  if (!f.grade || !f.room) return '';
  if (f.room === 'custom') return f.roomText.trim() ? (/학년/.test(f.roomText) ? f.roomText.trim() : `${f.grade}학년 ${f.roomText.trim()}`) : '';
  return `${f.grade}학년 ${f.room}반`;
}
function viewClassForm() {
  const pg_ = ui.page, f = ui.form, edit = pg_.name === 'clsInfo', c = cls();
  if (edit && !st.canEdit()) {
    return `<div class="page">${subhead()}<h1 class="page-title">반 정보</h1>
      <div class="summary"><span class="k">이 반</span><span class="v">${esc(c.name)}</span><span class="m">${esc(SUBJECTS[c.subject]?.name)} · ${esc(c.term || '')} · ${c.hours}시간</span></div>
      <p class="hint">반 정보는 담당 교사가 바꿀 수 있습니다.</p></div>`;
  }
  const name = formName(f), terms = [...new Set([...termChoices(), f.term].filter(Boolean))];
  const ready = !!(f.subject && name && f.term && f.hours);
  return `<div class="page">${subhead()}
    <h1 class="page-title">${edit ? '반 정보' : pg_.copy ? '같은 명단으로 새 반' : '새 반 만들기'}</h1>
    ${sec('01', '과목', `<div class="opts">${Object.entries(SUBJECTS).map(([id, s]) => `<button type="button" class="opt ${f.subject === id ? 'on' : ''}" data-act="fset" data-k="subject" data-v="${id}" aria-pressed="${f.subject === id}"><b>${s.name}</b><span class="kind">${s.kind}</span><small>${s.units.map(u => u[0]).join('  ')}</small></button>`).join('')}</div>`)}
    ${sec('02', '학년 · 반', `<div class="chips grid4" style="grid-template-columns:repeat(3,1fr)">${[1, 2, 3].map(g => chip(f.grade === g, 'fset', 'grade', g, g + '학년')).join('')}</div>
      <div class="chips grid5">${Array.from({ length: 15 }, (_, i) => String(i + 1)).map(r => chip(f.room === r, 'fset', 'room', r, r + '반')).join('')}</div>
      ${chip(f.room === 'custom', 'fset', 'room', 'custom', '직접 입력 (예: 미적분 A반, 심화반)')}
      ${f.room === 'custom' ? `<input class="inp" id="fRoomText" data-inp="roomText" maxlength="30" value="${esc(f.roomText)}" placeholder="예: 미적분 A반">` : ''}`)}
    ${sec('03', '학기 · 수업 시수', `<div class="chips">${terms.map(t => chip(f.term === t, 'fset', 'term', t, t)).join('')}</div>
      <div class="chips grid4">${[32, 48, 64, 80].map(h => chip(Number(f.hours) === h, 'fset', 'hours', h, h + '시간')).join('')}</div>
      <p class="hint">4학점 과목은 <b class="hl">64시간</b>(학점당 16회)이 기본입니다. 최성보의 결석 허용 시간(1/3)을 계산할 때 씁니다.</p>`)}
    <div class="summary"><span class="k">${edit ? '저장할 내용' : '새로 만들 반'}</span><span class="v" id="sumName">${esc(name || '학년·반을 골라 주세요')}</span>
      <span class="m">${esc(SUBJECTS[f.subject]?.name || '과목 미선택')} · ${esc(f.term || '')} · ${f.hours}시간${pg_.copy ? ` · 학생 ${cd().students.length}명 복사` : ''}</span></div>
  </div>
  <div class="actionbar"><div class="in"><button class="btn primary lg" type="button" data-act="saveClassForm" id="fSave" ${ready ? '' : 'disabled'}>${edit ? '저장' : '반 만들기'}</button></div></div>`;
}

/* 수업 추가 · 수정 (달력 + 교시 + 단원) */
function calendar(f) {
  const [y, m] = f.ym, first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate(), t = today();
  const has = new Set(cd().sessions.map(s => s.date));
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="day out"></span>');
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(`<button type="button" class="day ${ds === f.date ? 'on' : ''} ${ds === t ? 'today' : ''} ${has.has(ds) ? 'has' : ''}" data-act="calPick" data-v="${ds}" aria-label="${m}월 ${d}일">${d}</button>`);
  }
  return `<div class="cal"><div class="cal-h"><button type="button" data-act="calMove" data-v="-1" aria-label="이전 달">‹</button><b>${y}년 ${m}월</b><button type="button" data-act="calMove" data-v="1" aria-label="다음 달">›</button></div>
    <div class="cal-g">${WD.map((w, i) => `<span class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}${cells.join('')}</div></div>`;
}
function viewSessionForm() {
  const c = cls(), f = ui.sform, edit = !!f.id, units = SUBJECTS[c.subject].units;
  const topicPh = f.unitI != null && f.unitJ != null ? units[f.unitI][1][f.unitJ] : '예: 직선의 방정식';
  return `<div class="page">${subhead(edit ? '도장 화면' : '수업 목록')}
    <h1 class="page-title">${edit ? '수업 정보 수정' : '수업 추가'}</h1>
    ${sec('01', '날짜', calendar(f), `${md(f.date)} (${wd(f.date)})`)}
    ${sec('02', '교시', `<div class="chips grid4">${[1, 2, 3, 4, 5, 6, 7, 8].map(p => chip(Number(f.period) === p, 'sset', 'period', p, p + '교시')).join('')}</div>
      ${chip(!f.period, 'sset', 'period', '', '교시 선택 안 함')}`)}
    ${sec('03', '단원 · ' + esc(SUBJECTS[c.subject].name), `<div class="chips">${units.map((u, i) => chip(f.unitI === i, 'sset', 'unitI', i, esc(u[0]))).join('')}</div>
      ${f.unitI != null ? `<div class="chips">${units[f.unitI][1].map((n, j) => chip(f.unitJ === j, 'sset', 'unitJ', j, esc(n))).join('')}</div>` : '<p class="hint">대단원을 고르면 소단원이 나옵니다.</p>'}`)}
    ${sec('04', '수업 내용', `<label class="field"><span>학습 주제</span><input class="inp" id="sTopic" data-inp="topic" value="${esc(f.topic)}" placeholder="${esc(topicPh)} (비우면 소단원 이름)"></label>
      <label class="field"><span>교재 페이지</span><input class="inp" id="sPages" data-inp="pages" value="${esc(f.pages)}" placeholder="예: 34-41"></label>
      <label class="field"><span>메모 (선택)</span><input class="inp" id="sMemo" data-inp="memo" value="${esc(f.memo)}" placeholder="예: 쪽지 시험, 활동지 배부"></label>
      ${edit && st.canEdit() ? `<button class="btn danger" type="button" data-act="delSession" data-id="${f.id}">이 수업 삭제</button>` : ''}`)}
  </div>
  <div class="actionbar"><div class="in"><button class="btn primary lg" type="button" data-act="saveSessionForm">${edit ? '저장' : '추가하고 도장 찍기'}</button></div></div>`;
}

/* 하위 화면들 */
function viewAccount() {
  const me = S.me, p = provider();
  return `<div class="page">${subhead()}<h1 class="page-title">내 계정</h1>
    <div class="profile-card" style="cursor:default"><span class="me-btn big">${esc((me.name || '나').slice(0, 1))}</span><span style="min-width:0"><strong>${esc(me.name || '')} 선생님</strong><small>${esc(PROVIDER[p] || '')} · ${esc(S.user?.email || '')}</small></span></div>
    ${sec('01', '내 정보', `<label class="field"><span>이름</span><input class="inp" id="pName" maxlength="30" value="${esc(me.name || '')}"></label>
      <label class="field"><span>학교</span><input class="inp" id="pSchool" maxlength="60" value="${esc(me.school || '')}" placeholder="예: ○○고등학교"></label>
      <div class="field"><span>담당 과목</span>${subjChips('pSubj', me.subjects || [])}</div>
      <button class="btn primary" type="button" data-act="saveProfile">정보 저장</button>`)}
    ${sec('02', '로그인', `<div class="grid2"><button class="btn" type="button" data-act="logout">로그아웃</button><button class="btn" type="button" data-act="switchAccount">다른 계정으로 로그인</button></div>
      ${S.outbox.length ? `<p class="hint" style="color:var(--warn)">아직 서버에 저장되지 않은 변경 ${S.outbox.length}건이 있습니다. 로그아웃하면 이 변경은 사라집니다.</p>` : ''}`)}
    ${sec('03', '회원 탈퇴', `<p class="hint">탈퇴하면 계정 정보와 내가 만든 반(혼자 쓰는 반)이 바로 삭제됩니다. 다른 선생님과 함께 쓰는 반은 먼저 ‘함께 쓰는 선생님’에서 주인을 넘겨 주세요.</p>
      <div><button class="btn danger" type="button" data-act="deleteAccount">회원 탈퇴</button></div>`)}
  </div>`;
}
function viewStudents() {
  const edit = st.canEdit(), list = students();
  return `<div class="page">${subhead()}<div class="head"><div><h1>학생 명단</h1><p>${esc(cls().name)} · ${list.length}명</p></div>${edit ? `<button class="btn primary" type="button" data-act="bulkStudents">+ 명단 붙여넣기</button>` : ''}</div>
    ${list.length ? `<div class="panel" style="padding-block:6px">${list.map(x => `<div class="item-row"><div><strong><span class="num" style="color:var(--muted);margin-right:8px">${x.no ?? ''}</span>${esc(x.name)}</strong></div>${edit ? `<button class="btn sm" type="button" data-act="editStudent" data-sid="${x.id}">수정</button>` : ''}</div>`).join('')}</div>`
      : `<div class="empty"><p class="hint">${edit ? '엑셀이나 나이스에서 번호와 이름을 복사해 붙여 넣으면 한 번에 추가됩니다.' : '아직 학생이 없습니다.'}</p></div>`}
  </div>`;
}
function viewMembers() {
  const c = cls(), owner = st.isOwner();
  const members = [...cd().members].sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
  const pend = members.filter(m => m.status === 'pending');
  return `<div class="page">${subhead()}<h1 class="page-title">함께 쓰는 선생님</h1>
    <div class="summary"><span class="k">반 코드</span><span class="v num" style="letter-spacing:.12em">${esc(c.id)}</span>
      <span class="m">이 코드를 받은 선생님이 ‘반 코드로 참여’에 입력하면 참여 요청이 옵니다.</span>
      <div style="margin-top:8px"><button class="btn sm" type="button" data-act="copyCode">초대 문구 복사</button></div></div>
    ${pend.length && owner ? `<div class="banner"><span>참여 요청 <b class="hl">${pend.length}건</b>이 있습니다. 승인해야 기록을 볼 수 있습니다.</span></div>` : ''}
    ${sec('01', '선생님 목록', `<div class="panel" style="padding-block:4px">${members.map(m => `<div class="mem-row"><div><strong>${esc(st.nameOf(m.user_id))}</strong> <span class="role">${m.status === 'pending' ? '승인 대기' : ROLE[m.role]}</span></div>
      <div class="row">${owner && m.role !== 'owner' ? (m.status === 'pending'
        ? `<button class="btn sm primary" type="button" data-act="approve" data-u="${m.user_id}">승인</button><button class="btn sm danger" type="button" data-act="kick" data-u="${m.user_id}">거절</button>`
        : `<select id="role-${m.user_id}" data-chg="role" data-u="${m.user_id}" aria-label="권한"><option value="editor" ${m.role === 'editor' ? 'selected' : ''}>담당 교사</option><option value="stamper" ${m.role === 'stamper' ? 'selected' : ''}>협력 교사</option></select>
           <button class="btn sm" type="button" data-act="transfer" data-u="${m.user_id}">주인 넘기기</button><button class="btn sm danger" type="button" data-act="kick" data-u="${m.user_id}">내보내기</button>`) : ''}</div></div>`).join('')}</div>
      <p class="hint">담당 교사는 모든 기록을 고칠 수 있고, 협력 교사는 수업 추가와 도장·결석만 기록합니다.</p>`, `${members.length}명`)}
    <div>${owner ? `<button class="btn danger" type="button" data-act="delClass">이 반 삭제 (모든 선생님)</button>` : `<button class="btn danger" type="button" data-act="leave">이 반에서 나가기</button>`}</div>
  </div>`;
}
function viewAudit() {
  const rows = ui.page.rows;
  if (!rows) return `<div class="page">${subhead()}<h1 class="page-title">수정 기록</h1><div class="loading">불러오는 중…</div></div>`;
  const sName = id => cd().students.find(s => s.id === id)?.name || '학생';
  const sesL = id => { const s = cd().sessions.find(x => x.id === id); return s ? `${md(s.date)} 수업` : '수업'; };
  const item = id => cd().scoring.items.find(i => i.id === id)?.name || '항목';
  const say = a => { const d = a.detail || {}, [t, op] = a.action.split(':');
    if (t === 'marks') return `${sesL(d.session_id)} · ${sName(d.student_id)} ${d.state === 'stamp' ? '도장' : d.state === 'absent' ? '결석' : '지움'}`;
    if (t === 'item_scores') return `${item(d.item_id)} · ${sName(d.student_id)} ${d.value ?? '지움'}`;
    if (t === 'csb') return `최성보 · ${sName(d.student_id)} 성취율 ${d.rate ?? '-'}${d.done ? ' · 이수 확인' : ''}`;
    if (t === 'csb_logs') return `최성보 기록 ${op === 'delete' ? '삭제' : '추가'} · ${sName(d.student_id)} ${d.kind || ''}`;
    if (t === 'students') return `학생 ${op === 'delete' ? '삭제' : op === 'insert' ? '추가' : '수정'} · ${d.no ?? ''} ${d.name || ''}`;
    if (t === 'sessions') return `수업 ${op === 'delete' ? '삭제' : op === 'insert' ? '추가' : '수정'} · ${md(d.date)} ${d.topic || ''}`;
    return a.action; };
  const fmt = at => { const d = new Date(at); return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  return `<div class="page">${subhead()}<div class="head"><div><h1>수정 기록</h1><p>최근 150건</p></div></div>
    ${rows.length ? `<div class="panel audit" style="padding-block:4px">${rows.map(a => `<div><time>${fmt(a.at)}</time><span><b>${esc(st.nameOf(a.user_id))}</b> · ${esc(say(a))}</span></div>`).join('')}</div>` : '<div class="empty"><p class="hint">아직 기록이 없습니다.</p></div>'}
  </div>`;
}
function viewSemester() {
  const c = cls();
  return `<div class="page">${subhead()}<h1 class="page-title">학기 넘기기</h1>
    ${sec('01', '같은 명단으로 새 반', `<p class="hint">학생 ${cd().students.length}명과 점수 설정을 그대로 가져와 새 학기 반을 만듭니다. 도장·점수 기록은 새 반에 옮겨지지 않습니다.</p>
      <div><button class="btn primary" type="button" data-act="go" data-v="copyClass">새 학기 반 만들기</button></div>`)}
    ${sec('02', c.archived ? '보관 해제' : '이 반 보관', `<p class="hint">${c.archived ? '보관을 해제하면 반 목록 위쪽에 다시 보입니다.' : '보관해도 기록은 그대로 남고, 반 목록의 ‘보관한 반’으로 옮겨집니다.'}</p>
      <div><button class="btn" type="button" data-act="archive">${c.archived ? '보관 해제' : '이 반 보관'}</button></div>`)}
  </div>`;
}
function viewUnits() {
  const c = cls(), s = SUBJECTS[c.subject];
  return `<div class="page">${subhead()}<div class="head"><div><h1>${esc(s.name)}</h1><p>${esc(s.kind)} · 2022 개정 교육과정</p></div></div>
    ${s.units.map((u, i) => sec(String(i + 1).padStart(2, '0'), esc(u[0].replace(/^[ⅠⅡⅢ]\.\s*/, '')), `<div class="panel"><ol style="margin:0;padding-left:22px;display:grid;gap:6px">${u[1].map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`)).join('')}
  </div>`;
}
function classGroups() {
  const act = S.classes.filter(k => k.status === 'active' && !k.archived), groups = [];
  for (const g of [1, 2, 3, null]) { const arr = act.filter(k => (k.grade ?? (Number(String(k.name).match(/^(\d)학년/)?.[1]) || null)) === g); if (arr.length) groups.push([g ? `${g}학년` : '기타', arr]); }
  const pend = S.classes.filter(k => k.status === 'pending'), arch = S.classes.filter(k => k.status === 'active' && k.archived);
  if (pend.length) groups.push(['승인 대기', pend]); if (arch.length) groups.push(['보관한 반', arch]);
  return groups;
}
function classRows(arr) {
  return `<ul class="list">${arr.map(k => `<li><button class="s-card" style="grid-template-columns:minmax(0,1fr) auto" type="button" data-act="useClass" data-id="${k.id}">
    <div class="s-info"><strong>${esc(k.name)}${k.id === S.cur ? '<span class="pill red">사용 중</span>' : ''}</strong><span>${esc(SUBJECTS[k.subject]?.name || '')} · ${esc(k.term || '')} · ${k.status === 'pending' ? '승인 대기' : esc(ROLE[k.role] || '')}</span></div>
    <span class="chev" style="color:var(--muted);font-size:20px">›</span></button></li>`).join('')}</ul>`;
}
function viewClassList() {
  const groups = classGroups();
  return `<div class="page">${subhead()}<div class="head"><div><h1>반 목록</h1><p>${S.classes.length}개 반</p></div><button class="btn primary" type="button" data-act="go" data-v="newClass">+ 새 반</button></div>
    ${groups.length ? groups.map(([t, arr], i) => sec(String(i + 1).padStart(2, '0'), t, classRows(arr), `${arr.length}개`)).join('') : viewEmpty()}
  </div>`;
}
function viewTheme() {
  const t = getTheme();
  return `<div class="page">${subhead()}<h1 class="page-title">화면 모드</h1>
    <div class="opts">${Object.entries(THEME_NAME).map(([k, v]) => `<button type="button" class="opt ${t === k ? 'on' : ''}" data-act="setTheme" data-v="${k}"><b>${v}</b><small>${k === 'dark' ? '검은 바탕에 주황 강조 (교실 화면·밤에 눈이 편함)' : k === 'light' ? '흰 바탕 (밝은 곳·인쇄물 느낌)' : '휴대폰의 다크 모드 설정을 따라갑니다'}</small></button>`).join('')}</div>
  </div>`;
}
function viewInstall() {
  return `<div class="page">${subhead()}<h1 class="page-title">휴대폰에 설치</h1>
    ${installEvt ? `<button class="btn primary lg" type="button" data-act="install">지금 홈 화면에 설치</button>` : ''}
    ${sec('01', '아이폰 (사파리)', `<ol class="steps"><li><span class="n">1</span><p>사파리에서 앱 주소를 엽니다.</p></li><li><span class="n">2</span><p>아래쪽 <b class="hl">공유 버튼</b>(네모에 위 화살표)을 누릅니다.</p></li><li><span class="n">3</span><p><b class="hl">홈 화면에 추가</b>를 누릅니다.</p></li></ol>`)}
    ${sec('02', '안드로이드 (크롬)', `<ol class="steps"><li><span class="n">1</span><p>크롬에서 앱 주소를 엽니다.</p></li><li><span class="n">2</span><p>오른쪽 위 <b class="hl">⋮ 메뉴</b> → <b class="hl">앱 설치</b>(또는 홈 화면에 추가)를 누릅니다.</p></li></ol>`)}
    <div class="row"><span class="num hint" style="word-break:break-all">${esc(location.origin + location.pathname)}</span><button class="btn sm" type="button" data-act="copyAppLink">주소 복사</button></div>
  </div>`;
}
function viewJoin() {
  return `<div class="page">${subhead()}<h1 class="page-title">반 코드로 참여</h1>
    <p class="hint">동료 선생님께 받은 <b class="hl">6자리 반 코드</b>를 입력하세요. 반을 만든 선생님이 승인하면 기록을 함께 볼 수 있습니다.</p>
    <input class="inp codein" id="joinCode" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="ABC123">
    <button class="btn primary lg" type="button" data-act="joinByCode">참여 요청</button>
  </div>`;
}
function viewTerms() { return `<div class="page">${subhead()}<h1 class="page-title">약관 · 개인정보</h1>${sec('01', '서비스 이용약관', `<div class="panel">${TERMS_HTML}</div>`)}${sec('02', '개인정보 수집·이용', `<div class="panel">${PRIVACY_HTML}</div>`)}</div>`; }

const PAGES = { account: viewAccount, clsInfo: viewClassForm, newClass: viewClassForm, copyClass: viewClassForm, students: viewStudents, members: viewMembers, audit: viewAudit,
  semester: viewSemester, units: viewUnits, classList: viewClassList, theme: viewTheme, install: viewInstall, join: viewJoin, terms: viewTerms, session: viewSessionForm };
const NEEDS_CLASS = ['clsInfo', 'copyClass', 'students', 'members', 'audit', 'semester', 'units', 'session'];
function go(name, extra = {}) {
  const c = cls();
  if (NEEDS_CLASS.includes(name) && !(c && c.status === 'active' && cd().loaded)) { toast('먼저 반을 선택해 주세요.'); return; }
  const page = { name, back: ui.page?.name === 'semester' ? 'semester' : null, ...extra };
  if (name === 'newClass') ui.form = { subject: null, grade: null, room: null, roomText: '', term: defaultTerm(), hours: 64 };
  if (name === 'clsInfo') ui.form = formFromClass(c);
  if (name === 'copyClass') { ui.form = { ...formFromClass(c), term: termChoices().find(t => t !== c.term) || defaultTerm() }; page.name = 'newClass'; page.copy = true; }
  ui.page = page;
  if (name === 'audit') st.fetchAudit().then(rows => { if (ui.page?.name === 'audit') { ui.page.rows = rows; render(true); } }).catch(e => toast(e.message));
  render(true); scrollTo(0, 0);
}
function openSessionForm(s) {
  const d = s?.date || today(), [y, m] = d.split('-').map(Number);
  const [ui_, uj] = s?.unit ? s.unit.split('-').map(Number) : [null, null];
  ui.sform = { id: s?.id || null, date: d, ym: [y, m], period: s?.period ?? null, unitI: ui_, unitJ: uj, topic: s?.topic && s.topic !== subUnit(cls().subject, s.unit) ? s.topic : '', pages: s?.pages || '', memo: s?.memo || '' };
  ui.page = { name: 'session', back: s ? 'stamp' : null };
  render(true); scrollTo(0, 0);
}

/* ───────── 설치 안내 ───────── */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; scheduleRender(); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
function installBanner() {
  if (standalone()) return '';
  try { if (localStorage.getItem('ms:hideInstall')) return ''; } catch (e) {}
  if (installEvt) return `<div class="banner"><span>휴대폰 홈 화면에 앱으로 설치할 수 있습니다.</span><div class="row"><button class="btn sm primary" type="button" data-act="install">설치</button><button class="x" type="button" data-act="hideInstall" aria-label="닫기">✕</button></div></div>`;
  if (isIOS) return `<div class="banner"><span>아이폰: 사파리 아래쪽 공유 버튼 → ‘홈 화면에 추가’를 누르면 앱처럼 쓸 수 있습니다.</span><button class="x" type="button" data-act="hideInstall" aria-label="닫기">✕</button></div>`;
  return '';
}

/* ───────── 시트 · 알림 ───────── */
function openSheet(title, html) { $('#shTitle').textContent = title; $('#shBody').innerHTML = html; $('#sheet').hidden = false; document.body.classList.add('lock'); }
function closeSheet() { $('#sheet').hidden = true; document.body.classList.remove('lock'); }
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800); }
st.setToast(toast);
function armed(el) { if (el.dataset.armed) return true; const txt = el.textContent; el.dataset.armed = '1'; el.textContent = '한 번 더 누르면 실행'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = txt; } }, 3000); return false; }
const val = id => $('#' + id)?.value ?? '';
function copyText(text, label, okMsg) {
  const fallback = () => openSheet(label, `<p class="hint">아래 내용을 길게 눌러 모두 선택한 뒤 복사하세요.</p><textarea class="inp" style="min-height:220px" readonly>${esc(text)}</textarea>`);
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg || '복사했습니다. 엑셀에 붙여 넣으세요.'), fallback); } catch (e) { fallback(); }
}
function saveCsv(rows, name) {
  const csv = '﻿' + rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}_${cls().name}_${today()}.csv`.replace(/[\\/:*?"<>|\s]+/g, '_'); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function guard(fn) { try { await fn(); } catch (e) { toast(e.message || '처리하지 못했습니다.'); } }

/* ───────── 표 만들기 ───────── */
function scoreRows() {
  const d = cd(), items = d.scoring.items, on = d.scoring.stamp.enabled;
  const head = ['번호', '이름', ...(on ? ['도장 수', '결석', '도장률(%)', '도장 점수'] : []), ...items.map(i => i.name), '총점'];
  return [head, ...students().map(x => { const t = stampStats(x.id); return [x.no, x.name, ...(on ? [t.stamps, t.absent, Math.round(t.rate), stampScore(x.id)] : []), ...items.map(i => itemScore(i, x.id) ?? ''), n1(totalFor(x.id))]; })];
}
function csbRows() {
  const head = ['번호', '이름', '결석(시간)', '결석 허용', '학업성취율(%)', '도장률(%)', '판정', '지도 횟수', '지도 시간', '지도 내용'];
  return [head, ...students().map(x => { const s = csbStatus(x.id); return [x.no, x.name, s.st.absent, s.allow, s.info.rate ?? '', Math.round(s.st.rate), s.label, s.logs.length, s.hours, s.logs.map(l => `${l.date} ${l.kind} ${l.hours}h: ${l.content} (${l.result})`).join(' / ').replace(/\t|\n/g, ' ')]; })];
}
function attendRows() {
  const ss = sessionsAsc();
  return [['번호', '이름', ...ss.map(s => `${s.date} ${pg(s.pages)}`), '도장', '결석'], ...students().map(x => { const t = stampStats(x.id); return [x.no, x.name, ...ss.map(s => s.absent[x.id] ? '결석' : s.stamps[x.id] ? '○' : ''), t.stamps, t.absent]; })];
}

/* ───────── 반 만들기 시트 ───────── */
/* ───────── 동작 ───────── */
const curSession = () => cd().sessions.find(x => x.id === ui.session);
function setTab(t) { ui.tab = t; ui.page = null; ui.session = null; ui.student = null; try { localStorage.setItem('ms:tab', t); } catch (e) {} st.setPresence({ tab: t, session: null }); }
const ACT = {
  login(el) { st.signIn(el.dataset.v).then(r => { if (r?.error) toast('로그인을 시작하지 못했습니다: ' + r.error.message); }); },
  loginOther() { st.signIn('kakao', { otherAccount: true }).then(r => { if (r?.error) toast('로그인을 시작하지 못했습니다: ' + r.error.message); }); },
  account() { accountSheet(); },
  logout() { closeSheet(); mode = ''; st.signOut().then(() => toast('로그아웃했습니다.')); },
  switchAccount() { closeSheet(); mode = ''; st.signOut(); },
  saveProfile(el) {
    const name = val('pName').trim(); if (!name) { toast('이름을 입력하세요.'); return; }
    el.disabled = true;
    guard(async () => { await st.updateProfile({ name, school: val('pSchool').trim(), subjects: pickedSubjects('#pSubj') }); toast('저장했습니다.'); closeSheet(); }).finally(() => { el.disabled = false; });
  },
  deleteAccount(el) {
    if (!armed(el)) return;
    guard(async () => { await st.deleteAccount(); mode = ''; toast('탈퇴했습니다. 그동안 이용해 주셔서 감사합니다.'); closeSheet(); });
  },
  terms(el) { openSheet(el.dataset.v === 'privacy' ? '개인정보 수집·이용 동의' : '서비스 이용약관', el.dataset.v === 'privacy' ? PRIVACY_HTML : TERMS_HTML); },
  subjChip(el) { el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on')); },
  signup(el) {
    const f = { name: val('suName').trim(), school: val('suSchool').trim(), subjects: pickedSubjects('#suSubj'),
      terms: $('#agTerms').checked, privacy: $('#agPrivacy').checked, marketing: $('#agMkt').checked };
    if (!f.name) { toast('이름을 입력하세요.'); $('#suName').focus(); return; }
    if (!f.terms || !f.privacy) { toast('필수 약관에 동의해 주세요.'); return; }
    el.disabled = true;
    guard(async () => { await st.completeSignup(f); mode = ''; render(true); toast(`${f.name} 선생님, 가입을 환영합니다!`); }).finally(() => { if (el.isConnected) el.disabled = false; });
  },
  transfer(el) { if (!armed(el)) return; guard(async () => { await st.transferOwner(el.dataset.u); toast('반 주인을 넘겼습니다. 이제 담당 교사로 참여합니다.'); }); },
  tab(el) { setTab(el.dataset.v); render(true); scrollTo(0, 0); },
  closeSheet,
  refresh() { guard(st.refreshClasses).then(() => st.openClass(S.cur)); },
  install() { installEvt?.prompt(); installEvt = null; render(true); },
  hideInstall() { try { localStorage.setItem('ms:hideInstall', '1'); } catch (e) {} render(true); },
  pickClass() {
    const arr = S.classes.filter(k => !k.archived || k.id === S.cur);
    openSheet('반 선택', `${arr.length ? `<ul class="list">${arr.map(k => `<li><button class="s-card" style="grid-template-columns:minmax(0,1fr) auto" type="button" data-act="useClass" data-id="${k.id}">
      <div class="s-info"><strong>${esc(k.name)}</strong><span>${esc(SUBJECTS[k.subject]?.name || '')} · ${k.status === 'pending' ? '승인 대기' : esc(ROLE[k.role])}</span></div>${k.id === S.cur ? '<span class="pill red">사용 중</span>' : ''}</button></li>`).join('')}</ul>` : '<p class="hint">참여 중인 반이 없습니다.</p>'}
      <div class="grid2"><button class="btn primary" type="button" data-act="newClass">+ 새 반</button><button class="btn outline" type="button" data-act="joinSheet">코드로 참여</button></div>`);
  },
  useClass(el) { ui.session = null; ui.student = null; ui.item = null; ui.page = null; st.openClass(el.dataset.id); closeSheet(); render(true); toast('반을 바꿨습니다.'); },
  newClass() { classSheet(); },
  editClass() { classSheet(cls()); },
  copyClass() { const c = cls(); classSheet({ ...c, name: c.name, term: '' }, { title: '같은 명단으로 새 반', copy: true }); },
  saveClass(el) {
    const name = val('cName').trim(); if (!name) { toast('반 이름을 입력하세요.'); return; }
    const meta = { name, subject: val('cSubj'), term: val('cTerm').trim(), hours: Math.max(1, Number(val('cHours')) || 64) };
    const m = el.dataset.mode;
    if (m === 'edit') { st.updateClass(meta); closeSheet(); toast('저장했습니다.'); return; }
    el.disabled = true;
    const roster = m === 'copy' ? students().map(s => ({ no: s.no, name: s.name })) : [];
    const scoring = m === 'copy' ? clone(cd().scoring) : defaultScoring();
    guard(async () => {
      const code = await st.createClass(meta, scoring);
      if (roster.length) st.addStudents(roster);
      closeSheet(); setTab('classes'); render(true); toast(`반을 만들었습니다. 반 코드는 ${code}입니다.`);
    }).finally(() => { el.disabled = false; });
  },
  archive() { const c = cls(); st.updateClass({ archived: !c.archived }); toast(c.archived ? '보관을 해제했습니다.' : '반을 보관했습니다. 기록은 그대로 남아 있습니다.'); },
  delClass(el) { if (!armed(el)) return; guard(async () => { await st.deleteClass(S.cur); ui.page = null; render(true); toast('반을 삭제했습니다.'); }); },
  leave(el) { if (!armed(el)) return; guard(async () => { await st.removeMember(S.user.id); ui.page = null; render(true); toast('반에서 나왔습니다.'); }); },
  approve(el) { guard(async () => { await st.setMember(el.dataset.u, { status: 'active' }); toast('승인했습니다. 처음에는 협력 교사로 참여합니다.'); }); },
  kick(el) { if (!armed(el)) return; guard(async () => { await st.removeMember(el.dataset.u); toast('처리했습니다.'); }); },
  joinSheet() {
    openSheet('반 코드로 참여', `<p class="hint">동료 선생님께 받은 6자리 반 코드를 입력하세요. 반을 만든 선생님이 승인하면 기록을 함께 볼 수 있습니다.</p>
      <input class="inp codein" id="joinCode" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="ABC123">
      <button class="btn primary" type="button" data-act="joinByCode">참여 요청</button>`);
    setTimeout(() => $('#joinCode')?.focus(), 50);
  },
  joinByCode(el) {
    const code = val('joinCode').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { toast('반 코드를 확인해 주세요.'); return; }
    el.disabled = true;
    guard(async () => {
      const r = await st.requestJoin(code);
      if (!r.ok) { toast('그 코드의 반이 없습니다. 코드를 다시 확인해 주세요.'); return; }
      st.openClass(r.id); closeSheet(); ui.page = null; ui.tab = 'lesson'; render(true);
      toast(r.status === 'active' ? `${r.name} 반을 열었습니다.` : `${r.name} 반에 참여를 요청했습니다. 승인을 기다려 주세요.`);
    }).finally(() => { el.disabled = false; });
  },
  copyCode() { const c = cls(); copyText(`[수학 도장노트] ${c.name} 반 코드: ${c.id}\n${location.origin + location.pathname}\n로그인 후 ‘반·설정 → 코드로 참여’에 코드를 입력하세요.`, '초대 문구 복사', '초대 문구를 복사했습니다.'); },
  audit() {
    guard(async () => {
      const rows = await st.fetchAudit();
      const sName = id => cd().students.find(s => s.id === id)?.name || '학생';
      const sesL = id => { const s = cd().sessions.find(x => x.id === id); return s ? `${md(s.date)} 수업` : '수업'; };
      const item = id => cd().scoring.items.find(i => i.id === id)?.name || '항목';
      const say = a => { const d = a.detail || {}, [t, op] = a.action.split(':');
        if (t === 'marks') return `${sesL(d.session_id)} · ${sName(d.student_id)} ${d.state === 'stamp' ? '도장' : d.state === 'absent' ? '결석' : '지움'}`;
        if (t === 'item_scores') return `${item(d.item_id)} · ${sName(d.student_id)} ${d.value ?? '지움'}`;
        if (t === 'csb') return `최성보 · ${sName(d.student_id)} 성취율 ${d.rate ?? '-'}${d.done ? ' · 이수 확인' : ''}`;
        if (t === 'csb_logs') return `최성보 기록 ${op === 'delete' ? '삭제' : '추가'} · ${sName(d.student_id)} ${d.kind || ''}`;
        if (t === 'students') return `학생 ${op === 'delete' ? '삭제' : op === 'insert' ? '추가' : '수정'} · ${d.no ?? ''} ${d.name || ''}`;
        if (t === 'sessions') return `수업 ${op === 'delete' ? '삭제' : op === 'insert' ? '추가' : '수정'} · ${md(d.date)} ${d.topic || ''}`;
        return a.action; };
      const fmt = at => { const d = new Date(at); return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      openSheet('수정 기록 (최근 150건)', rows.length ? `<div class="audit">${rows.map(a => `<div><time>${fmt(a.at)}</time><span><b>${esc(st.nameOf(a.user_id))}</b> · ${esc(say(a))}</span></div>`).join('')}</div>` : '<p class="hint">아직 기록이 없습니다.</p>');
    });
  },

  bulkStudents() {
    openSheet('명단 붙여넣기', `<p class="hint">한 줄에 한 명씩 ‘번호 이름’ 형식으로 넣으세요. 엑셀이나 나이스에서 두 칸을 복사해 붙여도 됩니다. 번호가 같은 학생은 이름이 바뀝니다.</p>
      <textarea class="inp" id="bulk" style="min-height:220px" placeholder="1 김민준&#10;2 이서연&#10;3 박지호"></textarea>
      <button class="btn primary" type="button" data-act="saveBulk">추가</button>`);
  },
  saveBulk() {
    const list = students(); let next = Math.max(0, ...list.map(s => Number(s.no) || 0)), add = 0, upd = 0;
    const out = [];
    for (const line of val('bulk').split(/\r?\n/)) {
      const t = line.trim(); if (!t) continue;
      const m = t.match(/^(\d+)[\s\t.,)번]*\s*(.+)$/);
      const no = m ? Number(m[1]) : ++next, name = (m ? m[2] : t).replace(/\t.*/, '').trim().slice(0, 40); if (!name) continue;
      if (m) next = Math.max(next, no);
      const ex = list.find(s => Number(s.no) === no);
      if (ex) { if (ex.name !== name) { st.updateStudent(ex.id, { name }); upd++; } } else { out.push({ no, name }); add++; }
    }
    st.addStudents(out); closeSheet(); toast(`${add}명 추가${upd ? `, ${upd}명 수정` : ''}`);
  },
  editStudent(el) {
    const x = cd().students.find(s => s.id === el.dataset.sid); if (!x) return;
    openSheet('학생 수정', `<div class="grid2"><label class="field"><span>번호</span><input class="inp num" type="number" id="stNo" value="${x.no ?? ''}"></label>
      <label class="field"><span>이름</span><input class="inp" id="stName" value="${esc(x.name)}"></label></div>
      <p class="hint">학생을 삭제하면 그 학생의 도장·점수·최성보 기록도 함께 지워집니다.</p>
      <div class="row end"><button class="btn danger" type="button" data-act="delStudent" data-sid="${x.id}">학생 삭제</button><button class="btn primary" type="button" data-act="saveStudent" data-sid="${x.id}">저장</button></div>`);
  },
  saveStudent(el) { const x = cd().students.find(s => s.id === el.dataset.sid); if (x) st.updateStudent(x.id, { no: Number(val('stNo')) || x.no, name: val('stName').trim() || x.name }); closeSheet(); },
  delStudent(el) { if (!armed(el)) return; st.deleteStudent(el.dataset.sid); closeSheet(); },

  newSession() { sessionSheet(); },
  editSession(el) { sessionSheet(cd().sessions.find(s => s.id === el.dataset.id)); },
  saveSession(el) {
    const c = cls(), unit = val('sUnit'), p = val('sPeriod');
    const data = { date: val('sDate') || today(), period: p ? Number(p) : null, unit, topic: val('sTopic').trim() || subUnit(c.subject, unit), pages: val('sPages').trim(), memo: val('sMemo').trim() };
    if (el.dataset.id) st.updateSession(el.dataset.id, data);
    else { const id = st.createSession(data); ui.session = id; ui.mode = 'stamp'; ui.tab = 'lesson'; st.setPresence({ tab: 'lesson', session: id }); }
    closeSheet(); render(true); scrollTo(0, 0);
  },
  delSession(el) { if (!armed(el)) return; st.deleteSession(el.dataset.id); ui.session = null; ui.page = null; st.setPresence({ session: null }); closeSheet(); toast('수업을 삭제했습니다.'); },
  openSession(el) { ui.session = el.dataset.id; ui.mode = 'stamp'; st.setPresence({ session: ui.session }); render(true); scrollTo(0, 0); },
  back() { ui.session = null; st.setPresence({ session: null }); render(true); },
  mode(el) { ui.mode = el.dataset.v; render(true); },
  tap(el) {
    const s = curSession(); if (!s) return; const sid = el.dataset.sid;
    const ab = s.absent[sid], on = s.stamps[sid] && !ab;
    if (ui.mode === 'stamp') { if (on) st.setMark(s.id, sid, 'none'); else { ui.just = sid; st.setMark(s.id, sid, 'stamp'); try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} } }
    else st.setMark(s.id, sid, ab ? 'none' : 'absent');
  },
  stampAll() { const s = curSession(); if (!s) return; let n = 0; students().forEach(x => { if (!s.stamps[x.id] && !s.absent[x.id]) { st.setMark(s.id, x.id, 'stamp'); n++; } }); toast(`${n}명에게 도장을 찍었습니다.`); },
  cell(el) {
    const s = cd().sessions.find(x => x.id === el.dataset.ses), sid = el.dataset.sid; if (!s) return;
    if (s.absent[sid]) { toast('결석한 수업입니다. 수업 화면의 결석 체크에서 해제하세요.'); return; }
    st.setMark(s.id, sid, s.stamps[sid] ? 'none' : 'stamp');
  },
  pf(el) { ui.pf = el.dataset.v; render(true); },
  openStudent(el) { ui.student = el.dataset.sid; render(true); scrollTo(0, 0); },
  closeStudent() { ui.student = null; render(true); },

  sc(el) { ui.sc = el.dataset.v; render(true); },
  stampMode(el) { if (cd().scoring.stamp.mode === el.dataset.v) return; const m = el.dataset.v;
    saveScoring(sc => { sc.stamp.mode = m; sc.stamp.bands = m === 'rate' ? defaultScoring().stamp.bands : [{ min: 15, score: 10 }, { min: 12, score: 9 }, { min: 9, score: 8 }, { min: 6, score: 7 }, { min: 3, score: 6 }]; });
    toast(m === 'rate' ? '도장률 기준 기본 급간으로 바꿨습니다.' : '도장 개수 기준 기본 급간으로 바꿨습니다.'); },
  addBand() { saveScoring(sc => { const b = sc.stamp.bands; const low = b.length ? Math.min(...b.map(x => Number(x.min))) : 100, lowSc = b.length ? Math.min(...b.map(x => Number(x.score))) : 10; b.push({ min: Math.max(0, low - 10), score: Math.max(0, lowSc - 1) }); }); },
  delBand(el) { saveScoring(sc => { sc.stamp.bands.splice(Number(el.dataset.i), 1); }); },
  newItem(el) { itemSheet(clone(ITEM_TEMPLATES[el.dataset.v]), true); },
  editItem(el) { itemSheet(clone(cd().scoring.items.find(i => i.id === el.dataset.id)), false); },
  addLv() { $('#lvList').insertAdjacentHTML('beforeend', lvRow({ label: '', score: 0 })); },
  delLv(el) { el.closest('.lvrow').remove(); },
  saveItem(el) {
    const name = val('itName').trim(); if (!name) { toast('항목 이름을 입력하세요.'); return; }
    const type = val('itType'), it = { name, type };
    if (type === 'check') { it.on = Number(val('itOn')) || 0; it.off = Number(val('itOff')) || 0; }
    else if (type === 'level') { it.levels = [...document.querySelectorAll('#lvList .lvrow')].map(r => ({ label: r.querySelector('.lv-label').value.trim(), score: Number(r.querySelector('.lv-score').value) || 0 })).filter(l => l.label);
      if (!it.levels.length) { toast('단계를 하나 이상 넣으세요.'); return; } }
    else it.max = Math.max(0, Number(val('itMax')) || 0);
    const id = el.dataset.id || st.nid(), old = cd().scoring.items.find(i => i.id === id);
    saveScoring(sc => { const i = sc.items.findIndex(x => x.id === id); if (i >= 0) sc.items[i] = { id, ...it }; else sc.items.push({ id, ...it }); });
    if (old && old.type !== type) st.clearItemScores(id);
    ui.item = id; closeSheet(); toast('항목을 저장했습니다.');
  },
  delItem(el) { if (!armed(el)) return; const id = el.dataset.id; saveScoring(sc => { sc.items = sc.items.filter(i => i.id !== id); }); st.clearItemScores(id); closeSheet(); },
  pickItem(el) { ui.item = el.dataset.id; render(true); },
  setVal(el) { const sid = el.dataset.sid, v = Number(el.dataset.v), cur = cd().itemScores[ui.item]?.[sid]; st.setScore(ui.item, sid, cur === v ? null : v); },
  allCheck() { const m = cd().itemScores[ui.item] || {}; students().forEach(x => { if (m[x.id] == null) st.setScore(ui.item, x.id, 1); }); toast('미입력 학생을 모두 제출로 표시했습니다.'); },
  copyScores() { copyText(scoreRows().map(r => r.join('\t')).join('\n'), '점수표 복사'); },
  csvScores() { saveCsv(scoreRows(), '포트폴리오점수'); },
  csvAttend() { saveCsv(attendRows(), '출석도장표'); },

  csbFilter(el) { ui.csbFilter = el.dataset.v; render(true); },
  openCsb(el) { csbSheet(el.dataset.sid); },
  saveCsb(el) { const sid = el.dataset.sid, r = val('cRate').trim();
    st.saveCsb(sid, { rate: r === '' ? null : Math.max(0, Math.min(100, Number(r))), done: $('#cDone').checked, memo: val('cMemo').trim() });
    csbSheet(sid); toast('저장했습니다.'); },
  addLog(el) { const content = val('lContent').trim(); if (!content) { toast('지도 내용을 입력하세요.'); return; }
    const sid = el.dataset.sid;
    st.addLog({ student_id: sid, date: val('lDate') || today(), kind: val('lKind'), hours: Number(val('lHours')) || 0, content, result: val('lResult') });
    csbSheet(sid); toast('지도 기록을 추가했습니다.'); },
  delLog(el) { st.deleteLog(el.dataset.id); csbSheet(el.dataset.sid); },
  copyCsb() { copyText(csbRows().map(r => r.join('\t')).join('\n'), '최성보 목록 복사'); },
  csvCsb() { saveCsv(csbRows(), '최성보'); },

  loadSample(el) {
    el.disabled = true;
    guard(async () => {
      const sc = defaultScoring();
      const items = [{ id: st.nid(), ...ITEM_TEMPLATES.wrong }, { id: st.nid(), ...clone(ITEM_TEMPLATES.mock) }, { id: st.nid(), ...clone(ITEM_TEMPLATES.feedback) }];
      sc.items = items;
      await st.createClass({ name: '연습용 반 (예시)', subject: 'cm2', term: '연습', hours: 64 }, sc);
      const names = ['김민준', '이서연', '박지호', '최수아', '정도윤', '강하은', '조시우', '윤지민', '장예준', '임서윤', '한유찬', '오채원'];
      const kids = names.map((n, i) => ({ id: crypto.randomUUID(), no: i + 1, name: n }));
      st.addStudents(kids);
      const plan = [['2026-09-01', '0-0', '평면좌표 · 두 점 사이의 거리', '10-15'], ['2026-09-03', '0-0', '선분의 내분점', '16-21'], ['2026-09-08', '0-1', '직선의 방정식', '24-31'], ['2026-09-10', '0-1', '두 직선의 위치 관계', '32-37'], ['2026-09-15', '0-1', '점과 직선 사이의 거리', '38-41']];
      plan.forEach(([date, unit, topic, pages], k) => {
        const sid = st.createSession({ date, period: 2 + (k % 4), unit, topic, pages, memo: '' });
        kids.forEach((x, i) => { const r = (i * 7 + k * 3) % 10; const state = (i === 4 && k % 3 === 0) ? 'absent' : (r === 9 || (i === 4 && r < 3)) ? null : 'stamp'; if (state) st.setMark(sid, x.id, state); });
      });
      kids.forEach((x, i) => { st.setScore(items[0].id, x.id, i === 4 ? 0 : 1); st.setScore(items[2].id, x.id, i % 3); });
      st.saveCsb(kids[4].id, { rate: 34, done: false, memo: '기초 연산 보충 필요' });
      setTab('lesson'); render(true); toast('연습용 반을 만들었습니다. 반·설정에서 지울 수 있습니다.');
    }).finally(() => { el.disabled = false; });
  }
};
const CHG = {
  numVal(el) { st.setScore(ui.item, el.dataset.sid, el.value === '' ? null : Number(el.value)); },
  stampOn(el) { saveScoring(sc => { sc.stamp.enabled = el.checked; }); },
  exAb(el) { saveScoring(sc => { sc.stamp.excludeAbsent = el.checked; }); },
  band(el) { saveScoring(sc => { sc.stamp.bands[Number(el.dataset.i)][el.dataset.k] = Number(el.value) || 0; }); },
  floor(el) { saveScoring(sc => { sc.stamp.floor = Number(el.value) || 0; }); },
  itType(el) { ['check', 'level', 'number'].forEach(t => { $('#ty' + t[0].toUpperCase() + t.slice(1)).hidden = el.value !== t; }); },
  csbHours(el) { st.updateClass({ hours: Math.max(1, Math.min(400, Number(el.value) || 64)) }); },
  csbTh(el) { st.updateClass({ threshold: Math.max(0, Math.min(100, Number(el.value) || 40)) }); },
  agree(el) {
    const all = $('#agAll'), items = ['agTerms', 'agPrivacy', 'agMkt'].map(id => $('#' + id));
    if (el.id === 'agAll') items.forEach(i => { i.checked = el.checked; });
    else all.checked = items.every(i => i.checked);
    $('#suGo').disabled = !($('#agTerms').checked && $('#agPrivacy').checked);
  },
  role(el) { guard(async () => { await st.setMember(el.dataset.u, { role: el.value }); toast('권한을 바꿨습니다.'); }); }
};

/* ───────── 새 화면 동작 ───────── */
Object.assign(ACT, {
  go(el) { go(el.dataset.v); },
  back2() {
    const b = ui.page?.back;
    if (b === 'stamp') { ui.page = null; render(true); }
    else if (b) go(b);
    else { ui.page = null; render(true); }
    scrollTo(0, 0);
  },
  newClass() { closeSheet(); go('newClass'); },
  editClass() { go('clsInfo'); },
  copyClass() { go('copyClass'); },
  joinSheet() { closeSheet(); go('join'); },
  account() { closeSheet(); ui.tab = 'classes'; go('account'); },
  newSession() { openSessionForm(null); },
  editSession(el) { openSessionForm(cd().sessions.find(s => s.id === el.dataset.id)); },
  setTheme(el) { setTheme(el.dataset.v); render(true); },
  copyAppLink() { copyText(location.origin + location.pathname, '주소 복사', '앱 주소를 복사했습니다.'); },
  fset(el) {
    const k = el.dataset.k; let v = el.dataset.v;
    if (k === 'grade' || k === 'hours') v = Number(v);
    ui.form[k] = v; render(true);
    if (k === 'room' && v === 'custom') setTimeout(() => $('#fRoomText')?.focus(), 30);
  },
  sset(el) {
    const k = el.dataset.k, raw = el.dataset.v, f = ui.sform;
    if (k === 'period') f.period = raw === '' ? null : Number(raw);
    if (k === 'unitI') { const i = Number(raw); if (f.unitI === i) { f.unitI = null; } else { f.unitI = i; } f.unitJ = null; }
    if (k === 'unitJ') { const j = Number(raw); f.unitJ = f.unitJ === j ? null : j; }
    render(true);
  },
  calPick(el) { ui.sform.date = el.dataset.v; render(true); },
  calMove(el) { let [y, m] = ui.sform.ym; m += Number(el.dataset.v); if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } ui.sform.ym = [y, m]; render(true); },
  saveClassForm(el) {
    const f = ui.form, name = formName(f), pg_ = ui.page;
    if (!f.subject || !name) { toast('과목과 학년·반을 골라 주세요.'); return; }
    const meta = { name, subject: f.subject, term: f.term, hours: Number(f.hours) || 64 };
    const extra = { grade: f.grade, room: f.room === 'custom' ? f.roomText.trim() : f.room };
    if (pg_.name === 'clsInfo') { st.updateClass({ ...meta, ...extra }); ui.page = null; render(true); toast('반 정보를 저장했습니다.'); return; }
    el.disabled = true;
    const roster = pg_.copy ? students().map(s => ({ no: s.no, name: s.name })) : [];
    const scoring = pg_.copy ? clone(cd().scoring) : defaultScoring();
    guard(async () => {
      const code = await st.createClass(meta, scoring);
      st.updateClass(extra);
      if (roster.length) st.addStudents(roster);
      ui.page = null; ui.tab = roster.length ? 'lesson' : 'classes';
      if (!roster.length) go('students'); else render(true);
      toast(`${name} 반을 만들었습니다. 반 코드는 ${code}입니다.`);
    }).finally(() => { if (el.isConnected) el.disabled = false; });
  },
  saveSessionForm() {
    const f = ui.sform, c = cls();
    const unit = f.unitI != null && f.unitJ != null ? `${f.unitI}-${f.unitJ}` : (f.unitI != null ? `${f.unitI}-` : '');
    const data = { date: f.date, period: f.period || null, unit: unit.endsWith('-') ? '' : unit, topic: f.topic.trim() || (f.unitI != null && f.unitJ != null ? subUnit(c.subject, unit) : (f.unitI != null ? SUBJECTS[c.subject].units[f.unitI][0] : '')), pages: f.pages.trim(), memo: f.memo.trim() };
    if (f.id) { st.updateSession(f.id, data); ui.page = null; ui.session = f.id; render(true); toast('저장했습니다.'); return; }
    const id = st.createSession(data); ui.page = null; ui.session = id; ui.mode = 'stamp'; ui.tab = 'lesson';
    st.setPresence({ tab: 'lesson', session: id }); render(true); scrollTo(0, 0);
  },
  pickClass() {
    const groups = classGroups();
    openSheet('반 선택', `${groups.length ? groups.map(([t, arr]) => `<div class="menu-label" style="margin:4px 0 -4px">${t}</div>${classRows(arr)}`).join('') : '<p class="hint">참여 중인 반이 없습니다.</p>'}
      <div class="grid2"><button class="btn primary" type="button" data-act="newClass">+ 새 반</button><button class="btn outline" type="button" data-act="joinSheet">코드로 참여</button></div>`);
  }
});
const INP = {
  roomText(el) { ui.form.roomText = el.value; const n = formName(ui.form); const t = $('#sumName'); if (t) t.textContent = n || '학년·반을 골라 주세요'; const b = $('#fSave'); if (b) b.disabled = !(ui.form.subject && n); },
  topic(el) { ui.sform.topic = el.value; }, pages(el) { ui.sform.pages = el.value; }, memo(el) { ui.sform.memo = el.value; }
};
document.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el && INP[el.dataset.inp]) INP[el.dataset.inp](el); });
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const f = ACT[el.dataset.act]; if (f) { e.preventDefault(); f(el, e); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); if (e.key === 'Enter' && e.target.id === 'joinCode') ACT.joinByCode($('[data-act=joinByCode]')); });
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

/* ───────── 시작 ───────── */
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
render(true);
st.initAuth().then(() => render(true)).catch(e => { console.error(e); render(true); });
