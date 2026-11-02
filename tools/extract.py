# 사복사복: 기출 원본 파일(문제지 PDF 3개 + 정답 hwp)에서 문제 데이터(data/연도.json)를 만든다
#  - 쓰는 법: python3 tools/extract.py ../원본-기출/2026   →  data/2026.json
#  - 필요한 것: pymupdf(fitz), olefile, pillow  (pip install pymupdf olefile pillow)
#  - PDF는 글자 사이 띄어쓰기가 빠져 있어서, 글자 사이 간격을 재서 띄어쓰기를 되살린다
#  - 정답 hwp는 정답표가 그림이라, 표 안의 문제 번호 숫자 모양과 비교해서 정답 숫자를 읽는다
#  - 만든 data/ 폴더는 저작권 때문에 GitHub에 올리지 않는다 (.gitignore)

import glob, io, json, os, re, struct, sys, unicodedata, zlib

import fitz
import olefile
from PIL import Image

SUBJECTS = {  # 교시 → (과목 이름, 짧은 이름) 25문제씩
    1: [('인간행동과 사회환경', '인간행동'), ('사회복지조사론', '조사론')],
    2: [('사회복지실천론', '실천론'), ('사회복지실천기술론', '실천기술론'), ('지역사회복지론', '지역사회')],
    3: [('사회복지정책론', '정책론'), ('사회복지행정론', '행정론'), ('사회복지법제론', '법제론')],
}
MARKS = '①②③④⑤'
BOX_MARK = re.compile(r'^([ㄱ-ㅎ][.)]|[A-Za-z][.)]|\(?\d+\)|[○●•ㆍ·\-※□■◦]|<|〈|\[)')
RIGHT_EDGE = 500  # 이 오른쪽까지 찬 줄은 다음 줄로 이어지는 글


def nfc(s):
    return unicodedata.normalize('NFC', s)


def page_rows(page):
    # 페이지의 모든 글자를 높이별로 한 줄씩 모은 뒤, 글자 사이 간격으로 띄어쓰기를 되살림
    #  - 이 PDF는 띄어쓰기 글자가 거의 없고 위치로만 띄워 놓음
    #  - 단어 안 간격은 1pt 미만, 띄어쓰기는 4.5pt 이상 → 2pt를 기준으로 나눔 (양쪽 맞춤 줄도 같음)
    chars = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for sp in l['spans']:
                for c in sp['chars']:
                    x0, y0, x1, y1 = c['bbox']
                    chars.append((x0, (y0 + y1) / 2, x1, c['c']))
    chars.sort(key=lambda c: (round(c[1]), c[0]))
    rows = []
    for c in chars:
        if rows and abs(rows[-1]['y'] - c[1]) < 4:
            rows[-1]['chars'].append(c)
        else:
            rows.append({'y': c[1], 'chars': [c]})
    out = []
    for r in rows:
        cs = sorted(r['chars'], key=lambda c: c[0])
        text, last = '', None
        for x0, _, x1, ch in cs:
            gap = None if last is None else x0 - last
            if gap is not None and gap > 18:
                text += '   '   # 표처럼 띄어 놓은 칸
            elif gap is not None and gap > 2 and not text.endswith(' ') and ch != ' ':
                text += ' '
            text += ch
            last = x1
        text = text.replace('｢', '「').replace('｣', '」').strip()
        if text:
            out.append({'x0': cs[0][0], 'x1': cs[-1][2], 'y': r['y'], 'text': text})
    return out


def split_choices(row):
    # 한 줄에 ① ② ③이 나란히 있으면 나눔
    parts = []
    for piece in re.split(r'(?=[①②③④⑤])', row['text']):
        piece = piece.strip()
        if piece and piece[0] in MARKS:
            parts.append([MARKS.index(piece[0]), piece[1:].strip()])
    return parts


def tidy(s):
    # "ㄱ , ㄴ" → "ㄱ, ㄴ" 처럼 쉼표·괄호 앞뒤 띄어쓰기 정리
    s = re.sub(r'\(\s+\)', '(\u0002)', s)          # 빈칸 괄호 ( )는 지키기
    s = re.sub(r'\s+([,.)」])', r'\1', s)
    s = re.sub(r'([(「])\s+', r'\1', s)
    return re.sub(r' {2,}', ' ', s).strip().replace('\u0002', '  ')


def split_items(lines):
    # 한 줄에 나란히 있는 "ㄱ. … ㄴ. …", "○ … ○ …"를 한 줄에 하나씩
    out = []
    for l in lines:
        for piece in re.split(r'(?<!\()\s{3,}(?!\))|\s+(?=[ㄱ-ㅎ]\.\s)|\s+(?=○\s)', l):
            if piece.strip():
                out.append(tidy(piece))
    return out


WRAP = '\u0001'  # 줄이 바뀐 자리 (나중에 띄울지 붙일지 정함)


def join_wrap(a, b):
    return a + WRAP + b


PARTICLE = re.compile(r'(은|는|이|가|을|를|의|에|에게|에서|만|으로|로|와|과|도|이다|이며|이고|이나)')
WORD_END = set('을를이가은는의에와과로도만서고며면다요게지한할된될던며인적및등수것때중야자록')
SOLO = set('그이저및등수또각한더잘안못매총약위시전후중두세네새옛온참')
ENDING = re.compile(r'(어|아|여|서|어서|아서|기|게|고|며|면|날|는|은|을|던|도록|지|었다|였다|었고|였고|어야|아야|었으며|였으며|자|고자|써|나|인)')
ENDS_FREE = ('을', '를', '게', '도', '만', '은', '는', '이', '가', '서', '고', '며', '면', '야', '와', '과', '의', '에')


_CORPUS = ['']


def glue_rule(a, b, count):
    # 줄바꿈 자리의 앞말 a와 뒷말 b를 붙여야 하는지
    ab = a + b
    if b in ('수', '것', '등', '때', '중', '및', '데', '바', '뿐', '만큼'):
        return False                                  # 의존명사는 띄움 (받을 수)
    if re.search(r'[A-Za-z0-9)]$', a) and re.fullmatch(r'(와|과|를|을|는|은|이|가|의|에|로|으로)(의|는|도|가|서)?', b):
        return True                                   # B|와의 → B와의
    if not re.search(r'[가-힣]$', a):
        return False
    if a[-1] not in '을를이가은는의에와과로도만야자록' and re.fullmatch(r'(이다|한다|된다|했다|였다|다|다고|는지|해야|하여야|여야|하였다|이며|이고)', b):
        return True                                   # 실천|이다, 규정된|다고, 기여했|는지
    tail = a[-1]
    if tail not in WORD_END and b not in count and any(len(w) >= 2 and count[w] >= 2 and w.startswith(tail + b[0]) for w in count):
        return True                                   # 추|억, 폭|력, 긴급전|화 (끝 글자 + 첫 글자가 낱말)
    if len(a) == 1 and a not in SOLO and len(b) >= 2 and any(len(w) >= 3 and w.startswith(a + b[0]) for w in count):
        return True                                   # 운|영하였다 → 운영하였다
    if not (re.search(r'[가-힣]$', a) and re.match(r'^[가-힣]', b)):
        return count.get(ab, 0) > 0
    if count.get(ab, 0) > 0 and count.get(ab, 0) >= _CORPUS[0].count(a + ' ' + b):
        return True                                   # 붙인 꼴이 띄운 꼴보다 많이 나옴
    if a.endswith('ㆍ') or b.startswith('ㆍ'):
        return True                                   # 심의ㆍ|의결 → 심의ㆍ의결
    if ENDING.fullmatch(b):
        return True                                   # 요약되|어, 정해|서, 방지하|기, 벗어|날
    if PARTICLE.fullmatch(b):
        return True                                   # 조사는 앞말에 붙음 (저 에게 → 저에게)
    if any(len(a) < len(w) < len(ab) and ab.startswith(w) and PARTICLE.fullmatch(ab[len(w):]) for w in count):
        return True                                   # 동시 타당도와 → 동시타당도 + 와
    if b.startswith(('시키', '시킨', '시켜', '시킬')) and not a.endswith(ENDS_FREE):
        return True                                   # 증진|시킨다
    if b[0] in '하되한할함된될됨했' and not a.endswith(ENDS_FREE):
        if any(w.startswith(a + c) for c in ('하', '되', '한', '된', '할', '될') for w in count) or len(a) >= 2 and b[0] in '하했':
            return True                               # 발송 하여 → 발송하여, 초래 할 → 초래할
    return False


def resolve_wraps(questions, skip=None):
    # 줄이 단어 중간에서 바뀌었는지 판단: 붙인 말이 문서의 다른 곳에 있으면 붙이고, 아니면 띄움
    texts = []
    for q in questions:
        for p in q['parts']:
            texts += [p['text']] if p['t'] == 'p' else p['lines']
        texts += q['choices']
    corpus = ' '.join(t.replace(WRAP, ' ') for t in texts)
    for other in glob.glob('data/*.json'):   # 이미 만든 다른 해 문제의 낱말도 참고 (같은 해는 빼고)
        if skip and other.endswith(f'{skip}.json'):
            continue
        try:
            for q in json.load(open(other, encoding='utf-8'))['questions']:
                corpus += ' ' + ' '.join([p.get('text', '') or ' '.join(p.get('lines', [])) for p in q['parts']] + q['choices'])
        except (KeyError, ValueError):
            pass
    _CORPUS[0] = corpus
    words = re.findall(r'[가-힣A-Za-z]+', corpus)
    count = {}
    for w in words:
        count[w] = count.get(w, 0) + 1
    glued = []

    def fix(t):
        def one(m):
            a, b = m.group(1), m.group(2)
            if glue_rule(a, b, count):
                glued.append(a + b)
                return a + b
            return a + ' ' + b
        t = t.replace('ㆍ' + WRAP, 'ㆍ').replace(WRAP + 'ㆍ', 'ㆍ')
        t = re.sub(r'([가-힣A-Za-z]+)' + WRAP + r'([가-힣A-Za-z]+)', one, t)
        return t.replace(WRAP, ' ')

    for q in questions:
        for p in q['parts']:
            if p['t'] == 'p':
                p['text'] = fix(p['text'])
            else:
                p['lines'] = [fix(l) for l in p['lines']]
        q['choices'] = [fix(c) for c in q['choices']]
    return glued


def join(a, b):
    if not a:
        return b
    return a + ('' if a.endswith((' ', '(', '「')) or b.startswith((')', ',', '.', '」')) else ' ') + b


def parse_session(pdf_path, session):
    doc = fitz.open(pdf_path)
    qs, q, mode, prev_row = [], None, None, None
    expected = 1
    for pno, page in enumerate(doc):
        for row in page_rows(page):
            t = row['text']
            if re.search(r'교시\s*A\s*형|\(\s*\d+\s*[–-]\s*\d+\s*\)$', t) or t.replace(' ', '').startswith('각문제에서요구하는'):
                continue
            if re.match(r'^사회복지\S*\s*\(.*\)$', t.replace(' ', '')) and row['x0'] > 55:
                continue  # 과목 제목
            m = re.match(r'^(\d{1,2})\.\s*(.*)$', t)
            if m and int(m.group(1)) == expected and row['x0'] < 60:
                q = {'no': expected, 'parts': [{'t': 'p', 'text': m.group(2).strip()}], 'choices': [''] * 5}
                qs.append(q)
                expected += 1
                mode, prev_row = 'stem', row
                continue
            if q is None:
                continue
            if t[:1] in MARKS and row['x0'] < 60:
                for i, txt in split_choices(row):
                    q['choices'][i] = txt
                    q['_last'] = i
                mode, prev_row = 'choice', row
                continue
            if mode == 'choice':
                if q.get('_done'):
                    continue
                # 보기 다음 줄 (보기 글이 길어서 넘어감). 문제 끝 뒤의 안내문은 무시
                if row['x0'] >= 65 and row['x0'] < 80 and prev_row['x1'] > RIGHT_EDGE - 60:
                    i = q['_last']
                    q['choices'][i] = join_wrap(q['choices'][i], t)
                    prev_row = row
                else:
                    q['_done'] = True
                continue
            # 문제 글 / 상자(ㄱ, ㄴ, 사례 등)
            parts = q['parts']
            stem_cont = parts[-1]['t'] == 'p' and prev_row['x1'] > RIGHT_EDGE and row['x0'] < 78 and not BOX_MARK.match(t)
            if row['x0'] >= 72 and not stem_cont:
                if parts[-1]['t'] != 'box':
                    parts.append({'t': 'box', 'lines': [], '_at': []})
                lines = parts[-1]['lines']
                cont = lines and prev_row['x1'] > RIGHT_EDGE and not BOX_MARK.match(t) and prev_row['x0'] >= 72
                parts[-1]['_at'].append((pno, row['y'], row['x0'], row['x1']))
                if cont:
                    lines[-1] = join_wrap(lines[-1], t)
                else:
                    lines.append(t)
            else:
                if parts[-1]['t'] == 'p' and prev_row['x1'] > RIGHT_EDGE:
                    parts[-1]['text'] = join_wrap(parts[-1]['text'], t)
                else:
                    parts.append({'t': 'p', 'text': t})
            prev_row = row
    for q in qs:
        q.pop('_last', None)
        q.pop('_done', None)
    # 상자 안에 세로줄이 있으면 표 → 원본 그림으로 잘라 둠 (글자는 검색용으로 남김)
    for q in qs:
        for p in q['parts']:
            at = p.pop('_at', None)
            if p['t'] != 'box' or not at:
                continue
            pno = at[0][0]
            ys = [a[1] for a in at if a[0] == pno]
            y0, y1 = min(ys) - 14, max(ys) + 14
            page = doc[pno]
            verts = [x for x, a, b in long_verticals(page) if a < y1 and b > y0]
            if len(set(round(x) for x in verts)) >= 3:   # 왼쪽·오른쪽 테두리 + 안쪽 세로줄
                xs = sorted(verts)
                clip = fitz.Rect(xs[0] - 2, min(a for x, a, b in long_verticals(page) if a < y1 and b > y0) - 2,
                                 xs[-1] + 2, max(b for x, a, b in long_verticals(page) if a < y1 and b > y0) + 2)
                p['img'] = table_png(page, clip)
    return qs


_vcache = {}


def long_verticals(page):
    # 길게 그어진 세로줄 (굵은 글씨를 그린 짧은 선은 뺌)
    key = (page.parent.name, page.number)
    if key not in _vcache:
        out = []
        for dr in page.get_drawings():
            for it in dr['items']:
                if it[0] == 'l':
                    a, b = it[1], it[2]
                    if abs(a.x - b.x) < 1.5 and abs(a.y - b.y) > 12:
                        out.append(((a.x + b.x) / 2, min(a.y, b.y), max(a.y, b.y)))
                elif it[0] == 're':
                    r = it[1]
                    if r.width < 1.5 and r.height > 12:
                        out.append(((r.x0 + r.x1) / 2, r.y0, r.y1))
        _vcache[key] = out
    return _vcache[key]


def table_png(page, clip):
    # 표 부분을 그림으로 (회색조, 색 줄여서 용량 작게) → data: 주소
    import base64
    pix = page.get_pixmap(dpi=150, clip=clip, colorspace=fitz.csGRAY)
    im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('L').quantize(colors=16)
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


# 규칙으로 못 잡은 띄어쓰기를 직접 고치는 목록 (원본 PDF와 대조해서 확인한 것만)
FIXES = {
    '추 억': '추억',            # 2021 1교시 15번
    '긴급전 화(': '긴급전화(',  # 2021 3교시 17번
}


def apply_fixes(t):
    for a, b in FIXES.items():
        t = t.replace(a, b)
    return t


def finish(qs):
    # 줄바꿈 정리 + 띄어쓰기 정리 (한 해 문제 전체를 보고)
    glued = resolve_wraps(qs, qs[0]['year'] if qs and 'year' in qs[0] else None)
    if glued:
        print(f'  줄바꿈에서 붙인 말 {len(glued)}개: {", ".join(glued)}')
    for q in qs:
        for p in q['parts']:
            if p['t'] == 'box':
                p['lines'] = [apply_fixes(l) for l in split_items(p['lines'])]
            else:
                p['text'] = apply_fixes(tidy(p['text']))
        q['choices'] = [apply_fixes(tidy(c)) for c in q['choices']]


# ---------- 한글(hwp) 문제지 (2022~2024년) ----------
# 문제 번호와 보기가 하나하나 "1×2 표"(왼쪽 칸: 1. / ①, 오른쪽 칸: 글)로 되어 있고,
# ㄱ·ㄴ·ㄷ 상자는 문제 칸 안의 "1×1 표". 띄어쓰기는 원래 글자로 들어 있어서 되살릴 필요 없음

def hwp_records(path):
    f = olefile.OleFileIO(path)
    comp = f.openstream('FileHeader').read()[36] & 1
    secs = sorted([s for s in f.listdir() if s[0] == 'BodyText'], key=lambda s: int(s[1][7:]))
    recs = []
    for sec in secs:
        data = f.openstream(sec).read()
        if comp:
            data = zlib.decompress(data, -15)
        i = 0
        while i < len(data):
            h = struct.unpack_from('<I', data, i)[0]
            tag, lvl, size = h & 0x3ff, (h >> 10) & 0x3ff, (h >> 20) & 0xfff
            i += 4
            if size == 0xfff:
                size = struct.unpack_from('<I', data, i)[0]
                i += 4
            recs.append((tag, lvl, data[i:i + size]))
            i += size
    return recs


def hwp_text(b):
    out, i = [], 0
    while i + 1 < len(b):
        c = struct.unpack_from('<H', b, i)[0]
        if c < 32:
            if c in (0, 10, 13, 24, 25, 26, 27, 28, 29):
                i += 2
            elif c in (30, 31):          # 묶음 빈칸, 고정폭 빈칸
                out.append(' ')
                i += 2
            else:                        # 글자 사이 컨트롤 (8글자 크기)
                if c == 9:
                    out.append(' ')
                i += 16
            continue
        out.append(chr(c))
        i += 2
    return ''.join(out)


def hwp_tree(recs):
    # 레벨로 나무 모양 만들기: [tag, data, children]
    root = [None, None, []]
    stack = [(-1, root)]
    for tag, lvl, data in recs:
        node = [tag, data, []]
        while stack[-1][0] >= lvl:
            stack.pop()
        stack[-1][1][2].append(node)
        stack.append((lvl, node))
    return root


def hwp_blocks(node):
    # 문단(글자)과 표를 순서대로: ('p', 글) / ('tbl', rows, cols, [칸 블록들])
    out = []
    for ch in node[2]:
        if ch[0] == 66:          # 문단
            text = ''.join(hwp_text(g[1]) for g in ch[2] if g[0] == 67)
            out.append(('p', text))
            for g in ch[2]:
                if g[0] == 71 and g[1][:4] == b' lbt':   # 표
                    out.append(hwp_table(g))
    return out


def hwp_table(ctrl):
    # 표: 칸 머리(LIST_HEADER) 다음에 오는 문단들이 그 칸의 글
    rows = cols = 0
    cells = []
    for g in ctrl[2]:
        if g[0] == 77:
            rows, cols = struct.unpack_from('<HH', g[1], 4)
        elif g[0] == 72:
            cells.append([None, None, []])
        elif g[0] == 66 and cells:
            cells[-1][2].append(g)
    return ('tbl', rows, cols, [hwp_blocks(c) for c in cells])


def flat_text(blocks):
    parts = []
    for b in blocks:
        if b[0] == 'p':
            parts.append(b[1])
        else:
            parts += [flat_text(c) for c in b[3]]
    return ' '.join(x.strip() for x in parts if x.strip())


def parse_hwp(path):
    tree = hwp_tree(hwp_records(path))
    qs, q, expected = [], None, 1
    for b in hwp_blocks(tree):
        if b[0] != 'tbl' or (b[1], b[2]) != (1, 2) or len(b[3]) != 2:
            continue
        head = flat_text(b[3][0])
        m = re.fullmatch(r'(\d+)\.', head)
        if m and int(m.group(1)) == expected:
            q = {'no': expected, 'parts': [], 'choices': [''] * 5}
            qs.append(q)
            expected += 1
            for blk in b[3][1]:
                if blk[0] == 'p':
                    t = re.sub(r'\s+', ' ', blk[1]).strip()
                    if t:
                        q['parts'].append({'t': 'p', 'text': t})
                elif (blk[1], blk[2]) == (1, 1):
                    lines = [re.sub(r'\s+', ' ', x[1]).strip() for x in blk[3][0] if x[0] == 'p']
                    q['parts'].append({'t': 'box', 'lines': [l for l in lines if l]})
                else:
                    sys.exit(f'{path}: {q["no"]}번에 처음 보는 표 ({blk[1]}×{blk[2]})')
        elif q and len(head) == 1 and head in MARKS:
            q['choices'][MARKS.index(head)] = re.sub(r'\s+', ' ', flat_text(b[3][1])).strip()
    return qs


def read_answers(hwp_path):
    # 정답 hwp 안의 표 그림(교시마다 하나)에서 숫자를 읽음
    f = olefile.OleFileIO(hwp_path)
    bins = sorted(['/'.join(s) for s in f.listdir() if s[0] == 'BinData'])
    result = []
    for name in bins:
        data = f.openstream(name).read()
        try:
            data = zlib.decompress(data, -15)
        except zlib.error:
            pass
        im = Image.open(io.BytesIO(data)).convert('L')
        px = im.load()
        W, H = im.size

        def runs(vals, cond, minlen):
            out, s = [], None
            for i, v in enumerate(vals + [None]):
                if v is not None and cond(v):
                    if s is None:
                        s = i
                else:
                    if s is not None and i - s >= minlen:
                        out.append((s, i))
                    s = None
            return out

        y0 = next(y for y in range(H) if sum(px[x, y] == 192 for x in range(W)) > W * 0.3)
        gx = runs([px[x, y0 + 8] for x in range(W)], lambda v: v != 255, 15)   # 회색 번호 칸
        gy = [r for r in runs([px[gx[0][0] + 3, y] for y in range(H)], lambda v: v != 255, 10) if r[0] >= y0 - 2]

        def glyph(x0, x1, ya, yb):
            pts = [(x, y) for y in range(ya, yb) for x in range(x0, x1) if px[x, y] < 100]
            mx, my = min(p[0] for p in pts), min(p[1] for p in pts)
            return frozenset((a - mx, b - my) for a, b in pts)

        cell_w = gx[1][0] - gx[0][1]
        tmpl = {k + 1: glyph(gx[k][0], gx[k][1], gy[0][0], gy[0][1]) for k in range(5)}  # 첫 줄 번호 1~5
        seq, worst = [], 1.0
        for r in range(len(gy)):
            for c in range(5):
                x1 = gx[c + 1][0] if c + 1 < len(gx) else gx[c][1] + cell_w
                g = glyph(gx[c][1], x1, gy[r][0], gy[r][1])
                score = {d: len(g & t) / len(g | t) for d, t in tmpl.items()}
                best = max(score, key=score.get)
                seq.append(best)
                worst = min(worst, score[best])
        if worst < 0.95:
            sys.exit(f'정답 그림 {name}: 숫자를 확실히 읽지 못했어요 (일치 {worst:.2f}). 눈으로 확인해 주세요.')
        result.append(seq)
    return result


def main():
    src = sys.argv[1]
    files = [nfc(p) for p in glob.glob(os.path.join(src, '*'))]
    raw = {nfc(p): p for p in glob.glob(os.path.join(src, '*'))}
    year = int(re.search(r'(20\d\d)', os.path.basename(os.path.normpath(src))).group(1))
    rnd = None
    ans_json = f'data/answers/{year}.json'
    if os.path.exists(ans_json):
        # 정답이 PDF 그림 등이라 따로 읽어 확인해 둔 경우 (data/answers/연도.json)
        a = json.load(open(ans_json, encoding='utf-8'))['answers']
        answers = [a[str(k)] for k in (1, 2, 3)]
    else:
        answers = [[[n] for n in seq] for seq in read_answers(raw[next(p for p in files if p.endswith('.hwp') and '정답' in p)])]
    out = []
    for session in (1, 2, 3):
        pdf = next(p for p in files if p.endswith(('.pdf', '.hwp')) and f'{session}교시' in os.path.basename(p) and '정답' not in p)
        m = re.search(r'제(\d+)회', os.path.basename(pdf))
        rnd = int(m.group(1)) if m else rnd
        qs = parse_hwp(raw[pdf]) if pdf.endswith('.hwp') else parse_session(raw[pdf], session)
        need = 25 * len(SUBJECTS[session])
        if len(qs) != need:
            sys.exit(f'{session}교시: 문제 {len(qs)}개를 찾았어요 ({need}개여야 함)')
        if len(answers[session - 1]) != need:
            sys.exit(f'{session}교시: 정답 {len(answers[session - 1])}개 ({need}개여야 함)')
        for q in qs:
            sub, short = SUBJECTS[session][(q['no'] - 1) // 25]
            missing = [MARKS[i] for i, c in enumerate(q['choices']) if not c]
            if missing:
                print(f'  주의: {session}교시 {q["no"]}번 보기 {"".join(missing)} 비어 있음')
            out.append({
                'id': f'{year}-{session}-{q["no"]}',
                'year': year, 'session': session, 'no': q['no'],
                'subject': short, 'subjectFull': sub,
                'parts': q['parts'], 'choices': q['choices'],
                'answer': answers[session - 1][q['no'] - 1],
            })
    finish(out)
    os.makedirs('data', exist_ok=True)
    path = f'data/{year}.json'
    with open(path, 'w', encoding='utf-8') as fp:
        json.dump({'year': year, 'round': rnd, 'questions': out}, fp, ensure_ascii=False, indent=1)
    print(f'{path}: {year}년 제{rnd}회 {len(out)}문제')


if __name__ == '__main__':
    main()
