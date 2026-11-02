// 사복사복: 오답노트 · 검색 · 모의고사 · 기록 화면

// ---------- 오답노트 ----------
function renderNote() {
  const f = view.data.filter || 'all';
  const subj = view.data.subj || '';
  const all = Object.keys(state.note).filter(id => QI[id]);
  const byTag = t => all.filter(id => state.note[id].tag === t).length;
  const list = all
    .filter(id => (f === 'all' || state.note[id].tag === f) && (!subj || QI[id].subject === subj))
    .sort((a, b) => state.note[b].at - state.note[a].at);
  const subjects = SUBJECTS.filter(s => all.some(id => QI[id].subject === s.k));
  appEl.innerHTML = `
    ${headHtml('오답노트', `<div class="dday">${all.length}</div>`)}
    <div class="body">
      <div class="seg" id="seg">
        <button type="button" data-f="all" class="${f === 'all' ? 'on' : ''}">전체 ${all.length}</button>
        <button type="button" data-f="x" class="${f === 'x' ? 'on' : ''}">틀림 ${byTag('x')}</button>
        <button type="button" data-f="h" class="${f === 'h' ? 'on' : ''}">헷갈림 ${byTag('h')}</button>
      </div>
      ${subjects.length > 1 ? `<p class="lbl">과목</p><div class="chips" id="subj">
        <button type="button" class="chip${subj ? '' : ' on'}" data-v="">전체</button>
        ${subjects.map(s => `<button type="button" class="chip${subj === s.k ? ' on' : ''}" data-v="${s.k}">${s.k}</button>`).join('')}
      </div>` : ''}
      ${list.length ? `<button class="btn yellow start" type="button" id="solveBtn">오답만 풀기 ▶ (${list.length}문제)</button>
        <div id="list">${list.map(id => listCard(QI[id], {
          tag: `<span class="tag ${state.note[id].tag}">${state.note[id].tag === 'x' ? '틀림' : '헷갈림'}</span>`,
          btn: '<button type="button" class="mini" data-act="out">빼기</button>'
        })).join('')}</div>`
        : `<p class="empty">${all.length ? '이 조건에 맞는 문제가 없어요.' : '아직 비어 있어요.<br>문제를 푼 뒤 [오답노트에 넣기]를 누르면 여기에 모여요.'}</p>`}
    </div>`;
  document.getElementById('seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    view.data.filter = b.dataset.f; render();
  });
  const sc = document.getElementById('subj');
  if (sc) sc.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    view.data.subj = b.dataset.v; render();
  });
  if (!list.length) return;
  document.getElementById('solveBtn').addEventListener('click', () =>
    startQuiz({ kind: 'note', title: `오답노트${subj ? ` · ${subj}` : ''}${f === 'x' ? ' · 틀림' : f === 'h' ? ' · 헷갈림' : ''}`, ids: shuffle(list.slice()) }));
  bindCards(document.getElementById('list'), render);
}

// ---------- 검색 ----------
let searchIndex = null; // 문제 id → 띄어쓰기를 뺀 글 (한 번만 만듦)
function buildIndex() {
  searchIndex = Q.map(q => ({
    id: q.id,
    flat: (q.parts.map(p => p.t === 'p' ? p.text : p.lines.join(' ')).join(' ') + ' ' + q.choices.join(' ')).replace(/\s+/g, '').toLowerCase()
  }));
}
function renderSearch() {
  const term = view.data.term || '';
  appEl.innerHTML = `
    ${headHtml('검색')}
    <div class="body">
      <input class="search" id="term" type="search" placeholder="예: 사례관리, 에릭슨, 기초생활" value="${esc(term)}" autocomplete="off">
      <div id="results"></div>
    </div>`;
  const input = document.getElementById('term');
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { view.data.term = input.value; showResults(); }, 200);
  });
  if (!term) setTimeout(() => input.focus(), 50);
  showResults();
}
function showResults() {
  const box = document.getElementById('results');
  const term = (view.data.term || '').trim();
  const key = term.replace(/\s+/g, '').toLowerCase();
  if (key.length < 2) {
    box.innerHTML = `<p class="empty">두 글자 이상 넣어 주세요.<br>띄어쓰기가 달라도 찾아요.</p>`;
    return;
  }
  if (!searchIndex) buildIndex();
  const hits = searchIndex.filter(x => x.flat.includes(key)).map(x => QI[x.id]).sort((a, b) => b.year - a.year || a.session - b.session || a.no - b.no);
  // 찾은 낱말에 형광펜 (띄어쓰기가 달라도)
  const re = new RegExp(key.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'gi');
  const snippet = q => {
    const all = q.parts.map(p => p.t === 'p' ? p.text : p.lines.join(' ')).join(' ') + ' ' + q.choices.map((c, i) => MARKS[i] + ' ' + c).join(' ');
    const m = re.exec(all); re.lastIndex = 0;
    const from = m && m.index > 40 ? m.index - 30 : 0;
    const part = (from ? '…' : '') + all.slice(from, from + 120);
    return esc(part).replace(new RegExp(re.source, 'gi'), s => `<mark>${s}</mark>`);
  };
  box.innerHTML = hits.length
    ? `<p class="lbl">${hits.length}개 찾음${hits.length > 100 ? ' (앞의 100개만)' : ''}</p>` + hits.slice(0, 100).map(q => `
      <div class="card" data-id="${q.id}">
        <div class="m"><span>${esc(where(q))}</span>${noteBtnHtml(q.id)}</div>
        <p>${snippet(q)}</p>
      </div>`).join('')
    : '<p class="empty">찾은 문제가 없어요.</p>';
  if (!box.dataset.bound) { bindCards(box, showResults); box.dataset.bound = '1'; }
}

// ---------- 모의고사 ----------
function renderMock() {
  const d = view.data;
  if (!d.year) d.year = YEARS[0];
  if (!d.session) d.session = 1;
  const ids = Q.filter(q => q.year === d.year && q.session === d.session).map(q => q.id);
  const subj = SUBJECTS.filter(s => s.session === d.session).map(s => s.k).join(' · ');
  const hist = state.mocks.slice(-3).reverse();
  appEl.innerHTML = `
    ${headHtml('모의고사')}
    <div class="body">
      <p class="lbl">연도</p>
      <div class="chips" id="yearC">${YEARS.map(y => `<button type="button" class="chip${d.year === y ? ' on' : ''}" data-v="${y}">${y}${ROUNDS[y] ? ` (${ROUNDS[y]}회)` : ''}</button>`).join('')}</div>
      <p class="lbl">교시</p>
      <div class="chips" id="sesC">${[1, 2, 3].map(s => `<button type="button" class="chip${d.session === s ? ' on' : ''}" data-v="${s}">${s}교시</button>`).join('')}</div>
      <p class="hint">${subj}<br>${ids.length}문제 · ${SESSION_MIN[d.session]}분 · 다 풀고 제출하면 채점해요</p>
      ${state.resume && state.resume.kind === 'mock' ? '<p class="hint">⚠️ 보던 모의고사가 있어요. 새로 시작하면 그건 없어져요.</p>' : ''}
      <button class="btn yellow start" type="button" id="goBtn"${ids.length ? '' : ' disabled'}>시작하기</button>
      ${hist.length ? `<p class="lbl" style="margin-top:22px">최근 기록</p>${hist.map(mockLine).join('')}` : ''}
    </div>`;
  document.getElementById('yearC').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { d.year = Number(b.dataset.v); render(); } });
  document.getElementById('sesC').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { d.session = Number(b.dataset.v); render(); } });
  document.getElementById('goBtn').addEventListener('click', () => {
    const start = () => startQuiz({ kind: 'mock', title: `${d.year}년 ${d.session}교시`, ids, year: d.year, session: d.session, endsAt: Date.now() + SESSION_MIN[d.session] * 60000 });
    if (state.resume && state.resume.kind !== 'mock') {
      showSheet('풀던 문제 묶음이 있어요. 모의고사를 시작하면 이어 풀기는 없어져요.', [{ label: '모의고사 시작', cls: 'navy', fn: start }]);
    } else start();
  });
}
function mockLine(m) {
  const dt = new Date(m.at);
  return `<div class="row-line"><b>${m.year}년 ${m.session}교시</b><span>${dt.getMonth() + 1}/${dt.getDate()} · 평균 ${m.avg}점 · ${m.cut.length ? `과락 ${m.cut.join(', ')}` : '과락 없음'}</span></div>`;
}

let timerId = null;
function startTimer(run) {
  stopTimer();
  const tick = () => {
    const el = document.getElementById('timer');
    const left = run.endsAt - Date.now();
    if (left <= 0) { stopTimer(); return submitMock(true); }
    if (!el) return stopTimer();
    const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    el.classList.toggle('low', left < 5 * 60000);
  };
  tick();
  timerId = setInterval(tick, 1000);
}
function stopTimer() { clearInterval(timerId); timerId = null; }

function showGrid(run) {
  const html = `<div class="numgrid">${run.ids.map((id, i) => `<button type="button" data-i="${i}" class="${run.picks[id] !== undefined ? 'done' : ''}${i === run.idx ? ' cur' : ''}">${QI[id].no}</button>`).join('')}</div>`;
  const left = run.ids.filter(id => run.picks[id] === undefined).length;
  showSheet(left ? `안 푼 문제 ${left}개` : '모두 골랐어요', [], html);
  document.querySelector('#sheetBody .numgrid').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    hideSheet();
    moveTo(run, Number(b.dataset.i));
  });
}
function confirmSubmit(run) {
  const left = run.ids.filter(id => run.picks[id] === undefined).length;
  showSheet(left ? `아직 ${left}문제를 안 골랐어요. 제출할까요?` : '제출하고 채점할까요?', [{ label: '제출', cls: 'navy', fn: () => submitMock(false) }]);
}
function submitMock(timeUp) {
  stopTimer();
  const run = state.resume && state.resume.kind === 'mock' ? state.resume : view.data.run;
  if (!run) return go('mock');
  const per = {};
  run.ids.forEach(id => {
    const q = QI[id];
    per[q.subject] = per[q.subject] || { ok: 0, n: 0 };
    per[q.subject].n++;
    const p = run.picks[id];
    if (p !== undefined) {
      record(id, p);
      if (q.answer.includes(p)) per[q.subject].ok++;
    }
  });
  const scores = {};
  Object.keys(per).forEach(k => { scores[k] = Math.round(per[k].ok / per[k].n * 100); });
  const vals = Object.values(scores);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
  const cut = Object.keys(scores).filter(k => scores[k] < 40);
  const result = { year: run.year, session: run.session, at: Date.now(), scores, avg, cut, timeUp: !!timeUp, ids: run.ids, picks: run.picks };
  state.mocks.push({ year: run.year, session: run.session, at: result.at, scores, avg, cut });
  state.resume = null;
  checkRound();
  saveState();
  view = { tab: 'mock', screen: 'mockResult', data: { result } };
  render();
  window.scrollTo(0, 0);
  if (timeUp) toast('시간이 끝나서 제출했어요', 3000);
}
function renderMockResult() {
  const r = view.data.result;
  const pass = !r.cut.length && r.avg >= 60;
  const wrong = r.ids.filter(id => !QI[id].answer.includes(r.picks[id]));
  const total = Object.keys(r.scores).length;
  appEl.innerHTML = `
    ${headHtml(`${r.year}년 ${r.session}교시 결과`)}
    <div class="body">
      <div class="score"><b>${r.avg}점</b><span>과목 ${total}개 평균</span><br>
        <span class="verdict${pass ? ' pass' : ''}">${pass ? '합격권' : r.cut.length ? '과락' : '평균 미달'}</span></div>
      ${Object.keys(r.scores).map(k => `<div class="subj-score"><span>${esc(SUBJECTS.find(s => s.k === k).full)}</span><b class="${r.scores[k] < 40 ? 'cut' : ''}">${r.scores[k]}점${r.scores[k] < 40 ? ' 과락' : ''}</b></div>`).join('')}
      <p class="small-note">합격 기준: 모든 과목 40점 이상 + 평균 60점 이상. 이 판정은 이 교시만 본 거예요.</p>
      ${wrong.length ? `<p class="lbl">틀리거나 안 푼 문제 ${wrong.length}개</p><div id="wrongList">${wrong.map(id => listCard(QI[id], {
        tag: r.picks[id] === undefined ? '<span class="tag h">안 풂</span>' : '<span class="tag x">틀림</span>', btn: noteBtnHtml(id) })).join('')}</div>` : ''}
      <button class="btn navy start" type="button" id="doneBtn">모의고사로</button>
    </div>`;
  if (wrong.length) bindCards(document.getElementById('wrongList'), renderMockResult);
  document.getElementById('doneBtn').addEventListener('click', () => go('mock'));
}

// ---------- 기록 ----------
function renderStats() {
  const p = roundProgress();
  const since = new Date(state.statsSince);
  const rates = SUBJECTS.map(s => {
    let c = 0, w = 0;
    Q.forEach(q => { if (q.subject === s.k && state.rec[q.id]) { c += state.rec[q.id].c; w += state.rec[q.id].w; } });
    return { s, c, w, pct: c + w ? Math.round(c / (c + w) * 100) : null };
  });
  const user = typeof cloudUserEmail === 'function' ? cloudUserEmail() : '';
  appEl.innerHTML = `
    ${headHtml('기록')}
    <div class="body">
      <div class="section">
        <h3>시험 날짜</h3>
        <div class="row-line"><input class="date-in" type="date" id="examDate" value="${esc(state.settings.examDate)}"><b>${dday() || ''}</b></div>
      </div>
      <div class="section">
        <h3>회독</h3>
        <div class="row-line"><b>지금 ${state.round}회독</b><span>${p.done.toLocaleString()} / ${p.total.toLocaleString()} (${Math.floor(p.pct)}%)</span></div>
        ${state.rounds.map(r => { const d = new Date(r.at); return `<div class="row-line">${r.n}회독 완료<span>${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}</span></div>`; }).join('')}
      </div>
      <div class="section">
        <h3>과목별 정답률</h3>
        ${rates.map(r => `<div class="rate">
            <div class="rate-top"><b>${r.s.k}</b><span>${r.pct === null ? '아직 안 풂' : `${r.pct}% · 맞힘 ${r.c} / 푼 ${r.c + r.w}`}</span></div>
            <div class="bar"><i class="${r.pct !== null && r.pct < 60 ? 'weak' : ''}" style="width:${r.pct || 0}%"></i></div>
          </div>`).join('')}
        <p class="small-note">${since.getFullYear()}.${since.getMonth() + 1}.${since.getDate()}부터 센 정답률이에요. 60% 아래는 빨간 막대.</p>
        <button class="btn danger start" type="button" id="resetBtn">정답률 초기화</button>
      </div>
      ${state.mocks.length ? `<div class="section"><h3>모의고사 기록</h3>${state.mocks.slice().reverse().map(mockLine).join('')}</div>` : ''}
      <div class="section">
        <h3>앱</h3>
        <div class="row-line">버전<span>${APP_VERSION}</span></div>
        <div class="row-line">문제<span>${YEARS.slice().sort().join(', ')}년 · ${Q.length.toLocaleString()}문제</span></div>
        ${user ? `<div class="row-line">계정<span>${esc(user)}</span></div><button class="btn ghost start" type="button" id="logoutBtn">로그아웃</button>` : ''}
      </div>
    </div>`;
  document.getElementById('examDate').addEventListener('change', e => { state.settings.examDate = e.target.value; saveState(); render(); });
  document.getElementById('resetBtn').addEventListener('click', () => showSheet('과목별 정답률을 0부터 다시 셀까요? 회독·오답노트는 그대로예요.', [{
    label: '초기화', cls: 'danger', fn: () => {
      Object.values(state.rec).forEach(r => { r.c = 0; r.w = 0; });
      state.statsSince = Date.now();
      saveState(); render(); toast('정답률을 초기화했어요');
    }
  }]));
  const lo = document.getElementById('logoutBtn');
  if (lo) lo.addEventListener('click', () => showSheet('로그아웃할까요? 다시 로그인하면 기록이 그대로 돌아와요.', [{ label: '로그아웃', cls: 'danger', fn: cloudSignOut }]));
}
