"""81품종의 위키 설명을 임베딩해서 fixtures/breed-embeddings.json 으로 저장한다. (챗봇이 질문과 가까운 품종을 찾는 데 쓴다)

- 모델: server.MODELS['embed'] (NVIDIA). 키는 server.py 가 .env 에서 읽는다. 출력하지 않는다.
- 각 벡터는 길이 1로 맞추고 소수 5자리로 줄여 저장한다 (파일 크기 때문).
다시 만들려면: python tools/build_embeddings.py  (day6 폴더에서)
"""
import json
import math
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding='utf-8')

import server  # noqa: E402

if not server.API_KEY:
    sys.exit('.env 에 NVIDIA_API_KEY 가 없어요.')

keys, texts = [], []
for key in server.BREEDS:
    ev = server.evidence_for(key)
    if ev:
        keys.append(key)
        texts.append(f'{ev[0]}. {ev[1]}'[:1500])

vectors = []
for i in range(0, len(texts), 20):
    vectors += server.nvidia_embed(texts[i:i + 20], 'passage')
    print(f'  {min(i + 20, len(texts))}/{len(texts)}', flush=True)


def unit(v):
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [round(x / n, 5) for x in v]


out = {
    '_meta': {
        '설명': '품종별 위키 설명의 임베딩(검색용 숫자). 챗봇이 질문과 가까운 품종을 찾는 데 씁니다.',
        '모델': server.MODELS['embed'],
        '만든날': date.today().isoformat(),
        '가공': '길이 1로 맞추고 소수 5자리로 줄임. 입력은 "품종이름. 위키 요약" 앞 1500자.',
    },
    'vectors': dict(zip(keys, [unit(v) for v in vectors])),
}
path = ROOT / 'fixtures' / 'breed-embeddings.json'
path.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
print(f'저장: {len(keys)}품종, 차원 {len(vectors[0])}, 파일 {path.stat().st_size // 1024}KB')
