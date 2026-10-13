"""아티팩트 게시 전 안전 검사: 개인정보·경로·API 키가 파일에 들어갔는지 패턴으로 확인한다.
실행: python scripts/scan-artifact.py   (app 폴더에서, 먼저 npm run build:artifact)
"""
import json
import re
import sys

path = 'dist-artifact/artifact.html'
h = open(path, encoding='utf-8').read()
print('크기: %.0fKB (한도 16MB)' % (len(h.encode()) / 1024))

checks = {
    '전화번호': r'01[016789][-. ]?\d{3,4}[-. ]?\d{4}',
    '이메일': r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}',
    'API 키 형태': r'(sk-ant-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|Bearer [A-Za-z0-9._-]{20,})',
    'PC 경로': r'C:[\\/]+Users',
    '키 변수 이름': r'(NVIDIA_API_KEY|KEY_EKAPE|KEY_AT_PRICE|KEY_CUSTOMS)',
}
# 개인 검색어(이름·아이디·전화번호 일부 등)는 저장소에 올라가지 않는 로컬 파일에서 읽는다.
# scripts/scan-terms.local 에 한 줄에 하나씩 적는다. (.gitignore로 제외됨)
try:
    for i, term in enumerate(open('scripts/scan-terms.local', encoding='utf-8')):
        term = term.strip()
        if term and not term.startswith('#'):
            checks[f'개인 검색어 #{i + 1}'] = re.escape(term)
except FileNotFoundError:
    print('  (scripts/scan-terms.local 없음: 개인 검색어 검사는 건너뜀)')

bad = 0
for name, pat in checks.items():
    found = sorted(set(re.findall(pat, h)))
    flat = [x if isinstance(x, str) else x[0] for x in found]
    print(f'  {name}: {len(found)}종', flat[:4] if flat else '')
    bad += len(found)

vals = []
for p in ['../../day6/.env', '../../supply-dashboard/.env']:
    try:
        for line in open(p, encoding='utf-8-sig', errors='replace'):
            if '=' in line and not line.lstrip().startswith('#'):
                v = line.split('=', 1)[1].strip().strip('"\'')
                if len(v) >= 12:
                    vals.append(v)
    except FileNotFoundError:
        pass
leaked = sum(1 for v in vals if v in h)
print(f'  실제 API 키 값 노출: {leaked} / 검사한 키 {len(vals)}개')

rec = json.load(open('src/static/recordings.json', encoding='utf-8'))
ok = all(j['status'] == 200 for j in rec['jobs'])
print(f"기록: 응답 {len(rec['entries'])}건, 요청 {len(rec['jobs'])}건, 모두 200: {ok}")
sys.exit(1 if (leaked or not ok) else 0)
