# 오늘 우짜쓰까?

날씨를 보고 **오늘 우산을 챙길지, 뭘 입을지, 나가도 될지**를 한 화면에 알려 주는 웹페이지입니다. 빌드 없이 `index.html`만 열면 동작합니다.

## 무엇을 해 주나

- 현재 위치(또는 고른 지역)의 날씨를 가져와 **우산 / 장화 / 우비 / 집에 있기** 중 하나로 판단합니다.
- 기온·체감온도에 맞는 **옷차림**, 날씨에 어울리는 **노래·음식** 추천, **달 모양**을 함께 보여 줍니다.
- 날씨에 따라 배경(하늘, 구름, 햇살, 비, 눈)이 바뀝니다. 그림 파일 없이 CSS/SVG 효과만 씁니다.

## 판단 방식

판단 규칙은 [js/advice.js](js/advice.js)의 임계값 한 곳에 모여 있습니다(최대 강수 mm/h, 돌풍·풍속 m/s, 강수확률).
숫자 기준으로 `home → raincoat → long → folding → hood → none` 순서로 가장 위험한 단계를 고르고, 근거 수치를 같이 보여 줍니다.

## 구성

```
index.html          화면 뼈대와 날씨 배경
style.css
js/api.js           날씨 API 호출
js/weather-codes.js 날씨 코드 분류(눈, 천둥 등)
js/advice.js        우산·우비 판단 규칙
js/outfit.js        옷차림 추천
js/recommend.js     날씨별 노래·음식 추천
js/moon.js          달 위상 계산
js/app.js           화면 연결
```

## 실행

`index.html`을 브라우저로 열면 됩니다. 일부 브라우저에서 위치 권한이나 모듈 로딩이 막히면 로컬 서버로 여세요.

```bash
python -m http.server 8000
```

## 데이터 출처

[Open-Meteo](https://open-meteo.com/) 무료 API(날씨, 지오코딩)를 사용합니다. API 키는 필요 없습니다.
