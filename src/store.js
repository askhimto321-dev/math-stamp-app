// 데이터 계층: Supabase 연결, 오프라인 대기열, 실시간 동기화, 접속자 표시
import { createClient } from '@supabase/supabase-js';

const cfg = window.APP_CONFIG || {};
export const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !/YOUR|여기에/.test(cfg.supabaseUrl + cfg.supabaseAnonKey));
export const sb = configured ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
}) : null;

const LS = {
  get(k, d) { try { const v = localStorage.getItem('ms:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ms:' + k, JSON.stringify(v)); } catch (e) { /* 저장 공간 부족 등 */ } },
  del(k) { try { localStorage.removeItem('ms:' + k); } catch (e) {} }
};

export const S = {
  user: null,            // 로그인한 사람
  me: LS.get('me', { name: '' }),  // 내 프로필
  meLoaded: !!LS.get('me', null),
  classes: LS.get('classes', []),   // 내가 속한 반 목록 (my_classes)
  cur: LS.get('cur', null),         // 지금 보고 있는 반 코드
  d: null,               // 지금 반의 데이터
  outbox: LS.get('outbox', []),     // 아직 서버에 못 보낸 변경
  online: navigator.onLine,
  syncing: false,
  lastError: '',
  peers: [],
  names: LS.get('names', {}),
  ver: 0
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
let emitQ = false;
export function emit() {
  S.ver++;
  if (emitQ) return; emitQ = true;
  queueMicrotask(() => { emitQ = false; listeners.forEach(f => f()); });
}
let toastFn = () => {};
export const setToast = fn => { toastFn = fn; };

const blank = cls => ({ cls, members: [], students: [], sessions: [], marks: {}, scores: {}, csb: {}, logs: [], loaded: false });
const cacheKey = cid => 'class:' + cid;
function saveCache() { if (S.d && S.cur) LS.set(cacheKey(S.cur), S.d); }
let cacheT; function saveCacheSoon() { clearTimeout(cacheT); cacheT = setTimeout(saveCache, 400); }

/* ───────── 로그인 ───────── */
export async function initAuth() {
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  sb.auth.onAuthStateChange((_e, session) => {
    const before = S.user?.id;
    S.user = session?.user || null;
    if (S.user && S.user.id !== before) afterLogin();
    if (!S.user) { teardown(); }
    emit();
  });
  if (S.user) await afterLogin();
}
async function afterLogin() {
  await loadProfile().catch(() => {});
  await refreshClasses();
  if (S.cur) openClass(S.cur); else if (S.classes.find(c => c.status === 'active')) openClass(S.classes.find(c => c.status === 'active' && !c.archived)?.id || S.classes[0].id);
  flush();
}
// 구글은 매번 계정 선택 창을 띄우고, 카카오는 '다른 계정' 요청 때만 다시 로그인하게 함
export function signIn(provider, { otherAccount = false } = {}) {
  const queryParams = provider === 'google' ? { prompt: 'select_account' } : (otherAccount ? { prompt: 'login' } : undefined);
  return sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname, queryParams } });
}
// 로그아웃: 서버 응답이 실패해도 이 기기의 로그인 정보는 반드시 지움
export async function signOut() {
  teardown();
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* 네트워크 오류여도 계속 */ }
  try {
    Object.keys(localStorage).filter(k => k.startsWith('ms:') && !['ms:tab', 'ms:hideInstall', 'ms:theme'].includes(k)).forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k));
  } catch (e) {}
  S.user = null; S.me = { name: '' }; S.meLoaded = false;
  S.classes = []; S.cur = null; S.d = null; S.outbox = [];
  emit();
}
export async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
  if (data) { S.me = data; S.meLoaded = true; S.names[data.id] = data.name; LS.set('me', data); emit(); }
  else if (!error) { S.me = { id: S.user.id, name: '', signup_completed_at: null }; S.meLoaded = true; emit(); }
  else if (!S.meLoaded) { S.meLoaded = true; emit(); } // 연결 오류: 가입 확인은 다음 접속 때
}
// 가입 정보 입력이 필요한지 (002_signup.sql 을 아직 실행하지 않았으면 건너뜀)
export const needSignup = () => S.meLoaded && ('signup_completed_at' in S.me) && !S.me.signup_completed_at;
export async function completeSignup(f) {
  needOnline();
  const { error } = await sb.rpc('complete_signup', { p_name: f.name, p_school: f.school, p_subjects: f.subjects, p_terms: f.terms, p_privacy: f.privacy, p_marketing: f.marketing });
  if (error) throw error;
  await loadProfile();
}
export async function updateProfile(patch) {
  needOnline();
  const { error } = await sb.from('profiles').update(patch).eq('id', S.user.id);
  if (error) throw error;
  await loadProfile(); track();
}
export async function deleteAccount() {
  needOnline();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  await signOut();
}
export async function transferOwner(userId) {
  needOnline();
  const { error } = await sb.rpc('transfer_owner', { p_class: S.cur, p_user: userId });
  if (error) throw error;
  await refreshClasses(); await fetchClass();
}
export async function renameMe(name) {
  const { error } = await sb.from('profiles').update({ name }).eq('id', S.user.id);
  if (error) throw error;
  S.me.name = name; S.names[S.user.id] = name; LS.set('names', S.names); emit();
  track();
}

/* ───────── 반 목록 ───────── */
export async function refreshClasses() {
  if (!S.online) return;
  const { data, error } = await sb.rpc('my_classes');
  if (error) { noteError(error); return; }
  S.classes = data; LS.set('classes', data);
  if (S.cur && !data.find(c => c.id === S.cur)) { S.cur = null; S.d = null; LS.set('cur', null); teardown(); }
  emit();
}
export function myRole(cid = S.cur) { const c = S.classes.find(x => x.id === cid); return c && c.status === 'active' ? c.role : null; }
export const canEdit = () => ['owner', 'editor'].includes(myRole());
export const canStamp = () => !!myRole();
export const isOwner = () => myRole() === 'owner';

/* ───────── 반 열기 · 불러오기 ───────── */
let channel = null, ui = { tab: 'lesson', session: null };
export function openClass(cid) {
  if (!cid) return;
  const c = S.classes.find(x => x.id === cid);
  if (!c || c.status !== 'active') { S.cur = cid; LS.set('cur', cid); S.d = null; emit(); return; }
  if (S.cur !== cid || !S.d) {
    S.cur = cid; LS.set('cur', cid);
    S.d = LS.get(cacheKey(cid), null) || blank(null);
    replayOutbox();
  }
  emit();
  fetchClass(cid);
  subscribe(cid);
}
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
let fetching = null, lastFetch = 0;
export async function fetchClass(cid = S.cur) {
  if (!cid || !S.online || !S.user) return;
  if (fetching === cid) return; fetching = cid;
  lastFetch = Date.now();
  try {
    await flush();
    const eq = t => () => sb.from(t).select('*').eq('class_id', cid);
    const [cls, members, students, sessions, marks, scores, csb, logs] = await Promise.all([
      sb.from('classes').select('*').eq('id', cid).maybeSingle().then(r => { if (r.error) throw r.error; return r.data; }),
      all(eq('class_members')), all(eq('students')), all(eq('sessions')), all(eq('marks')),
      all(eq('item_scores')), all(eq('csb')), all(eq('csb_logs'))
    ]);
    if (S.cur !== cid) return;
    if (!cls) { await refreshClasses(); return; }
    const d = blank(cls);
    d.members = members; d.students = students; d.sessions = sessions; d.logs = logs;
    for (const m of marks) (d.marks[m.session_id] ||= {})[m.student_id] = m.state;
    for (const s of scores) (d.scores[s.item_id] ||= {})[s.student_id] = s.value == null ? null : Number(s.value);
    for (const c of csb) d.csb[c.student_id] = { rate: c.rate == null ? null : Number(c.rate), done: c.done, memo: c.memo };
    d.loaded = true;
    S.d = d;
    replayOutbox();
    saveCache(); emit();
    loadNames(members.map(m => m.user_id));
  } catch (e) {
    noteError(e);
  } finally { fetching = null; }
}
async function loadNames(ids) {
  const need = [...new Set(ids)].filter(Boolean);
  if (!need.length || !S.online) return;
  const { data } = await sb.from('profiles').select('id,name').in('id', need);
  if (data) { data.forEach(p => { S.names[p.id] = p.name; }); LS.set('names', S.names); emit(); }
}
export const nameOf = id => id === S.user?.id ? '나' : (S.names[id] || '선생님');

/* ───────── 실시간 동기화 + 접속자 ───────── */
function teardown() { if (channel) { sb.removeChannel(channel); channel = null; } S.peers = []; }
function subscribe(cid) {
  if (!sb || !S.user) return;
  if (channel && channel.topic === 'realtime:class-' + cid) return;
  teardown();
  const ch = sb.channel('class-' + cid, { config: { presence: { key: S.user.id } } });
  const tables = ['marks', 'sessions', 'students', 'item_scores', 'csb', 'csb_logs', 'class_members'];
  for (const t of tables) ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `class_id=eq.${cid}` }, p => incoming(t, p));
  for (const t of ['sessions', 'students', 'csb_logs']) ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, p => incoming(t, p));
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'classes', filter: `id=eq.${cid}` }, p => incoming('classes', p));
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState();
    S.peers = Object.entries(st).filter(([k]) => k !== S.user.id).map(([k, v]) => ({ id: k, ...(v[v.length - 1] || {}) }));
    emit();
  });
  ch.subscribe(status => {
    if (status === 'SUBSCRIBED') { track(); }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { setTimeout(() => { if (S.cur === cid && Date.now() - lastFetch > 15000) fetchClass(cid); }, 3000); }
  });
  channel = ch;
}
export function setPresence(p) { ui = { ...ui, ...p }; track(); }
function track() { if (channel) channel.track({ name: S.me.name || '', tab: ui.tab, session: ui.session || null }).catch(() => {}); }

const pk = (t, r) => t === 'marks' ? r.session_id + '/' + r.student_id
  : t === 'item_scores' ? r.item_id + '/' + r.student_id
  : t === 'csb' ? r.student_id
  : t === 'class_members' ? r.user_id
  : r.id;
function pendingFor(t, key) { return S.outbox.some(o => o.table === t && o.key === key); }

function incoming(t, p) {
  const d = S.d; if (!d) return;
  if (p.eventType === 'DELETE') {
    const id = p.old?.id;
    if (t === 'sessions') { d.sessions = d.sessions.filter(s => s.id !== id); delete d.marks[id]; }
    else if (t === 'students') d.students = d.students.filter(s => s.id !== id);
    else if (t === 'csb_logs') d.logs = d.logs.filter(l => l.id !== id);
    else if (t === 'class_members' || t === 'item_scores') { fetchClass(); return; }
    else if (t === 'classes') { refreshClasses(); return; }
    saveCacheSoon(); emit(); return;
  }
  const r = p.new; if (!r) return;
  if (pendingFor(t, pk(t, r))) return; // 내 변경이 아직 가는 중이면 그대로 둠
  applyRow(t, r);
  if (t === 'class_members') { loadNames([r.user_id]); if (r.user_id === S.user.id) refreshClasses(); }
  saveCacheSoon(); emit();
}
function upsertIn(arr, row) { const i = arr.findIndex(x => x.id === row.id); if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row); }
function applyRow(t, r) {
  const d = S.d; if (!d) return;
  switch (t) {
    case 'marks': (d.marks[r.session_id] ||= {})[r.student_id] = r.state; break;
    case 'sessions': upsertIn(d.sessions, r); break;
    case 'students': upsertIn(d.students, r); break;
    case 'csb_logs': upsertIn(d.logs, r); break;
    case 'item_scores': (d.scores[r.item_id] ||= {})[r.student_id] = r.value == null ? null : Number(r.value); break;
    case 'csb': d.csb[r.student_id] = { rate: r.rate == null ? null : Number(r.rate), done: !!r.done, memo: r.memo || '' }; break;
    case 'class_members': { const i = d.members.findIndex(m => m.user_id === r.user_id); if (i >= 0) d.members[i] = r; else d.members.push(r); break; }
    case 'classes': d.cls = { ...d.cls, ...r }; { const c = S.classes.find(x => x.id === r.id); if (c) for (const k of ['name', 'subject', 'term', 'archived', 'grade', 'room']) if (k in r) c[k] = r[k]; } break;
  }
}

/* ───────── 오프라인 대기열 ───────── */
const CONFLICT = { marks: 'session_id,student_id', item_scores: 'class_id,item_id,student_id', csb: 'student_id', students: 'id', sessions: 'id', csb_logs: 'id' };
function applyOp(o) {
  const d = S.d; if (!d || o.cid !== S.cur) return;
  if (o.kind === 'upsert') applyRow(o.table, o.row);
  else if (o.kind === 'update') {
    if (o.table === 'classes') applyRow('classes', { id: o.cid, ...o.patch });
    else if (o.table === 'sessions') { const s = d.sessions.find(x => x.id === o.match.id); if (s) Object.assign(s, o.patch); }
    else if (o.table === 'students') { const s = d.students.find(x => x.id === o.match.id); if (s) Object.assign(s, o.patch); }
  } else if (o.kind === 'delete') {
    if (o.table === 'sessions') { d.sessions = d.sessions.filter(s => s.id !== o.match.id); delete d.marks[o.match.id]; }
    if (o.table === 'students') d.students = d.students.filter(s => s.id !== o.match.id);
    if (o.table === 'csb_logs') d.logs = d.logs.filter(l => l.id !== o.match.id);
    if (o.table === 'item_scores') delete d.scores[o.match.item_id];
  }
}
function replayOutbox() { S.outbox.forEach(applyOp); }
function enqueue(o) {
  o.cid = S.cur; o.key ||= o.kind === 'upsert' ? pk(o.table, o.row) : (o.match?.id || JSON.stringify(o.match));
  // 같은 칸을 여러 번 바꾸면 마지막 것만 보냄
  if (o.kind === 'upsert') S.outbox = S.outbox.filter(x => !(x.kind === 'upsert' && x.table === o.table && x.key === o.key));
  S.outbox.push(o); LS.set('outbox', S.outbox);
  applyOp(o); saveCacheSoon(); emit();
  flushSoon();
}
let flushT; function flushSoon() { clearTimeout(flushT); flushT = setTimeout(flush, 300); }
const isNet = e => !navigator.onLine || /fetch|network|load failed|timed? ?out|aborted/i.test(String(e?.message || e || ''));
let flushing = null;
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!sb || !S.user) return;
    S.syncing = true; emit();
    let refreshed = false;
    while (S.outbox.length) {
      if (!navigator.onLine) break;
      const o = S.outbox[0];
      let q;
      if (o.kind === 'upsert') q = sb.from(o.table).upsert(o.row, { onConflict: CONFLICT[o.table] });
      else if (o.kind === 'update') q = sb.from(o.table).update(o.patch).match(o.match);
      else q = sb.from(o.table).delete().match(o.match);
      const { error } = await q;
      if (error) {
        if (isNet(error)) break;
        if (/JWT|token/i.test(error.message) && !refreshed) { refreshed = true; await sb.auth.refreshSession(); continue; }
        S.outbox.shift(); LS.set('outbox', S.outbox);
        toastFn(/row-level security|permission/i.test(error.message) ? '이 반에서 그 작업을 할 권한이 없습니다. 담당 선생님께 권한을 요청하세요.' : '저장하지 못한 변경이 1건 있습니다: ' + error.message);
        setTimeout(() => fetchClass(), 500);
        continue;
      }
      S.outbox.shift(); LS.set('outbox', S.outbox);
    }
    S.syncing = false; S.lastError = ''; emit();
  })().finally(() => { flushing = null; });
  return flushing;
}
function noteError(e) {
  S.lastError = isNet(e) ? '' : String(e?.message || e);
  if (S.lastError) console.warn(e);
  emit();
}
addEventListener('online', () => { S.online = true; emit(); flush().then(() => { refreshClasses(); fetchClass(); }); });
addEventListener('offline', () => { S.online = false; emit(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) { flush(); fetchClass(); } else saveCache(); });
setInterval(() => { if (S.outbox.length && navigator.onLine) flush(); }, 20000);

/* ───────── 변경 함수 ───────── */
const uuid = () => crypto.randomUUID();
export const nid = () => Math.random().toString(36).slice(2, 10);

export function setMark(sessionId, studentId, state) {
  enqueue({ kind: 'upsert', table: 'marks', row: { session_id: sessionId, student_id: studentId, class_id: S.cur, state } });
}
export function createSession(data) {
  const id = uuid();
  enqueue({ kind: 'upsert', table: 'sessions', row: { id, class_id: S.cur, created_by: S.user.id, ...data } });
  return id;
}
export const updateSession = (id, patch) => enqueue({ kind: 'update', table: 'sessions', match: { id }, patch });
export const deleteSession = id => enqueue({ kind: 'delete', table: 'sessions', match: { id } });
export function addStudents(list) { for (const s of list) enqueue({ kind: 'upsert', table: 'students', row: { id: s.id || uuid(), class_id: S.cur, no: s.no, name: s.name } }); }
export const updateStudent = (id, patch) => enqueue({ kind: 'update', table: 'students', match: { id }, patch });
export const deleteStudent = id => enqueue({ kind: 'delete', table: 'students', match: { id } });
export const updateClass = patch => enqueue({ kind: 'update', table: 'classes', match: { id: S.cur }, patch, key: 'cls:' + Object.keys(patch).join(',') });
export const setScore = (itemId, studentId, value) => enqueue({ kind: 'upsert', table: 'item_scores', row: { class_id: S.cur, item_id: itemId, student_id: studentId, value } });
export const clearItemScores = itemId => enqueue({ kind: 'delete', table: 'item_scores', match: { class_id: S.cur, item_id: itemId } });
export const saveCsb = (studentId, v) => enqueue({ kind: 'upsert', table: 'csb', row: { student_id: studentId, class_id: S.cur, rate: v.rate, done: !!v.done, memo: v.memo || '' } });
export const addLog = l => enqueue({ kind: 'upsert', table: 'csb_logs', row: { id: uuid(), class_id: S.cur, created_by: S.user.id, ...l } });
export const deleteLog = id => enqueue({ kind: 'delete', table: 'csb_logs', match: { id } });

// 아래는 인터넷 연결이 필요한 작업
function needOnline() { if (!navigator.onLine) throw new Error('인터넷에 연결된 뒤 다시 시도해 주세요.'); }
export async function createClass(meta, scoring) {
  needOnline();
  const { data, error } = await sb.rpc('create_class', { p_name: meta.name, p_subject: meta.subject, p_term: meta.term || '', p_hours: meta.hours || 64, p_scoring: scoring || {} });
  if (error) throw error;
  await refreshClasses();
  openClass(data);
  return data;
}
export async function requestJoin(code) {
  needOnline();
  const { data, error } = await sb.rpc('request_join', { p_code: code });
  if (error) throw error;
  await refreshClasses();
  return data;
}
export async function setMember(userId, patch) {
  needOnline();
  const { error } = await sb.from('class_members').update(patch).match({ class_id: S.cur, user_id: userId });
  if (error) throw error;
  await fetchClass();
}
export async function removeMember(userId) {
  needOnline();
  const { error } = await sb.from('class_members').delete().match({ class_id: S.cur, user_id: userId });
  if (error) throw error;
  if (userId === S.user.id) { LS.del(cacheKey(S.cur)); S.cur = null; S.d = null; LS.set('cur', null); teardown(); await refreshClasses(); }
  else await fetchClass();
}
export async function deleteClass(cid) {
  needOnline();
  const { error } = await sb.from('classes').delete().eq('id', cid);
  if (error) throw error;
  LS.del(cacheKey(cid));
  S.outbox = S.outbox.filter(o => o.cid !== cid); LS.set('outbox', S.outbox);
  if (S.cur === cid) { S.cur = null; S.d = null; LS.set('cur', null); teardown(); }
  await refreshClasses();
}
export async function fetchAudit(limit = 150) {
  needOnline();
  const { data, error } = await sb.from('audit_log').select('*').eq('class_id', S.cur).order('at', { ascending: false }).limit(limit);
  if (error) throw error;
  loadNames(data.map(a => a.user_id));
  return data;
}
