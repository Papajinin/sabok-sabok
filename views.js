// 사복사복: 오답노트 · 검색(오답노트 머리의 🔍) · 모의고사 · 기록 화면

// ---------- 오답노트 ----------
const GRAD = 3; // 연속으로 이만큼 맞히면 졸업 후보 (빼는 건 직접)
function noteSeen(id) { // 마지막으로 본 때: 넣은 뒤 안 풀었으면 넣은 때
  const r = state.rec[id];
  return Math.max(r && r.t || 0, state.note[id].at || 0);
}
function noteWrong(id) { return state.rec[id] ? state.rec[id].w || 0 : 0; }
function noteSort(ids, how) {
  if (how === 'random') return shuffle(ids.slice());
  const by = {
    new: (a, b) => state.note[b].at - state.note[a].at,
    old: (a, b) => noteSeen(a) - noteSeen(b),
    wrong: (a, b) => noteWrong(b) - noteWrong(a) || noteSeen(a) - noteSeen(b)
  }[how];
  return ids.slice().sort(by);
}
function renderNote() {
  if (view.data.search) return renderSearch();
  const s = state.settings;
  const f = view.data.filter || 'all';
  const grad = !!view.data.grad;
  const all = Object.keys(state.note).filter(id => QI[id]);
  const byTag = t => all.filter(id => state.note[id].tag === t).length;
  const isGrad = id => (state.note[id].s || 0) >= GRAD;
  const gradN = all.filter(isGrad).length;
  const list = all.filter(id => (f === 'all' || state.note[id].tag === f)
    && (!s.nSubjects.length || s.nSubjects.includes(QI[id].subject))
    && (!s.nYears.length || s.nYears.includes(QI[id].year))
    && (!grad || isGrad(id)));
  const solveN = s.nCount === 0 ? list.length : Math.min(s.nCount, list.length);
  // 과목별 오답 수 (많은 순)
  const bars = SUBJECTS.map(x => ({ k: x.k, n: all.filter(id => QI[id].subject === x.k).length }))
    .filter(x => x.n).sort((a, b) => b.n - a.n);
  const maxN = bars.length ? bars[0].n : 1;
  const shownBars = view.data.moreBars ? bars : bars.slice(0, 3);
  const chip = (on, label, attr) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr}>${esc(label)}</button>`;
  const streak = id => { const k = Math.min(state.note[id].s || 0, GRAD); return '✓'.repeat(k) + '○'.repeat(GRAD - k); };
  appEl.innerHTML = `
    ${headHtml('오답노트', '<button type="button" class="head-btn" id="searchBtn">🔍 전체 검색</button>')}
    <div class="body">
      ${bars.length ? `<div class="nbars" id="bars">
        ${shownBars.map(x => `<button type="button" class="nbar${s.nSubjects.length === 1 && s.nSubjects[0] === x.k ? ' on' : ''}" data-v="${x.k}">
          <span>${x.k}</span><i><b style="width:${(x.n / maxN * 100).toFixed(0)}%"></b></i><em>${x.n}</em></button>`).join('')}
        ${bars.length > 3 ? `<button type="button" class="more" id="moreBars">${view.data.moreBars ? '접기' : `과목 ${bars.length - 3}개 더 보기`}</button>` : ''}
      </div>` : ''}
      <div class="seg" id="seg">
        <button type="button" data-f="all" class="${f === 'all' ? 'on' : ''}">전체 ${all.length}</button>
        <button type="button" data-f="x" class="${f === 'x' ? 'on' : ''}">틀림 ${byTag('x')}</button>
        <button type="button" data-f="h" class="${f === 'h' ? 'on' : ''}">헷갈림 ${byTag('h')}</button>
      </div>
      <p class="lbl">과목</p>
      <div class="chips" id="nSubj">
        ${chip(!s.nSubjects.length, '전체', 'data-v=""')}
        ${SUBJECTS.map(x => chip(s.nSubjects.includes(x.k), x.k, `data-v="${x.k}"`)).join('')}
      </div>
      <p class="lbl">연도</p>
      <div class="chips" id="nYear">
        ${chip(!s.nYears.length, '전체', 'data-v=""')}
        ${YEARS.map(y => chip(s.nYears.includes(y), yy(y), `data-v="${y}"`)).join('')}
      </div>
      <p class="lbl">문제 수</p>
      <div class="chips" id="nCount">
        ${[10, 25].map(c => chip(s.nCount === c, String(c), `data-v="${c}"`)).join('')}
        ${chip(s.nCount === 0, '전부', 'data-v="0"')}
      </div>
      <p class="lbl">풀기 순서</p>
      <div class="chips" id="nOrder">
        ${chip(s.nOrder === 'old', '오래 안 본 것 먼저', 'data-v="old"')}
        ${chip(s.nOrder === 'random', '무작위', 'data-v="random"')}
        ${chip(s.nOrder === 'wrong', '많이 틀린 것 먼저', 'data-v="wrong"')}
      </div>
      <button class="btn yellow start" type="button" id="solveBtn"${list.length ? '' : ' disabled'}>오답 풀기 ▶ ${solveN}문제</button>
      <div class="nrow">
        ${gradN || grad ? `<button type="button" class="chip grad${grad ? ' on' : ''}" id="gradBtn">🎓 졸업 후보 ${gradN}</button>` : '<span></span>'}
        <select class="nsort" id="nSort" aria-label="목록 정렬">
          <option value="new"${s.nSort === 'new' ? ' selected' : ''}>최근 넣은 순</option>
          <option value="wrong"${s.nSort === 'wrong' ? ' selected' : ''}>많이 틀린 순</option>
          <option value="old"${s.nSort === 'old' ? ' selected' : ''}>오래 안 본 순</option>
        </select>
      </div>
      ${grad ? `<p class="hint">${GRAD}번 연속으로 맞힌 문제예요. 이제 알 것 같으면 [빼기]를 눌러 주세요.</p>` : ''}
      ${list.length ? `<div id="list">${noteSort(list, s.nSort).map(id => listCard(QI[id], {
          tag: `<span class="tag ${state.note[id].tag}">${state.note[id].tag === 'x' ? '틀림' : '헷갈림'}</span>`,
          btn: `<button type="button" class="mini${isGrad(id) ? ' grad' : ''}" data-act="out">${isGrad(id) ? '🎓 빼기' : '빼기'}</button>`,
          sub: `연속 맞힘 <b class="stk">${streak(id)}</b>${noteWrong(id) ? ` · 틀린 횟수 ${noteWrong(id)}` : ''}${isGrad(id) ? ' · <b class="gtxt">졸업 후보</b>' : ''}`
        })).join('')}</div>`
        : `<p class="empty">${all.length ? '이 조건에 맞는 문제가 없어요.' : '아직 비어 있어요.<br>문제를 푼 뒤 [오답노트에 넣기]를 누르면 여기에 모여요.'}</p>`}
    </div>`;
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  const chipOf = e => e.target.closest('.chip');
  const multi = (id, key, num) => on(id, e => {
    const b = chipOf(e); if (!b) return;
    const v = b.dataset.v;
    if (!v) s[key] = [];
    else { const val = num ? Number(v) : v; s[key] = s[key].includes(val) ? s[key].filter(x => x !== val) : [...s[key], val]; }
    saveState(); render();
  });
  multi('nSubj', 'nSubjects', false);
  multi('nYear', 'nYears', true);
  on('nCount', e => { const b = chipOf(e); if (!b) return; s.nCount = Number(b.dataset.v); saveState(); render(); });
  on('nOrder', e => { const b = chipOf(e); if (!b) return; s.nOrder = b.dataset.v; saveState(); render(); });
  on('seg', e => { const b = e.target.closest('button'); if (!b) return; view.data.filter = b.dataset.f; render(); });
  // 막대를 누르면 그 과목만 (한 번 더 누르면 전체)
  on('bars', e => {
    if (e.target.closest('#moreBars')) { view.data.moreBars = !view.data.moreBars; return render(); }
    const b = e.target.closest('.nbar'); if (!b) return;
    const k = b.dataset.v;
    s.nSubjects = s.nSubjects.length === 1 && s.nSubjects[0] === k ? [] : [k];
    saveState(); render();
  });
  on('gradBtn', () => { view.data.grad = !grad; render(); });
  on('searchBtn', () => { view.data.search = true; render(); window.scrollTo(0, 0); });
  document.getElementById('nSort').addEventListener('change', e => { s.nSort = e.target.value; saveState(); render(); });
  if (!list.length) return;
  on('solveBtn', () => {
    const subj = s.nSubjects.length ? s.nSubjects.join('·') : '';
    const yrs = s.nYears.length ? s.nYears.slice().sort().map(yy).join('·') + '년' : '';
    const title = ['오답노트', subj, yrs, f === 'x' ? '틀림' : f === 'h' ? '헷갈림' : '', grad ? '졸업 후보' : ''].filter(Boolean).join(' · ');
    startQuiz({ kind: 'note', title, ids: noteSort(list, s.nOrder).slice(0, solveN) });
  });
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
    ${headHtml('전체 검색', '<button type="button" class="head-btn" id="noteBack">← 오답노트</button>')}
    <div class="body">
      <input class="search" id="term" type="search" placeholder="예: 사례관리, 에릭슨, 기초생활" value="${esc(term)}" autocomplete="off">
      <div id="results"></div>
    </div>`;
  document.getElementById('noteBack').addEventListener('click', () => go('note'));
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
// 실제 시험지(연도·교시) 또는 섞어 만들기(과목마다 25문제씩 여러 해에서)
function renderMock() {
  const d = view.data;
  const st = state.settings;
  if (!d.mode) d.mode = 'real';
  if (!d.year) d.year = YEARS[0];
  if (!d.session) d.session = 1;
  const hist = state.mocks.slice(-3).reverse();
  const chip = (on, label, attr) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr}>${esc(label)}</button>`;
  let body, ids = [], label = '';
  if (d.mode === 'real') {
    ids = Q.filter(q => q.year === d.year && q.session === d.session).map(q => q.id);
    const subj = SUBJECTS.filter(x => x.session === d.session).map(x => x.k).join(' · ');
    body = `
      <p class="lbl">연도</p>
      <div class="chips" id="yearC">${YEARS.map(y => chip(d.year === y, `${y}${ROUNDS[y] ? ` (${ROUNDS[y]}회)` : ''}`, `data-v="${y}"`)).join('')}</div>
      <p class="lbl">교시</p>
      <div class="chips" id="sesC">${[1, 2, 3].map(x => chip(d.session === x, `${x}교시`, `data-v="${x}"`)).join('')}</div>
      <p class="hint">${subj}<br>${ids.length}문제 · ${SESSION_MIN[d.session]}분 · 다 풀고 제출하면 채점해요</p>`;
    label = '시작하기';
  } else {
    const ses = st.mixSession ? [st.mixSession] : [1, 2, 3];
    const n = ses.reduce((a, x) => a + SUBJECTS.filter(y => y.session === x).length * 25, 0);
    const min = ses.reduce((a, x) => a + SESSION_MIN[x], 0);
    body = `
      <p class="lbl">교시</p>
      <div class="chips" id="mixSes">${[1, 2, 3].map(x => chip(st.mixSession === x, `${x}교시`, `data-v="${x}"`)).join('')}${chip(!st.mixSession, '전체', 'data-v="0"')}</div>
      <p class="lbl">문제 고르기</p>
      <div class="chips" id="mixSrc">
        ${chip(st.mixSrc === 'random', '무작위', 'data-v="random"')}
        ${chip(st.mixSrc === 'unsolved', '안 푼 것 위주', 'data-v="unsolved"')}
        ${chip(st.mixSrc === 'note', '오답노트 위주', 'data-v="note"')}
      </div>
      <p class="hint">과목마다 25문제씩 여러 해에서 골라 새 시험지를 만들어요.<br>${st.mixSession ? '' : '1→2→3교시를 이어서 풀고, 시간은 교시마다 따로 재요.<br>'}${n}문제 · ${min}분</p>`;
    label = `시작 ▶ ${st.mixSession ? `${st.mixSession}교시` : '전체'} ${n}문제`;
    ids = [1];
  }
  appEl.innerHTML = `
    ${headHtml('모의고사')}
    <div class="body">
      <div class="seg" id="modeSeg">
        <button type="button" data-v="real" class="${d.mode === 'real' ? 'on' : ''}">실제 시험지</button>
        <button type="button" data-v="mix" class="${d.mode === 'mix' ? 'on' : ''}">섞어 만들기</button>
      </div>
      ${body}
      ${state.resume && state.resume.kind === 'mock' ? '<p class="hint">⚠️ 보던 모의고사가 있어요. 새로 시작하면 그건 없어져요.</p>' : ''}
      <button class="btn yellow start" type="button" id="goBtn"${ids.length ? '' : ' disabled'}>${label}</button>
      ${hist.length ? `<p class="lbl" style="margin-top:22px">최근 기록</p>${hist.map(mockLine).join('')}` : ''}
    </div>`;
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('modeSeg', e => { const b = e.target.closest('button'); if (b) { d.mode = b.dataset.v; render(); } });
  on('yearC', e => { const b = e.target.closest('.chip'); if (b) { d.year = Number(b.dataset.v); render(); } });
  on('sesC', e => { const b = e.target.closest('.chip'); if (b) { d.session = Number(b.dataset.v); render(); } });
  on('mixSes', e => { const b = e.target.closest('.chip'); if (b) { st.mixSession = Number(b.dataset.v); saveState(); render(); } });
  on('mixSrc', e => { const b = e.target.closest('.chip'); if (b) { st.mixSrc = b.dataset.v; saveState(); render(); } });
  on('goBtn', () => {
    const start = () => {
      if (d.mode === 'real') {
        startQuiz({ kind: 'mock', title: `${d.year}년 ${d.session}교시`, ids, year: d.year, session: d.session,
          stages: [{ session: d.session, from: 0, to: ids.length, min: SESSION_MIN[d.session] }], stage: 0,
          endsAt: Date.now() + SESSION_MIN[d.session] * 60000 });
      } else {
        const m = buildMix(st.mixSession, st.mixSrc);
        const src = { random: '무작위', unsolved: '안 푼 것 위주', note: '오답노트 위주' }[st.mixSrc];
        startQuiz({ kind: 'mock', title: `섞은 모의고사 ${st.mixSession ? `${st.mixSession}교시` : '전체'} · ${src}`, ids: m.ids, mix: true,
          session: st.mixSession, stages: m.stages, stage: 0, endsAt: Date.now() + m.stages[0].min * 60000 });
      }
    };
    if (state.resume && state.resume.kind !== 'mock') {
      showSheet('풀던 문제 묶음이 있어요. 모의고사를 시작하면 이어 풀기는 없어져요.', [{ label: '모의고사 시작', cls: 'navy', fn: start }]);
    } else start();
  });
}
// 섞은 시험지: 교시마다, 과목마다 25문제 (과목 순서대로, 과목 안은 섞음)
function buildMix(session, src) {
  const ids = [], stages = [];
  (session ? [session] : [1, 2, 3]).forEach(x => {
    const from = ids.length;
    SUBJECTS.filter(y => y.session === x).forEach(sub => {
      const pool = Q.filter(q => q.subject === sub.k);
      let order;
      if (src === 'random') order = shuffle(pool.slice());
      else {
        const inNote = src === 'note' ? shuffle(pool.filter(q => state.note[q.id])) : [];
        const rest = pool.filter(q => !inNote.includes(q));
        order = inNote.concat(shuffle(rest.filter(q => !solvedNow(q.id))), shuffle(rest.filter(q => solvedNow(q.id))));
      }
      shuffle(order.slice(0, 25)).forEach(q => ids.push(q.id));
    });
    stages.push({ session: x, from, to: ids.length, min: SESSION_MIN[x] });
  });
  return { ids, stages };
}
// 지금 교시 (옛 기록은 교시 구분이 없어서 전체를 한 교시로)
function stageOf(run) {
  return run.stages ? run.stages[run.stage || 0] : { session: run.session, from: 0, to: run.ids.length, min: SESSION_MIN[run.session] };
}
function hasNextStage(run) { return !!run.stages && (run.stage || 0) < run.stages.length - 1; }
// 교시가 끝남: 다음 교시가 있으면 넘어가고, 없으면 채점
function stageEnd(run, timeUp) {
  if (!hasNextStage(run)) return submitMock(timeUp);
  stopTimer();
  const prev = stageOf(run);
  run.stage = (run.stage || 0) + 1;
  const st = stageOf(run);
  run.idx = st.from;
  run.endsAt = Date.now() + st.min * 60000;
  saveState();
  renderQuiz();
  window.scrollTo(0, 0);
  toast(`${timeUp ? `${prev.session}교시 시간이 끝났어요. ` : ''}${st.session}교시 시작 (${st.min}분)`, 3000);
}
function mockLine(m) {
  const dt = new Date(m.at);
  return `<div class="row-line"><b>${esc(m.title || `${m.year}년 ${m.session}교시`)}</b><span>${dt.getMonth() + 1}/${dt.getDate()} · 평균 ${m.avg}점 · ${m.cut.length ? `과락 ${m.cut.join(', ')}` : '과락 없음'}</span></div>`;
}

let timerId = null;
function startTimer(run) {
  stopTimer();
  const tick = () => {
    const el = document.getElementById('timer');
    const left = run.endsAt - Date.now();
    if (left <= 0) { stopTimer(); return stageEnd(run, true); }
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
  const st = stageOf(run);
  const ids = run.ids.slice(st.from, st.to);
  const html = `<div class="numgrid">${ids.map((id, k) => `<button type="button" data-i="${st.from + k}" class="${run.picks[id] !== undefined ? 'done' : ''}${st.from + k === run.idx ? ' cur' : ''}">${k + 1}</button>`).join('')}</div>`;
  const left = ids.filter(id => run.picks[id] === undefined).length;
  showSheet(left ? `안 푼 문제 ${left}개` : '모두 골랐어요', [], html);
  document.querySelector('#sheetBody .numgrid').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    hideSheet();
    moveTo(run, Number(b.dataset.i));
  });
}
function confirmSubmit(run) {
  const st = stageOf(run);
  const left = run.ids.slice(st.from, st.to).filter(id => run.picks[id] === undefined).length;
  const head = left ? `아직 ${left}문제를 안 골랐어요. ` : '';
  if (hasNextStage(run)) {
    showSheet(`${head}${st.session}교시를 제출하고 다음 교시로 넘어갈까요? 이 교시로는 돌아올 수 없어요.`, [{ label: '다음 교시로', cls: 'navy', fn: () => stageEnd(run, false) }]);
  } else showSheet(head ? `${head}제출할까요?` : '제출하고 채점할까요?', [{ label: '제출', cls: 'navy', fn: () => submitMock(false) }]);
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
  const title = run.mix ? run.title : `${run.year}년 ${run.session}교시`;
  const result = { title, year: run.year, session: run.session, at: Date.now(), scores, avg, cut, timeUp: !!timeUp, ids: run.ids, picks: run.picks };
  state.mocks.push({ title, year: run.year, session: run.session, at: result.at, scores, avg, cut });
  dayLog().m.push({ title, avg });
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
    ${headHtml(`${esc(r.title || `${r.year}년 ${r.session}교시`)} 결과`)}
    <div class="body">
      <div class="score"><b>${r.avg}점</b><span>과목 ${total}개 평균</span><br>
        <span class="verdict${pass ? ' pass' : ''}">${pass ? '합격권' : r.cut.length ? '과락' : '평균 미달'}</span></div>
      ${Object.keys(r.scores).map(k => `<div class="subj-score"><span>${esc(SUBJECTS.find(s => s.k === k).full)}</span><b class="${r.scores[k] < 40 ? 'cut' : ''}">${r.scores[k]}점${r.scores[k] < 40 ? ' 과락' : ''}</b></div>`).join('')}
      <p class="small-note">합격 기준: 모든 과목 40점 이상 + 평균 60점 이상. ${total === SUBJECTS.length ? '세 교시 전체로 본 판정이에요.' : '이 판정은 이 교시만 본 거예요.'}</p>
      ${wrong.length ? `<p class="lbl">틀리거나 안 푼 문제 ${wrong.length}개</p><div id="wrongList">${wrong.map(id => listCard(QI[id], {
        tag: r.picks[id] === undefined ? '<span class="tag h">안 풂</span>' : '<span class="tag x">틀림</span>', btn: noteBtnHtml(id) })).join('')}</div>` : ''}
      <button class="btn navy start" type="button" id="doneBtn">모의고사로</button>
    </div>`;
  if (wrong.length) bindCards(document.getElementById('wrongList'), renderMockResult);
  document.getElementById('doneBtn').addEventListener('click', () => go('mock'));
}

// ---------- 기록 ----------
// 해설 확인 요청 목록: 요청할 때의 해설과 지금 해설이 다르면 고쳐진 것
function flagFixed(id) { return QI[id] && QI[id].exp !== state.expFlags[id].exp; }
function flagSection() {
  const ids = Object.keys(state.expFlags).filter(id => QI[id]).sort((a, b) => state.expFlags[b].at - state.expFlags[a].at);
  if (!ids.length) return '';
  const day = t => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()}`; };
  const fixedN = ids.filter(flagFixed).length;
  return `<div class="section">
        <h3>해설 확인 요청</h3>
        <div id="flagList">${ids.map(id => { const f = state.expFlags[id], ok = flagFixed(id); return `<button type="button" class="flag-row" data-id="${id}">
          <b>${esc(where(QI[id]))}</b>
          <span class="flag-line"><em>${f.note ? `"${esc(f.note)}"` : ''}</em><span class="${ok ? 'fixed' : ''}">${day(f.at)} ${ok ? '✓ 고쳐짐' : '확인 중'}</span></span>
        </button>`; }).join('')}</div>
        ${fixedN ? `<button class="btn ghost start" type="button" id="flagClear">고쳐진 것 목록에서 지우기 (${fixedN})</button>` : ''}
        <p class="small-note">요청한 해설은 아빠가 확인해서 고쳐요. 고쳐지면 "✓ 고쳐짐"으로 바뀌어요.</p>
      </div>`;
}
function renderStats() {
  const p = roundProgress();
  // 과목별 진행률: 이번 회독에서 푼 문제 (맞았든 틀렸든)
  const progs = SUBJECTS.map(s => {
    const all = Q.filter(q => q.subject === s.k);
    const done = all.filter(q => solvedNow(q.id)).length;
    return { s, done, total: all.length, pct: all.length ? done / all.length * 100 : 0 };
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
        <h3>글자 크기</h3>
        <div class="chips" id="fontC">${['보통', '크게', '아주 크게'].map((t, i) => `<button type="button" class="chip${(state.settings.font || 0) === i ? ' on' : ''}" data-v="${i}">${t}</button>`).join('')}</div>
        <p class="small-note">문제·보기·해설·O/X 글자가 커져요.</p>
      </div>
      <div class="section">
        <h3>회독</h3>
        <div class="row-line"><b>지금 ${state.round}회독</b><span>${p.done.toLocaleString()} / ${p.total.toLocaleString()} (${Math.floor(p.pct)}%)</span></div>
        ${state.rounds.map(r => { const d = new Date(r.at); return `<div class="row-line">${r.n}회독 완료<span>${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}</span></div>`; }).join('')}
      </div>
      <div class="section">
        <h3>과목별 진행률</h3>
        ${progs.map(r => `<div class="rate">
            <div class="rate-top"><b>${r.s.k}</b><span>${r.done} / ${r.total} 풀었음 · ${Math.floor(r.pct)}%</span></div>
            <div class="bar"><i style="width:${r.pct.toFixed(1)}%"></i></div>
          </div>`).join('')}
        <p class="small-note">${state.round}회독에서 푼 문제예요. 맞았든 틀렸든 풀면 들어가요.</p>
      </div>
      ${state.mocks.length ? `<div class="section"><h3>모의고사 기록</h3>${state.mocks.slice().reverse().map(mockLine).join('')}</div>` : ''}
      ${flagSection()}
      <div class="section">
        <h3>앱</h3>
        <div class="row-line">버전<span>${APP_VERSION}</span></div>
        <div class="row-line">문제<span>${YEARS.slice().sort().join(', ')}년 · ${Q.length.toLocaleString()}문제</span></div>
        ${user ? `<div class="row-line">계정<span>${esc(user)}</span></div><button class="btn ghost start" type="button" id="logoutBtn">로그아웃</button>` : ''}
      </div>
    </div>`;
  document.getElementById('fontC').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.settings.font = Number(b.dataset.v); saveState(); render();
  });
  const fl = document.getElementById('flagList');
  if (fl) fl.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    startQuiz({ kind: 'single', title: '', ids: [row.dataset.id] });
  });
  const fc = document.getElementById('flagClear');
  if (fc) fc.addEventListener('click', () => {
    Object.keys(state.expFlags).forEach(id => { if (flagFixed(id)) delete state.expFlags[id]; });
    saveState(); toast('고쳐진 요청을 목록에서 지웠어요'); render();
  });
  document.getElementById('examDate').addEventListener('change', e => { state.settings.examDate = e.target.value; saveState(); render(); });
  const lo = document.getElementById('logoutBtn');
  if (lo) lo.addEventListener('click', () => showSheet('로그아웃할까요? 다시 로그인하면 기록이 그대로 돌아와요.', [{ label: '로그아웃', cls: 'danger', fn: cloudSignOut }]));
}
