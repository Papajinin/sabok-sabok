# 사복사복 (SABOK SABOK) 인계서

> 공통 규칙은 상위 폴더 `../CLAUDE.md`. 기획은 `plan/plan.md`, 결정은 `plan/decisions.md`(우선), 화면 시안은 `plan/preview.html`

- **무엇:** 사회복지사 1급 기출 연습. 사용자(아빠) 혼자 쓰는 **개인 앱** (가족 AIN 앱 아님, AIN 디자인 규칙 안 따름)
- **파일:** `index.html`(틀·시작 화면), `style.css`, `app.js`(상태·홈·문제 풀기·결과), `views.js`(오답노트·검색·모의고사·기록), `sync.js`(문제 불러오기·로그인·기록 동기화), `sync-config.js`(Firebase 설정값)
- **문제 데이터:** `tools/extract.py ../원본-기출/연도` → `data/연도.json`. 원본은 `../원본-기출/연도/`(문제지 PDF 교시별 3개 + 정답 hwp)
  - 띄어쓰기는 글자 간격(2pt 기준)으로 되살림. 줄바꿈 자리는 문서의 다른 곳에 붙인 말이 있는지·조사인지로 판단
  - 정답 hwp는 표 그림이라 숫자 모양 비교로 읽음 (일치도가 0.95 아래면 멈춤)
  - 새 연도를 넣으면: 원본 글자와 한 글자씩 대조, 줄바꿈 결정 목록 확인, 정답을 눈으로 한 번 더 대조
- **비공개:** `data/`는 GitHub에 안 올림(.gitignore). Firebase `exams/{연도}`에 `tools/upload.html`로 올림. 규칙 `firestore.rules`(아빠 계정만)
- **설정값이 비어 있으면** 로그인 없이 이 컴퓨터의 `data/`에서 읽음 (만들면서 확인용)
- **기록:** `users/{uid}` 문서 하나에 state 전체(JSON 글자). 나중에 고친 쪽(updatedAt)이 이김
- **버전:** 올릴 때마다 `index.html`의 `APP_VERSION`과 `version.txt`를 같이 올림. 지금 1
