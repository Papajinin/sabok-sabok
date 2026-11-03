// 사복사복: 보기 O/X · 비슷한 문제

// ---------- O/X 문장 만들기 ----------
// "옳은 것은?" / "옳지 않은 것은?" 문제의 보기를 O/X 문장으로 (정답이 하나인 것만)
const OX_POS = /(옳은|적절한|맞는)\s?것은/;
const OX_NEG = /(옳지\s?않은|적절하지\s?않은|맞지\s?않는|틀린)\s?것은/;
let oxItems = null; // [{ k: 문제id#보기번호, id, n, text, topic, o: 맞는 문장인지 }]
function buildOX() {
  oxItems = [];
  Q.forEach(q => {
    if (q.answer.length !== 1 || q.parts.some(p => p.t !== 'p')) return; // 상자·표·정답 여러 개는 뺌
    const stem = stemText(q);
    if (/모두\s?고른|들어갈|순서/.test(stem)) return;
    const neg = OX_NEG.test(stem);
    if (!neg && !OX_POS.test(stem)) return;
    // 주제: "에릭슨 … 에 관한 설명으로 옳지 않은 것은?" → "에릭슨 … 에 관한 설명"
    const topic = stem.replace(/\s*(으로|로)?\s*(옳지\s?않은|적절하지\s?않은|맞지\s?않는|틀린|옳은|적절한|맞는)\s?것은\??\s*$/, '').trim();
    q.choices.forEach((c, i) => {
      const isAns = q.answer[0] === i + 1;
      oxItems.push({ k: `${q.id}#${i + 1}`, id: q.id, n: i + 1, text: c, topic, o: neg ? !isAns : isAns });
    });
  });
}
function oxPool() {
  if (!oxItems) buildOX();
  const s = state.settings;
  return oxItems.filter(it => (!s.oxSubjects.length || s.oxSubjects.includes(QI[it.id].subject))
    && (!s.oxYears.length || s.oxYears.includes(QI[it.id].year))
    && (s.oxMode === 'quiz' || it.o));
}

// ---------- O/X 고르기 화면 (아래 탭) ----------
function renderOX() {
  const s = state.settings;
  const pool = oxPool();
  const n = s.oxCount === 0 ? pool.length : Math.min(s.oxCount, pool.length);
  const chip = (on, label, attr) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr}>${esc(label)}</button>`;
  appEl.innerHTML = `
    ${headHtml('O/X')}
    <div class="body">
      <div class="seg" id="oxMode">
        <button type="button" data-v="quiz" class="${s.oxMode === 'quiz' ? 'on' : ''}">O/X 풀기</button>
        <button type="button" data-v="read" class="${s.oxMode === 'read' ? 'on' : ''}">맞는 문장만 읽기</button>
      </div>
      <p class="hint">${s.oxMode === 'quiz' ? '기출 보기 한 줄을 보고 맞는 말(O)인지 틀린 말(X)인지 골라요.' : '틀린 문장은 빼고, 맞는 문장(O)만 카드로 넘겨 봐요.'}</p>
      <p class="lbl">과목</p>
      <div class="chips" id="oxSubj">
        ${chip(!s.oxSubjects.length, '전체', 'data-v=""')}
        ${SUBJECTS.map(x => chip(s.oxSubjects.includes(x.k), x.k, `data-v="${x.k}"`)).join('')}
      </div>
      <p class="lbl">연도</p>
      <div class="chips" id="oxYear">
        ${chip(!s.oxYears.length, '전체', 'data-v=""')}
        ${YEARS.map(y => chip(s.oxYears.includes(y), yy(y), `data-v="${y}"`)).join('')}
      </div>
      <p class="lbl">개수</p>
      <div class="chips" id="oxCount">
        ${[20, 50].map(c => chip(s.oxCount === c, String(c), `data-v="${c}"`)).join('')}
        ${chip(s.oxCount === 0, '전부', 'data-v="0"')}
      </div>
      <p class="hint">고른 문장 ${pool.length.toLocaleString()}개 · 무작위로 나와요</p>
      <button class="btn yellow start" type="button" id="oxGo"${n ? '' : ' disabled'}>${s.oxMode === 'quiz' ? 'O/X 풀기' : '읽기'} ▶ ${n}개</button>
    </div>`;
  const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  const multi = (id, key, num) => on(id, e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const v = b.dataset.v;
    if (!v) s[key] = [];
    else { const val = num ? Number(v) : v; s[key] = s[key].includes(val) ? s[key].filter(x => x !== val) : [...s[key], val]; }
    saveState(); render();
  });
  multi('oxSubj', 'oxSubjects', false);
  multi('oxYear', 'oxYears', true);
  on('oxMode', e => { const b = e.target.closest('button'); if (b) { s.oxMode = b.dataset.v; saveState(); render(); } });
  on('oxCount', e => { const b = e.target.closest('.chip'); if (b) { s.oxCount = Number(b.dataset.v); saveState(); render(); } });
  if (n) on('oxGo', () => {
    const items = shuffle(pool.slice()).slice(0, n);
    view = { tab: 'ox', screen: 'ox', data: { run: { mode: s.oxMode, items, idx: 0, picks: {} } } };
    render();
    window.scrollTo(0, 0);
  });
}

// ---------- O/X 푸는 화면 ----------
function renderOXRun() {
  const run = view.data.run;
  const it = run.items[run.idx];
  const q = QI[it.id];
  const quiz = run.mode === 'quiz';
  const pick = run.picks[it.k];
  const shown = !quiz || pick !== undefined;
  const right = pick === it.o;
  const last = run.idx === run.items.length - 1;
  // 정답 보기 문장이면 해설이 그 문장 설명이라 함께 보여 줌
  const exp = shown && q.answer[0] === it.n ? expHtml(q, '💡 해설') : '';
  appEl.innerHTML = `
    <div class="head">
      <div class="qhead">
        <button class="back" type="button" id="backBtn">← ${run.idx + 1} / ${run.items.length}</button>
        <span class="where">${esc(where(q))} ${MARKS[it.n - 1]}</span>
      </div>
      <div class="qbar"><i style="width:${(run.idx + (shown ? 1 : 0)) / run.items.length * 100}%"></i></div>
    </div>
    <div class="body">
      <p class="ox-topic">${esc(it.topic)}</p>
      <div class="ox-card${shown ? (it.o ? ' o' : ' x') : ''}">${esc(it.text)}</div>
      ${quiz && !shown ? `<div class="ox-btns"><button type="button" class="ox-b" data-v="1">O</button><button type="button" class="ox-b" data-v="0">X</button></div>` : ''}
      ${quiz && shown ? `<p class="ox-res ${right ? 'ok' : 'no'}">${right ? '맞았어요' : '틀렸어요'} · 이 문장은 <b>${it.o ? 'O (맞는 말)' : 'X (틀린 말)'}</b></p>` : ''}
      ${exp}
      ${shown ? `<div class="acts">
          <button class="btn ghost" type="button" id="origBtn">원래 문제 보기</button>
          ${run.mode === 'read' && run.idx ? '<button class="btn ghost" type="button" id="prevBtn">← 이전</button>' : ''}
        </div>
        <button class="btn navy next" type="button" id="nextBtn">${last ? (quiz ? '결과 보기' : '끝') : '다음 →'}</button>` : ''}
    </div>`;
  document.getElementById('backBtn').addEventListener('click', () => go('ox'));
  appEl.querySelectorAll('.ox-b').forEach(b => b.addEventListener('click', () => {
    run.picks[it.k] = b.dataset.v === '1';
    renderOXRun();
  }));
  if (!shown) return;
  bindExp(q, renderOXRun);
  document.getElementById('origBtn').addEventListener('click', () => {
    // 원래 문제를 한 문제 보기로 (닫으면 이 O/X 화면으로)
    startQuiz({ kind: 'single', title: '', ids: [it.id] });
  });
  const prev = document.getElementById('prevBtn');
  if (prev) prev.addEventListener('click', () => { run.idx--; renderOXRun(); window.scrollTo(0, 0); });
  document.getElementById('nextBtn').addEventListener('click', () => {
    if (!last) { run.idx++; renderOXRun(); window.scrollTo(0, 0); return; }
    if (!quiz) return go('ox');
    view = { tab: 'ox', screen: 'oxResult', data: { run } };
    render();
    window.scrollTo(0, 0);
  });
}
function renderOXResult() {
  const run = view.data.run;
  const done = run.items.filter(it => run.picks[it.k] !== undefined);
  const wrong = done.filter(it => run.picks[it.k] !== it.o);
  appEl.innerHTML = `
    ${headHtml('O/X 결과')}
    <div class="body">
      <div class="score"><b>${done.length - wrong.length} / ${done.length}</b><span>맞힘</span></div>
      ${wrong.length ? `<p class="lbl">틀린 문장 ${wrong.length}개</p><div id="wrongList">${wrong.map(it => `
        <div class="card" data-id="${it.id}">
          <div class="m"><span><span class="tag ${it.o ? 'ok' : 'x'}">${it.o ? 'O' : 'X'}</span>${esc(where(QI[it.id]))} ${MARKS[it.n - 1]}</span>${noteBtnHtml(it.id)}</div>
          <p>${esc(it.text)}</p>
        </div>`).join('')}</div>` : '<p class="empty">모두 맞혔어요 👏</p>'}
      <button class="btn navy start" type="button" id="doneBtn">O/X로</button>
    </div>`;
  if (wrong.length) bindCards(document.getElementById('wrongList'), renderOXResult);
  document.getElementById('doneBtn').addEventListener('click', () => go('ox'));
}

// ---------- 비슷한 문제 ----------
// 문제 글에서 낱말을 뽑아(조사 떼고) 다른 해 같은 과목 문제와 겹치는 정도를 계산. 드문 낱말일수록 점수 큼
const SIM_STOP = new Set('설명 관한 다음 옳은 옳지 않은 것은 것을 모두 고른 해당 해당하는 내용 내용으로 대한 경우 있다 있는 없다 없는 한다 하는 이다 된다 되는 위한 위해 통해 따라 등의 등을 등이 사회복지 사회복지사 사회 복지 제공 적절한 적절하지 아닌 맞는 틀린 가장 다음에서 설명하는 해당하지 않는 대상 관계 의미 의미한다 수행 필요 중요 개인 기관 방법 활용 경우에'.split(' '));
let simTok = null, simDf = null;
function simTokens(q) {
  const text = (q.parts.map(p => p.t === 'p' ? p.text : p.lines.join(' ')).join(' ') + ' ' + q.choices.join(' '));
  const out = new Set();
  (text.match(/[가-힣A-Za-z]{2,}/g) || []).forEach(w => {
    w = w.replace(/(에서는|으로는|에게서|이라는|이라고|에서|에게|으로|로서|로써|이란|이며|이고|하는|하며|하고|이다|한다|된다|에는|과의|와의|은|는|이|가|을|를|의|에|와|과|도|만|로)$/, '');
    if (w.length >= 2 && !SIM_STOP.has(w)) out.add(/[A-Za-z]/.test(w) ? w.toLowerCase() : w);
  });
  return out;
}
function buildSim() {
  simTok = {}; simDf = {};
  Q.forEach(q => { simTok[q.id] = simTokens(q); simTok[q.id].forEach(w => { simDf[w] = (simDf[w] || 0) + 1; }); });
}
function similarTo(q, max) {
  if (!simTok) buildSim();
  const a = simTok[q.id];
  const idf = w => Math.log(Q.length / (simDf[w] || 1));
  const norm = set => Math.sqrt([...set].reduce((s, w) => s + idf(w) ** 2, 0)) || 1;
  const na = norm(a);
  return Q.filter(o => o.subject === q.subject && o.year !== q.year)
    .map(o => {
      let dot = 0;
      simTok[o.id].forEach(w => { if (a.has(w)) dot += idf(w) ** 2; });
      return { q: o, sc: dot / (na * norm(simTok[o.id])) };
    })
    .filter(x => x.sc >= 0.18)
    .sort((x, y) => y.sc - x.sc)
    .slice(0, max || 3);
}
function similarHtml(q) {
  const list = similarTo(q, 3);
  if (!list.length) return '';
  return `<p class="lbl" style="margin-top:20px">다른 해 비슷한 문제</p><div id="simList">${list.map(x => listCard(x.q, { btn: noteBtnHtml(x.q.id) })).join('')}</div>`;
}
function bindSimilar() {
  const el = document.getElementById('simList');
  if (el) bindCards(el, renderQuiz);
}
