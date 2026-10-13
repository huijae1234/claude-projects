"""?fixture=1 에서 쓸 NVIDIA 실제 응답 샘플을 만든다.

- server.py 의 프롬프트·모델·호출 함수를 그대로 써서 부른다. (.env 의 키를 server.py 가 읽는다)
- 받은 응답(raw)은 가공하지 않고 fixtures/nvidia-samples.json 에 저장한다.
- 이미 있는 부분(ask, simplify, chat)은 다시 부르지 않는다. 처음부터 다시 만들려면 --all
- 키는 출력하지 않는다.
사용: python tools/build_nvidia_samples.py [--all]   (day6 폴더에서)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding='utf-8')

import server  # noqa: E402  (서버는 시작되지 않는다. 설정과 호출 함수만 가져온다)

if not server.API_KEY:
    sys.exit('.env 에 NVIDIA_API_KEY 가 없어요.')

PATH = ROOT / 'fixtures' / 'nvidia-samples.json'
REDO = '--all' in sys.argv

BREEDS = ['poodle/standard', 'shiba']
QUESTIONS = ['털이 많이 빠져요?', '성격이 어때요?', '어디서 온 품종이에요?', '크기가 어떻게 돼요?', '아파트에서 키워도 돼요?']
EXTRA = {'poodle/standard': ['평균 수명은 몇 년이에요?']}  # 위키에 없는 내용의 예
# 챗봇 시작 선택지 (rules.js 의 CHAT_CHOICES 와 같아야 한다)
CHAT_CHOICES = [
    '털 적게 빠지는 개 추천해줘',
    '썰매 끄는 큰 개는 뭐야?',
    '푸들이랑 시바견 중에 어떤 게 털 관리가 쉬워?',
    '초보자한테 좋은 순한 개 알려줘',
    '일본에서 온 개는?',
]

samples = json.loads(PATH.read_text(encoding='utf-8')) if (PATH.is_file() and not REDO) else {}
samples.setdefault('_meta', {
    '설명': 'NVIDIA API 실제 응답을 가공 없이 저장한 고정 파일입니다. ?fixture=1 에서 키 없이 같은 답을 보여 주는 데 씁니다.',
    '모델': server.MODELS,
    '주의': 'AI 답변은 틀릴 수 있습니다. 위키 요약을 근거로 하도록 시켰지만 완벽하지 않습니다.',
})
samples['_meta']['모델'] = server.MODELS
samples.setdefault('ask', {})
samples.setdefault('simplify', {})
samples.setdefault('chat', {})

for key in BREEDS:
    ko, text = server.evidence_for(key)
    for q in QUESTIONS + EXTRA.get(key, []):
        if f'{key}|{q}' in samples['ask']:
            continue
        raw = server.nvidia_chat('ask', server.ASK_SYSTEM.format(ko=ko, text=text), q)
        samples['ask'][f'{key}|{q}'] = {'question': q, 'model': server.MODELS['ask'], 'raw': raw}
        print(f'[{ko}] {q}\n   → {server.answer_from_raw(raw)[:160]}', flush=True)
    if key not in samples['simplify']:
        raw = server.nvidia_chat('simplify', server.SIMPLIFY_SYSTEM, text)
        samples['simplify'][key] = {'model': server.MODELS['simplify'], 'raw': raw}
        print(f'[{ko}] 쉬운 말로\n   → {server.answer_from_raw(raw)[:200]}', flush=True)

vectors = server.load_vectors()
for q in CHAT_CHOICES:
    if q in samples['chat']:
        continue
    top = server.cosine_top_k(server.nvidia_embed([q], 'query')[0], vectors, server.TOP_K)
    found = [(k, s) for k, s in top if k in server.BREEDS and server.evidence_for(k)]
    context = '\n\n'.join(f'[{server.BREEDS[k]["ko"]}] {server.evidence_for(k)[1]}' for k, _ in found)
    raw = server.nvidia_chat('chat', server.CHAT_SYSTEM.format(context=context), q)
    samples['chat'][q] = {
        'question': q, 'model': server.MODELS['chat'], 'raw': raw,
        'sources': [{'key': k, 'ko': server.BREEDS[k]['ko'], 'score': round(s, 3)} for k, s in found],
    }
    print(f'[챗봇] {q}  (근거: {", ".join(server.BREEDS[k]["ko"] for k, _ in found)})\n   → {server.answer_from_raw(raw)[:220]}', flush=True)

PATH.write_text(json.dumps(samples, ensure_ascii=False, indent=1), encoding='utf-8')
print(f"\n저장: ask {len(samples['ask'])}개, simplify {len(samples['simplify'])}개, chat {len(samples['chat'])}개")
