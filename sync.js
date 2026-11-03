// 사복사복: 문제 불러오기 + 로그인 + 풀이 기록 동기화 (Firebase Auth + Firestore)
//  - 클라우드 위치: exams/{연도} 문서 = 그해 문제 200개 (tools/upload.html로 올림)
//                   users/{uid} 문서 = 내 풀이 기록 전체 (state) 하나
//  - 누가 읽을 수 있는지는 Firestore 규칙(firestore.rules)에서 아빠 계정만 허락
//  - 아래 설정값이 비어 있으면 로그인 없이, 이 컴퓨터의 data/ 폴더에서 문제를 읽음 (만들면서 확인용)
//    data/ 폴더는 GitHub에 올리지 않으므로, 인터넷 주소에서는 Firebase를 연결해야 문제가 보임

// Firebase 설정값은 sync-config.js (앱과 tools/upload.html이 같이 씀)

const UID_KEY = 'sabok.uid';
const loginEl = document.getElementById('login');
const loginError = document.getElementById('loginError');
const cloud = { auth: null, db: null, user: null, ready: false, unsub: null, timer: null, lastSent: 0 };

function cloudConfigured() { return !!FIREBASE_CONFIG.apiKey; }
function cloudUserEmail() { return cloud.user ? cloud.user.email : ''; }

// ---------- 시작 ----------
function boot() {
  splash();
  if (!cloudConfigured()) return loadLocalData();
  if (!window.firebase) {
    appEl.innerHTML = '<div class="empty">인터넷 연결을 확인해 주세요.</div>';
    return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  cloud.auth = firebase.auth();
  cloud.db = firebase.firestore();
  cloud.db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); // Safari·아이폰에서 연결이 멈추는 것 막기
  cloud.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  cloud.auth.getRedirectResult().catch(showLoginError);
  cloud.auth.onAuthStateChanged(user => {
    if (user) startCloud(user);
    else { stopCloud(); showLogin(); }
  });
  if (!localStorage.getItem(UID_KEY)) showLogin();
}

// 시작 화면: 약 3초 보여 주고 사라짐
function splash() {
  const el = document.getElementById('splash');
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
  }, 3000);
}

// 클라우드 연결 전: 이 컴퓨터의 data/연도.json을 읽음
function loadLocalData() {
  const years = [];
  for (let y = 2018; y <= 2030; y++) years.push(y);
  Promise.all(years.map(y => fetch(`data/${y}.json`).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => d && fetch(`data/explain/${y}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}))
      .then(ex => { d.questions.forEach(q => { if (ex[q.id]) q.exp = ex[q.id]; }); return d; }))))
    .then(list => {
      const docs = list.filter(Boolean);
      if (!docs.length) {
        appEl.innerHTML = '<div class="empty">문제 파일이 없어요.<br>data/ 폴더나 Firebase 연결을 확인해 주세요.</div>';
        return;
      }
      useExamDocs(docs);
      render();
    });
}
function useExamDocs(docs) {
  const rounds = {};
  let all = [];
  docs.forEach(d => { rounds[d.year] = d.round; all = all.concat(d.questions); });
  setQuestions(all, rounds);
  if (typeof searchIndex !== 'undefined') searchIndex = null;
}

// ---------- 로그인 ----------
function showLogin(msg) {
  loginError.textContent = msg || '';
  loginError.hidden = !msg;
  loginEl.hidden = false;
}
function showLoginError(err) {
  console.warn(err);
  showLogin('로그인하지 못했어요. 잠시 뒤 다시 해 주세요.' + (err && err.code ? ` (${err.code})` : ''));
}
function signIn() {
  if (!cloud.auth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  cloud.auth.signInWithPopup(provider).catch(err => {
    // 팝업이 막힌 환경(홈 화면 앱 등)이면 페이지 이동 방식으로 다시
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return cloud.auth.signInWithRedirect(provider).catch(showLoginError);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') showLoginError(err);
  });
}
document.getElementById('loginBtn').addEventListener('click', signIn);

// ---------- 문제 + 기록 ----------
function startCloud(user) {
  stopCloud();
  cloud.user = user;
  const prev = localStorage.getItem(UID_KEY);
  if (prev && prev !== user.uid) { state = defaultState(); saveLocal(); }
  try { localStorage.setItem(UID_KEY, user.uid); } catch (e) {}

  // 1) 문제 (허락된 계정이 아니면 여기서 막힘). 20초가 넘으면 안내
  loginEl.hidden = true;
  appEl.innerHTML = '<div class="empty">문제를 불러오는 중…<br>처음 한 번은 조금 걸려요.</div>';
  const slow = setTimeout(() => {
    if (!Q.length) appEl.innerHTML = '<div class="empty">문제를 불러오지 못하고 있어요.<br>인터넷 연결을 확인하고 앱을 다시 열어 주세요.</div>';
  }, 20000);
  cloud.db.collection('exams').get().then(snap => {
    clearTimeout(slow);
    loginEl.hidden = true;
    const docs = [];
    snap.forEach(d => docs.push(d.data()));
    if (!docs.length) {
      appEl.innerHTML = '<div class="empty">아직 올린 문제가 없어요.<br>tools/upload.html로 문제를 올려 주세요.</div>';
      return;
    }
    useExamDocs(docs);
    render();
    // 2) 풀이 기록: 다른 기기에서 바뀌면 바로 받음
    cloud.unsub = userRef().onSnapshot(onUserSnap, onCloudError);
  }, err => {
    if (err.code === 'permission-denied') return denyAccount();
    onCloudError(err);
  });
}
function userRef() { return cloud.db.collection('users').doc(cloud.user.uid); }

function onUserSnap(snap) {
  if (snap.metadata.hasPendingWrites) return; // 이 기기에서 방금 올린 것
  const d = snap.exists ? snap.data() : null;
  const remote = d && d.state ? normalize(JSON.parse(d.state)) : null;
  if (!remote || state.updatedAt > remote.updatedAt) {
    // 클라우드에 없거나 이 기기가 더 최신: 이 기기 것을 올림
    cloud.ready = true;
    if (state.updatedAt) pushNow();
    return;
  }
  cloud.ready = true;
  if (remote.updatedAt === state.updatedAt) return;
  state = remote;
  saveLocal();
  // 문제를 푸는 중이면 화면을 흔들지 않음 (다음 화면부터 반영)
  if (!view.screen) render();
}

// saveState()가 부름: 잠깐 모았다가 한 번에 올림
function cloudSave() {
  if (!cloud.user || !cloud.ready) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(pushNow, 800);
}
function pushNow() {
  if (!cloud.user) return;
  userRef().set({ state: JSON.stringify(state), updatedAt: state.updatedAt }).catch(onCloudError);
}
// 앱을 닫거나 다른 앱으로 갈 때 남은 것을 바로 올림
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && cloud.timer) { clearTimeout(cloud.timer); cloud.timer = null; pushNow(); }
});

function onCloudError(err) {
  console.warn(err);
  if (err && err.code === 'permission-denied') denyAccount();
}
function stopCloud() {
  if (cloud.unsub) cloud.unsub();
  cloud.unsub = null;
  cloud.user = null;
  cloud.ready = false;
}
function denyAccount() {
  stopCloud();
  try { localStorage.removeItem(UID_KEY); } catch (e) {}
  cloud.auth.signOut();
  showLogin('이 계정은 사용할 수 없어요.');
}
function cloudSignOut() {
  stopCloud();
  try { localStorage.removeItem(UID_KEY); localStorage.removeItem(STORE_KEY); } catch (e) {}
  state = defaultState();
  Q = []; QI = {};
  cloud.auth.signOut();
}

boot();

// 해설 확인 요청: 엄마·아빠가 같이 보는 공용 칸(reports/문제id). data가 없으면 지움
function cloudReport(id, data) {
  if (!cloud.db || !cloud.user) return;
  const ref = cloud.db.collection('reports').doc(id);
  (data ? ref.set({ id, note: data.note, exp: data.exp, by: cloud.user.email || '', at: Date.now() }) : ref.delete())
    .catch(err => { console.warn(err); toast('요청을 저장하지 못했어요. 인터넷 연결을 확인해 주세요'); });
}
