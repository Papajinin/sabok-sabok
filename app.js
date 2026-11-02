// 사복사복: 상태(풀이 기록·오답노트·회독), 공통 도구, 홈·문제 풀기·결과 화면
//  - 문제 데이터(Q)는 sync.js가 불러와서 setQuestions()로 넣어 줌 (Firebase 또는 이 컴퓨터의 data/ 폴더)
//  - 풀이 기록(state)은 이 기기(localStorage)에 저장하고, 로그인하면 sync.js가 클라우드와 맞춤

const STORE_KEY = 'sabok';
const MARKS = '①②③④⑤';
const SUBJECTS = [ // 시험지 순서
  { k: '인간행동', full: '인간행동과 사회환경', session: 1 },
  { k: '조사론', full: '사회복지조사론', session: 1 },
  { k: '실천론', full: '사회복지실천론', session: 2 },
  { k: '실천기술론', full: '사회복지실천기술론', session: 2 },
  { k: '지역사회', full: '지역사회복지론', session: 2 },
  { k: '정책론', full: '사회복지정책론', session: 3 },
  { k: '행정론', full: '사회복지행정론', session: 3 },
  { k: '법제론', full: '사회복지법제론', session: 3 },
];
const SESSION_MIN = { 1: 50, 2: 75, 3: 75 }; // 모의고사 시간(분)
// 문제 글에서 형광펜으로 칠할 말 (거꾸로 묻는 문제)
const NEG = /(옳지\s?않은|옳지\s?않는|적절하지\s?않은|해당하지\s?않는|해당되지\s?않는|맞지\s?않는|관계가?\s?없는|거리가\s?먼|틀린\s?것|아닌\s?것)/g;

let Q = [];          // 모든 문제 (연도·교시·번호 순)
let QI = {};         // id → 문제
let YEARS = [];      // 들어 있는 연도 (최근 먼저)
let ROUNDS = {};     // 연도 → 회차
let state = loadLocal();
let view = { tab: 'home', screen: null, data: {} }; // 지금 화면

function defaultState() {
  return {
    settings: { examDate: '', subjects: [], years: [], count: 25, order: 'unsolved' },
    round: 1,          // 지금 몇 회독째
    rounds: [],        // 끝낸 회독 [{ n, at }]
    rec: {},           // 문제 id → { r: 마지막으로 푼 회독, a: 고른 답, ok, c: 맞힌 횟수, w: 틀린 횟수, t }
    note: {},          // 오답노트: 문제 id → { tag: 'x'(틀림) | 'h'(헷갈림), at }
    resume: null,      // 풀던 묶음 (이어 풀기)
    mocks: [],         // 모의고사 기록
    statsSince: Date.now(), // 정답률을 센 시작 시각 (초기화하면 바뀜)
    updatedAt: 0
  };
}

function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.rec) return normalize(s);
  } catch (e) {}
  return defaultState();
}
function normalize(s) {
  const d = defaultState();
  return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
}
function saveLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}
// 기록이 바뀔 때마다 부름: 이 기기에 저장 + (로그인했으면) 클라우드에 올림
function saveState() {
  state.updatedAt = Date.now();
  saveLocal();
  if (typeof cloudSave === 'function') cloudSave();
}

function setQuestions(list, rounds) {
  Q = list.slice().sort((a, b) => a.year - b.year || a.session - b.session || a.no - b.no);
  QI = {};
  Q.forEach(q => { QI[q.id] = q; });
  YEARS = [...new Set(Q.map(q => q.year))].sort((a, b) => b - a);
  ROUNDS = rounds || {};
  // 없어진 연도는 고른 목록에서 뺌
  state.settings.years = state.settings.years.filter(y => YEARS.includes(y));
}

// ---------- 도구 ----------
const appEl = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function yy(y) { return String(y).slice(2); }
function where(q) { return `${yy(q.year)}년 ${q.session}교시 · ${q.subject} ${q.no}번`; }
function stemText(q) { return q.parts.filter(p => p.t === 'p').map(p => p.text).join(' '); }
function solvedNow(id) { const r = state.rec[id]; return !!r && r.r === state.round; }

let toastTimer = null;
function toast(msg, ms) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2200);
}

// 아래에서 올라오는 선택 창: buttons = [{ label, cls, fn }]
const sheetEl = document.getElementById('sheet');
function showSheet(msg, buttons, extraHtml) {
  document.getElementById('sheetMsg').textContent = msg;
  const body = document.getElementById('sheetBody');
  body.innerHTML = extraHtml || '';
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'btn ' + (b.cls || 'ghost');
    el.textContent = b.label;
    el.addEventListener('click', () => { if (b.fn(body) !== false) hideSheet(); });
    body.appendChild(el);
  });
  sheetEl.hidden = false;
}
function hideSheet() { sheetEl.hidden = true; }
document.getElementById('sheetCancel').addEventListener('click', hideSheet);
sheetEl.addEventListener('click', e => { if (e.target === sheetEl) hideSheet(); });

function dday() {
  if (!state.settings.examDate) return '';
  const t = new Date(state.settings.examDate + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const n = Math.round((t - now) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : `D+${-n}`;
}

// ---------- 화면 바꾸기 ----------
function go(tab, screen, data) {
  view = { tab, screen: screen || null, data: data || {} };
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (!Q.length) { appEl.innerHTML = '<div class="empty">문제를 불러오는 중…</div>'; return; }
  const full = view.screen; // 문제 푸는 화면 등은 아래 탭을 숨김
  tabsEl.hidden = !!full;
  appEl.classList.toggle('no-tabs', !!full);
  tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === view.tab));
  const n = Object.keys(state.note).length;
  document.getElementById('noteTabLabel').textContent = n ? `오답 ${n}` : '오답';
  if (view.screen === 'quiz') return renderQuiz();
  if (view.screen === 'result') return renderResult();
  if (view.screen === 'mockResult') return renderMockResult();
  ({ home: renderHome, note: renderNote, search: renderSearch, mock: renderMock, stats: renderStats })[view.tab]();
}
tabsEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) go(b.dataset.tab);
});

// ---------- 홈 ----------
function roundProgress() {
  const done = Q.filter(q => solvedNow(q.id)).length;
  return { done, total: Q.length, pct: Q.length ? done / Q.length * 100 : 0 };
}
function poolFor(subjects, years) {
  return Q.filter(q => (!subjects.length || subjects.includes(q.subject)) && (!years.length || years.includes(q.year)));
}

function headHtml(title, right) {
  return `<div class="head"><div class="head-row"><div class="logo">${title}</div>${right || ''}</div></div>`;
}

function renderHome() {
  const s = state.settings;
  const p = roundProgress();
  const d = dday();
  const pool = poolFor(s.subjects, s.years);
  const unsolved = pool.filter(q => !solvedNow(q.id)).length;
  const r = state.resume;
  const chip = (on, label, attr) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr}>${esc(label)}</button>`;
  const counts = [10, 25, 50];
  const custom = !counts.includes(s.count) && s.count !== 0;
  appEl.innerHTML = `
    <div class="head">
      <div class="head-row"><div class="logo">SABOK SABOK</div>${d ? `<div class="dday">${d}</div>` : ''}</div>
      <div class="prog-t">${state.round}회독 · 전체 ${p.done.toLocaleString()} / ${p.total.toLocaleString()} 풀었음</div>
      <div class="bar"><i style="width:${p.pct.toFixed(1)}%"></i></div>
    </div>
    <div class="body">
      ${r ? `<button class="resume" type="button" id="resumeBtn">▶ 이어 풀기<small>${esc(r.title)} · ${r.idx + 1} / ${r.ids.length}${r.kind === 'mock' ? ' · 모의고사' : ''}</small></button>` : ''}
      <p class="lbl">과목</p>
      <div class="chips" id="subjChips">
        ${chip(!s.subjects.length, '전체', 'data-v=""')}
        ${SUBJECTS.map(x => chip(s.subjects.includes(x.k), x.k, `data-v="${x.k}"`)).join('')}
      </div>
      <p class="lbl">연도</p>
      <div class="chips" id="yearChips">
        ${chip(!s.years.length, '전체', 'data-v=""')}
        ${YEARS.map(y => chip(s.years.includes(y), yy(y), `data-v="${y}"`)).join('')}
      </div>
      <p class="lbl">문제 수</p>
      <div class="chips" id="countChips">
        ${counts.map(c => chip(s.count === c, String(c), `data-v="${c}"`)).join('')}
        ${chip(custom, custom ? `직접 ${s.count}` : '직접', 'data-v="custom"')}
        ${chip(s.count === 0, '전부', 'data-v="0"')}
      </div>
      <p class="lbl">순서</p>
      <div class="chips" id="orderChips">
        ${chip(s.order === 'unsolved', '안 푼 것 먼저', 'data-v="unsolved"')}
        ${chip(s.order === 'random', '무작위', 'data-v="random"')}
        ${chip(s.order === 'paper', '시험지 순서', 'data-v="paper"')}
      </div>
      <p class="hint">고른 문제 ${pool.length.toLocaleString()}개 · 이번 회독에서 안 푼 문제 ${unsolved.toLocaleString()}개</p>
      <button class="btn yellow start" type="button" id="startBtn"${pool.length ? '' : ' disabled'}>풀기 시작</button>
    </div>`;

  if (r) document.getElementById('resumeBtn').addEventListener('click', resumeQuiz);
  // 여러 개 고르기: "전체"를 누르면 모두 풀림
  const multi = (id, key, num) => document.getElementById(id).addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const v = b.dataset.v;
    if (!v) s[key] = [];
    else {
      const val = num ? Number(v) : v;
      s[key] = s[key].includes(val) ? s[key].filter(x => x !== val) : [...s[key], val];
    }
    saveState(); render();
  });
  multi('subjChips', 'subjects', false);
  multi('yearChips', 'years', true);
  document.getElementById('countChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.v === 'custom') {
      showSheet('몇 문제를 풀까요?', [{ label: '정하기', cls: 'navy', fn: body => {
        const n = parseInt(body.querySelector('input').value, 10);
        if (!(n > 0)) { toast('1 이상의 숫자를 넣어 주세요'); return false; }
        s.count = n; saveState(); render();
      } }], `<input type="number" inputmode="numeric" min="1" placeholder="예: 30" value="${custom ? s.count : ''}">`);
      setTimeout(() => { const i = document.querySelector('#sheetBody input'); if (i) i.focus(); }, 50);
      return;
    }
    s.count = Number(b.dataset.v); saveState(); render();
  });
  document.getElementById('orderChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    s.order = b.dataset.v; saveState(); render();
  });
  document.getElementById('startBtn').addEventListener('click', startPractice);
}

function pickQuestions() {
  const s = state.settings;
  const pool = poolFor(s.subjects, s.years);
  const n = s.count === 0 ? pool.length : Math.min(s.count, pool.length);
  if (s.order === 'random') return shuffle(pool.slice()).slice(0, n);
  if (s.order === 'paper') {
    // 시험지 순서: 이번 회독에서 안 푼 첫 문제부터 차례로 (끝에 닿으면 처음으로)
    let start = pool.findIndex(q => !solvedNow(q.id));
    if (start < 0) start = 0;
    return pool.slice(start).concat(pool.slice(0, start)).slice(0, n);
  }
  const fresh = shuffle(pool.filter(q => !solvedNow(q.id)));
  const old = shuffle(pool.filter(q => solvedNow(q.id)));
  return fresh.concat(old).slice(0, n);
}

function startPractice() {
  const list = pickQuestions();
  if (!list.length) return;
  const s = state.settings;
  const subj = s.subjects.length ? s.subjects.join('·') : '전체 과목';
  const yrs = s.years.length ? s.years.slice().sort().map(yy).join('·') + '년' : '전체 연도';
  startQuiz({ kind: 'practice', title: `${subj} · ${yrs}`, ids: list.map(q => q.id) });
}

// kind: practice(홈), note(오답노트), single(한 문제 보기), mock(모의고사)
function startQuiz(opts) {
  const run = { idx: 0, picks: {}, startedAt: Date.now(), ...opts };
  if (run.kind === 'single') {
    view = { tab: view.tab, screen: 'quiz', data: { run } };
  } else {
    state.resume = run;
    saveState();
    view = { tab: run.kind === 'mock' ? 'mock' : run.kind === 'note' ? 'note' : 'home', screen: 'quiz', data: { run } };
  }
  render();
  window.scrollTo(0, 0);
}
function resumeQuiz() {
  const r = state.resume;
  if (!r) return;
  r.ids = r.ids.filter(id => QI[id]);
  if (!r.ids.length) { state.resume = null; saveState(); return render(); }
  if (r.idx >= r.ids.length) r.idx = r.ids.length - 1;
  view = { tab: r.kind === 'mock' ? 'mock' : r.kind === 'note' ? 'note' : 'home', screen: 'quiz', data: { run: r } };
  render();
}

// ---------- 문제 화면 ----------
function questionHtml(q) {
  let html = '';
  q.parts.forEach((p, i) => {
    if (p.t === 'p') {
      const t = esc(p.text).replace(NEG, '<span class="hl">$1</span>');
      html += i === 0 ? `<p class="q">${q.no}. ${t}</p>` : `<p class="q-after">${t}</p>`;
    } else {
      html += `<div class="box">${p.lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>`;
    }
  });
  return html;
}

function record(id, choice) {
  const q = QI[id];
  const ok = q.answer.includes(choice);
  const r = state.rec[id] || { c: 0, w: 0 };
  r.a = choice; r.ok = ok; r.r = state.round; r.t = Date.now();
  if (ok) r.c++; else r.w++;
  state.rec[id] = r;
  return ok;
}
// 모든 문제를 이번 회독에서 풀었으면 다음 회독으로
function checkRound() {
  if (!Q.length || Q.some(q => !solvedNow(q.id))) return false;
  state.rounds.push({ n: state.round, at: Date.now() });
  state.round++;
  toast(`🎉 ${state.round - 1}회독 완료! 이제 ${state.round}회독이에요`, 3500);
  return true;
}

function renderQuiz() {
  const run = view.data.run;
  const mock = run.kind === 'mock';
  if (mock && Date.now() > run.endsAt) return submitMock(true);
  const id = run.ids[run.idx];
  const q = QI[id];
  const picked = run.picks[id];
  const shown = !mock && picked !== undefined;
  const pct = (run.idx + (shown ? 1 : 0)) / run.ids.length * 100;
  const opts = q.choices.map((c, i) => {
    const n = i + 1;
    let cls = '', tag = '';
    if (shown) {
      if (q.answer.includes(n)) { cls = 'right'; tag = n === picked ? '✓ 정답 · 내가 고름' : '✓ 정답'; }
      else if (n === picked) { cls = 'wrong'; tag = '✗ 내가 고름'; }
    } else if (mock && n === picked) cls = 'pick';
    return `<button type="button" class="opt ${cls}" data-n="${n}"${shown ? ' disabled' : ''}><span class="n">${MARKS[i]}</span><span class="t">${esc(c)}</span>${tag ? `<em>${tag}</em>` : ''}</button>`;
  }).join('');

  const inNote = state.note[id];
  let actions = '';
  if (mock) {
    const last = run.idx === run.ids.length - 1;
    actions = `<div class="mock-nav">
        <button class="btn ghost" type="button" id="prevBtn"${run.idx ? '' : ' disabled'}>←</button>
        <button class="btn ghost grid-btn" type="button" id="gridBtn">번호판</button>
        ${last ? '<button class="btn navy" type="button" id="submitBtn">제출</button>' : '<button class="btn navy" type="button" id="nextBtn">→</button>'}
      </div>
      ${last ? '' : '<button class="btn yellow next" type="button" id="submitBtn">제출하기</button>'}`;
  } else if (shown) {
    actions = `<div class="acts">
        <button class="btn line" type="button" id="noteBtn">${inNote ? `📝 오답노트에 있음 (${inNote.tag === 'x' ? '틀림' : '헷갈림'})` : '📝 오답노트에 넣기'}</button>
        <button class="btn ghost" type="button" id="aiBtn">🤖 AI 질문 복사</button>
      </div>
      ${run.kind === 'single' ? '<button class="btn navy next" type="button" id="doneBtn">닫기</button>'
        : `<button class="btn navy next" type="button" id="nextBtn">${run.idx === run.ids.length - 1 ? '결과 보기' : '다음 문제 →'}</button>`}`;
  }

  appEl.innerHTML = `
    <div class="head">
      <div class="qhead">
        <button class="back" type="button" id="backBtn">← ${run.kind === 'single' ? '' : `${run.idx + 1} / ${run.ids.length}`}</button>
        ${mock ? `<span class="timer" id="timer"></span>` : ''}
        <span class="where">${esc(where(q))}</span>
      </div>
      ${run.kind === 'single' ? '' : `<div class="qbar"><i style="width:${pct}%"></i></div>`}
    </div>
    <div class="body">
      ${questionHtml(q)}
      <div id="opts">${opts}</div>
      ${actions}
    </div>`;

  document.getElementById('backBtn').addEventListener('click', () => {
    stopTimer();
    if (run.kind === 'single') return go(view.tab, null);
    go(view.tab);
    if (run.kind !== 'mock') toast('이어 풀기로 다시 시작할 수 있어요');
  });
  document.getElementById('opts').addEventListener('click', e => {
    const b = e.target.closest('.opt');
    if (!b || b.disabled) return;
    const n = Number(b.dataset.n);
    if (mock) {
      run.picks[id] = run.picks[id] === n ? undefined : n; // 같은 답을 다시 누르면 지움
      if (run.picks[id] === undefined) delete run.picks[id];
      saveState();
      return renderQuiz();
    }
    run.picks[id] = n;
    record(id, n);
    checkRound();
    saveState();
    renderQuiz();
  });
  if (mock) {
    startTimer(run);
    document.getElementById('gridBtn').addEventListener('click', () => showGrid(run));
    document.querySelectorAll('#submitBtn').forEach(b => b.addEventListener('click', () => confirmSubmit(run)));
    const prev = document.getElementById('prevBtn');
    prev.addEventListener('click', () => moveTo(run, run.idx - 1));
    const next = document.getElementById('nextBtn');
    if (next) next.addEventListener('click', () => moveTo(run, run.idx + 1));
    return;
  }
  if (!shown) return;
  document.getElementById('noteBtn').addEventListener('click', () => noteMenu(id, picked !== undefined && !q.answer.includes(picked), renderQuiz));
  document.getElementById('aiBtn').addEventListener('click', () => copyForAI(q, picked));
  const next = document.getElementById('nextBtn');
  if (next) next.addEventListener('click', () => {
    if (run.idx < run.ids.length - 1) { run.idx++; saveState(); renderQuiz(); window.scrollTo(0, 0); }
    else finishPractice(run);
  });
  const done = document.getElementById('doneBtn');
  if (done) done.addEventListener('click', () => go(view.tab, null));
}

function moveTo(run, i) {
  run.idx = Math.max(0, Math.min(run.ids.length - 1, i));
  saveState();
  renderQuiz();
  window.scrollTo(0, 0);
}

// 오답노트 넣기/빼기 (버튼으로만)
function noteMenu(id, wasWrong, after) {
  const cur = state.note[id];
  if (cur) {
    showSheet(`오답노트에 ${cur.tag === 'x' ? '틀림' : '헷갈림'}으로 들어 있어요`, [
      { label: cur.tag === 'x' ? '헷갈림으로 바꾸기' : '틀림으로 바꾸기', fn: () => { cur.tag = cur.tag === 'x' ? 'h' : 'x'; saveState(); after(); } },
      { label: '오답노트에서 빼기', cls: 'danger', fn: () => { delete state.note[id]; saveState(); toast('오답노트에서 뺐어요'); after(); } }
    ]);
    return;
  }
  const add = tag => { state.note[id] = { tag, at: Date.now() }; saveState(); toast(`오답노트에 넣었어요 (${tag === 'x' ? '틀림' : '헷갈림'})`); after(); };
  const x = { label: '❌ 틀림으로 넣기', cls: 'line', fn: () => add('x') };
  const h = { label: '🤔 헷갈림으로 넣기', cls: 'line', fn: () => add('h') };
  showSheet('오답노트에 어떻게 넣을까요?', wasWrong ? [x, h] : [h, x]);
}

// AI에게 물어볼 글 만들기
function aiText(q, picked) {
  const head = `[사회복지사 1급 ${q.year}년${ROUNDS[q.year] ? `(제${ROUNDS[q.year]}회)` : ''} ${q.session}교시 ${q.no}번 · ${q.subjectFull}]`;
  const body = q.parts.map(p => p.t === 'p' ? p.text : p.lines.join('\n')).join('\n');
  const ch = q.choices.map((c, i) => `${MARKS[i]} ${c}`).join('\n');
  const ans = q.answer.map(n => MARKS[n - 1]).join(', ');
  let tail = `정답: ${ans}`;
  if (picked !== undefined) tail += ` / 내가 고른 답: ${MARKS[picked - 1]}`;
  const ask = picked !== undefined && !q.answer.includes(picked)
    ? `왜 ${ans}이(가) 정답이고 ${MARKS[picked - 1]}은(는) 틀렸는지, 그리고 나머지 보기도 하나씩 쉽게 설명해 줘.`
    : `왜 ${ans}이(가) 정답인지, 나머지 보기는 왜 아닌지 하나씩 쉽게 설명해 줘.`;
  return `${head}\n${body}\n\n${ch}\n\n${tail}\n${ask}${q.subject === '법제론' ? '\n(법이 바뀌었을 수 있으니 지금 법 기준으로도 알려 줘.)' : ''}`;
}
function copyForAI(q, picked) {
  const text = aiText(q, picked);
  const ok = () => toast('복사했어요. AI 앱에 붙여 넣으세요');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text) && ok());
  } else if (fallbackCopy(text)) ok();
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  if (!ok) toast('복사하지 못했어요');
  return ok;
}

// ---------- 결과 ----------
function finishPractice(run) {
  state.resume = null;
  saveState();
  view = { tab: view.tab, screen: 'result', data: { run } };
  render();
  window.scrollTo(0, 0);
}

function listCard(q, right) {
  return `<div class="card" data-id="${q.id}">
      <div class="m"><span>${right.tag || ''}${esc(where(q))}</span>${right.btn || ''}</div>
      <p>${esc(stemText(q))}</p>
    </div>`;
}
function noteBtnHtml(id) {
  const n = state.note[id];
  return n ? `<button type="button" class="mini" data-act="note">📝 ${n.tag === 'x' ? '틀림' : '헷갈림'}</button>`
    : '<button type="button" class="mini add" data-act="note">+ 오답노트</button>';
}
// 목록 카드 공통: 카드를 누르면 그 문제 보기, 작은 버튼은 오답노트
function bindCards(container, after) {
  container.addEventListener('click', e => {
    const card = e.target.closest('.card'); if (!card) return;
    const id = card.dataset.id;
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'note') return noteMenu(id, state.rec[id] && !state.rec[id].ok, after);
    if (act && act.dataset.act === 'out') { delete state.note[id]; saveState(); toast('오답노트에서 뺐어요'); return after(); }
    startQuiz({ kind: 'single', title: '', ids: [id] });
  });
}

function renderResult() {
  const run = view.data.run;
  const ids = run.ids.filter(id => run.picks[id] !== undefined);
  const wrong = ids.filter(id => !QI[id].answer.includes(run.picks[id]));
  const ok = ids.length - wrong.length;
  appEl.innerHTML = `
    ${headHtml('다 풀었어요')}
    <div class="body">
      <div class="score"><b>${ok} / ${ids.length}</b><span>맞힘 · ${ids.length ? Math.round(ok / ids.length * 100) : 0}%</span></div>
      ${wrong.length ? `<p class="lbl">틀린 문제 ${wrong.length}개</p><div id="wrongList">${wrong.map(id => listCard(QI[id], { tag: '<span class="tag x">틀림</span>', btn: noteBtnHtml(id) })).join('')}</div>
        <button class="btn line start" type="button" id="retryBtn">틀린 문제만 다시 풀기</button>` : '<p class="empty">모두 맞혔어요 👏</p>'}
      <button class="btn navy start" type="button" id="homeBtn">홈으로</button>
    </div>`;
  if (wrong.length) {
    bindCards(document.getElementById('wrongList'), renderResult);
    document.getElementById('retryBtn').addEventListener('click', () => startQuiz({ kind: run.kind === 'note' ? 'note' : 'practice', title: '틀린 문제 다시', ids: shuffle(wrong.slice()) }));
  }
  document.getElementById('homeBtn').addEventListener('click', () => go(run.kind === 'note' ? 'note' : 'home'));
}
