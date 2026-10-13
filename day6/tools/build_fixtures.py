"""이름표(data/breeds.js)와 고정 파일(fixtures/*.json)을 만든다.

- 후보 품종을 하나씩 조회해 통과한 것만 이름표에 넣는다. (Dog CEO 키 존재 + 위키 한국어 문서가 '개 품종'인지)
- 받은 응답은 가공하지 않고 그대로 저장한다.
- 위키는 연달아 부르면 429 → 1초 간격 + 재시도.
다시 만들려면: python tools/build_fixtures.py  (day6 폴더에서)
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'dog-breed-school-project/0.1 (local learning project)'}

# rules.js 의 DOG_WORDS 와 같은 낱말 (개 품종 문서인지 가늠)
DOG = re.compile(
    r'(^|[^가-힣])개(이다|로|를|의|와|가|는|입니다|(?![가-힣]))'  # "개이다/개로/개 일종" (개최·개발은 제외)
    r'|[가-힣]견(으로|이다|은|는|을|를|의|이|인|도|로|(?![가-힣]))|견종|품종|犬'  # "중형견으로", "애완견의", "송사견", 犬
    r'|하운드|테리어|스패니얼|마스티프|리트리버|쉽독|핀셔|슈나우저|콜리|세터|포인터|dog',
    re.I,
)

# key | 위키 제목 | (선택) 화면에 보일 한국어 이름
CANDIDATES = """affenpinscher|아펜핀셔
airedale|에어데일 테리어
akita|아키타견
basenji|바센지
beagle|비글
borzoi|보르조이
bouvier|부비에 데 플랑드르
boxer|복서 (개)|복서
bulldog/boston|보스턴 테리어
bulldog/english|불도그|잉글리시 불도그
bulldog/french|프렌치 불도그
bullterrier/staffordshire|스태퍼드셔 불 테리어
chihuahua|치와와 (개)|치와와
chow|차우차우
collie/border|보더 콜리
corgi/cardigan|카디건 웰시 코기
dachshund|닥스훈트
dalmatian|달마티안
deerhound/scottish|스코티시 디어하운드
doberman|도베르만 핀셔
eskimo|아메리칸 에스키모 도그
frise/bichon|비숑 프리제
havanese|하바니즈
hound/afghan|아프간 하운드
hound/basset|바셋 하운드
hound/blood|블러드하운드
husky|시베리안 허스키
komondor|코몬도르
labrador|래브라도 리트리버
leonberg|레온베르거
lhasa|라사 압소
malamute|알래스칸 맬러뮤트
maltese|말티즈
mastiff/bull|불마스티프
mastiff/english|잉글리시 마스티프
mastiff/tibetan|티베탄 마스티프
mountain/bernese|버니즈 마운틴 도그
pekinese|페키니즈
pembroke|펨브로크 웰시 코기
pinscher/miniature|미니어처 핀셔
pointer/german|저먼 쇼트헤어드 포인터
pomeranian|포메라니안
poodle/standard|푸들
pug|퍼그
pyrenees|그레이트 피레니즈
retriever/chesapeake|체서피크 베이 리트리버
retriever/golden|골든 리트리버
rottweiler|로트와일러
saluki|살루키
schipperke|스키퍼키
schnauzer/giant|자이언트 슈나우저
schnauzer/miniature|미니어처 슈나우저
setter/irish|아이리시 세터
sheepdog/english|올드 잉글리시 쉽독
sheepdog/shetland|셔틀랜드 쉽독
shiba|시바견
shihtzu|시츄
spaniel/cocker|코커 스패니얼
spaniel/irish|아이리시 워터 스패니얼
springer/english|잉글리시 스프링어 스패니얼
stbernard|세인트버나드
terrier/yorkshire|요크셔 테리어
terrier/westhighland|웨스트 하이랜드 화이트 테리어
terrier/scottish|스코티시 테리어
terrier/cairn|케언 테리어
terrier/border|보더 테리어
terrier/irish|아이리시 테리어
terrier/norfolk|노퍽 테리어
terrier/welsh|웰시 테리어
vizsla|비즐라
weimaraner|바이마라너
dane/great|그레이트 데인
greyhound/italian|이탈리안 그레이하운드
setter/english|잉글리시 세터
terrier/russell|잭 러셀 테리어
whippet|휘핏
wolfhound/irish|아이리시 울프하운드
papillon|파피용 (개)|파피용
newfoundland|뉴펀들랜드 (개)|뉴펀들랜드
pitbull|아메리칸 핏불 테리어
german/shepherd|저먼 셰퍼드""".splitlines()


def get(url, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(4 + 3 * i)
                continue
            return e.code, None
        except Exception:
            time.sleep(2)
    return 0, None


def save(name, data):
    with open(os.path.join(ROOT, 'fixtures', name), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def wiki_url(title):
    return 'https://ko.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title)


def main():
    st, breed_list = get('https://dog.ceo/api/breeds/list/all')
    assert st == 200, 'dog.ceo 목록 실패'
    save('dog-breeds-list.json', breed_list)
    keys = set()
    for b, subs in breed_list['message'].items():
        keys.add(b)
        keys.update(f'{b}/{s}' for s in subs)

    included, rejected = [], []
    wiki, images = {}, {}
    for line in CANDIDATES:
        parts = line.split('|')
        key, title = parts[0], parts[1]
        ko = parts[2] if len(parts) > 2 else title
        if key not in keys:
            rejected.append((key, title, 'Dog CEO에 없는 키'))
            continue
        st, s = get(wiki_url(title))
        time.sleep(1.0)
        ex = (s or {}).get('extract', '')
        if not (st == 200 and s.get('type') == 'standard' and len(ex) >= 40 and DOG.search(ex[:150])):
            rejected.append((key, title, f"HTTP {st} type={(s or {}).get('type')} 개말={bool(DOG.search(ex[:150]))} {len(ex)}자 | {ex[:40]}"))
            continue
        st2, img = get(f'https://dog.ceo/api/breed/{key}/images/random/3')
        if st2 != 200 or not img or len(img.get('message', [])) < 1:
            rejected.append((key, title, f'사진 실패 HTTP {st2}'))
            continue
        wiki[title] = s
        images[key] = img
        included.append({'key': key, 'ko': ko, 'wiki': title})
        time.sleep(0.2)

    # 한국어 이름이 겹치면 안 된다
    names = [b['ko'] for b in included]
    dup = {n for n in names if names.count(n) > 1}
    assert not dup, f'ko 이름 중복: {dup}'

    # 틀린 문서 예 (규칙 검증용): 동음이의, 사람 문서
    bad = {}
    for title in ('치와와', '샤페이'):
        st, s = get(wiki_url(title))
        time.sleep(1.0)
        bad[title] = s
    save('wiki-summaries.json', wiki)
    save('dog-images.json', images)
    save('wiki-bad-examples.json', bad)

    included.sort(key=lambda b: b['ko'])
    body = ',\n'.join(
        f"  {{ key: {json.dumps(b['key'])}, ko: {json.dumps(b['ko'], ensure_ascii=False)}, wiki: {json.dumps(b['wiki'], ensure_ascii=False)} }}"
        for b in included
    )
    js = f"""// 직접 검증한 품종 이름표 ({len(included)}개). 두 API의 이름을 잇는다.
//  key : Dog CEO 품종 키 (예: 'retriever/golden')
//  ko  : 화면에 보일 한국어 이름 (서로 겹치지 않음)
//  wiki: 한국어 위키백과 문서 제목 (동음이의는 '치와와 (개)'처럼 고정)
// 검증({date.today().isoformat()}, tools/build_fixtures.py): Dog CEO 키가 실제로 있고, 위키 문서가 standard이며 앞부분에 개 품종 낱말이 있는 것만 통과.
// 실패 후보는 넣지 않았다. (예: '샤페이'는 사람 문서로 연결돼 제외)
export const BREEDS = [
{body}
];
"""
    with open(os.path.join(ROOT, 'data', 'breeds.js'), 'w', encoding='utf-8') as f:
        f.write(js)

    print(f'통과 {len(included)} / 후보 {len(CANDIDATES)}')
    print('--- 제외')
    for k, t, why in rejected:
        print(f'{k:<26}{t:<22}{why}')


main()
