import { searchCity, fetchWeather } from './api.js';
import { getAdvice } from './advice.js';
import { describe } from './weather-codes.js';
import { categoryOf, recommend, youtubeUrl, CATEGORY_LABEL } from './recommend.js';
import { getOutfit, humidityLabel, windLabel } from './outfit.js';
import { tonightMoon, getMoonReport } from './moon.js';

const cloudMapUrl = (lat, lon) =>
  `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}` +
  '&zoom=6&level=surface&overlay=clouds&product=ecmwf&menu=&message=true&marker=true&calendar=now' +
  '&type=map&location=coordinates&detail=&metricWind=m%2Fs&metricTemp=%C2%B0C&radarRange=-1';

const $ = (id) => document.getElementById(id);
const form = $('search-form');
const input = $('city-input');
const geoBtn = $('geo-btn');
const candidatesEl = $('candidates');
const statusEl = $('status');
const resultEl = $('result');

const STORAGE_KEY = 'day3:lastPlace';
const DEFAULT_PLACE = { name: '서울', region: '대한민국', lat: 37.566, lon: 126.9784 };

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (Math.round(n * 10) / 10).toString();

// 캐릭터: 우산 상태·말풍선은 추천 결과(level)를, 표정과 몸짓은 날씨(category)를 따른다
const mascotEl = $('mascot');
const bubbleEl = $('mascot-bubble');
const bubbleShapeEl = $('mascot-bubble-shape');
const MASCOT = {
  thinking: ['thinking', '쓸까? 말까?'],
  home: ['closed', '집에 있자… 🏠'],
  raincoat: ['closed', '우비 입자! 🧥'],
  long: ['open', '장우산 필수!'],
  folding: ['open', '접이식 챙겨~'],
  hood: ['closed', '후드면 돼~'],
  none: ['closed', '안 써도 돼! 😎'],
};

// 날씨 -> 캐릭터 모습. 맑음·더움: 땀 흘리며 힘듦 / 비: 방긋 신남 / 흐림: 해먹에서 휘파람. 나머지(눈·추움)는 원래 모습.
const MOODS = { clear: 'sweat', hot: 'sweat', cloudy: 'hammock', drizzle: 'joy', rain: 'joy', storm: 'joy' };
const MOOD_LABEL = {
  neutral: '우산을 쓸까 말까 고민하는 빗방울 캐릭터',
  sweat: '더워서 땀을 뻘뻘 흘리며 힘들어하는 빗방울 캐릭터',
  joy: '비가 와서 방긋 웃으며 신나하는 빗방울 캐릭터',
  hammock: '해먹에 누워 천진난만하게 휘파람을 부는 빗방울 캐릭터',
};
const MOOD_TEXT = { sweat: '으아 더워… 💦', hammock: '휘이~ ♪ 편하다~' };
const JOY_TEXT = { home: '집에서 구경!', raincoat: '우비 첨벙! 🧥', long: '장우산 신나!', folding: '접이식 신나!', hood: '후드로 첨벙!', none: '비다 비~! 🎶' };
let currentMood = 'neutral'; // render()가 날씨 카테고리로 정한다

// 말풍선 크기를 글자 길이에 맞춘다
function fitBubble() {
  const w = bubbleEl.getComputedTextLength?.() ?? 80;
  const rx = Math.min(64, Math.max(46, w / 2 + 14));
  bubbleShapeEl.setAttribute('rx', rx);
  bubbleShapeEl.setAttribute('cx', rx + 4);
  bubbleEl.setAttribute('x', rx + 4);
}

function setMascot(key, mood = 'neutral') {
  const [state, advice] = MASCOT[key] ?? MASCOT.thinking;
  const text = key === 'thinking' ? advice : MOOD_TEXT[mood] ?? (mood === 'joy' ? JOY_TEXT[key] : null) ?? advice;
  mascotEl.setAttribute('class', `mascot ${state} mood-${mood}`);
  mascotEl.setAttribute('aria-label', MOOD_LABEL[mood]);
  bubbleEl.textContent = text;
  fitBubble();
}

// 날씨 카테고리 -> 배경(맑음/흐림/비/눈) + 비·눈 입자 생성
const SCENES = { clear: 'sunny', hot: 'sunny', cold: 'sunny', cloudy: 'cloudy', drizzle: 'rainy', rain: 'rainy', storm: 'rainy', snow: 'snowy' };
const RAIN_COUNT = { drizzle: 70, rain: 160, storm: 300 };
const precipEl = $('precip');
let precipKey = '';
const rand = (a, b) => a + Math.random() * (b - a);

function setScene(category) {
  const scene = SCENES[category] ?? 'sunny';
  const storm = category === 'storm';
  document.body.dataset.scene = scene;
  document.body.classList.toggle('heavy', storm);

  const count = scene === 'rainy' ? RAIN_COUNT[category] ?? 160 : scene === 'snowy' ? 90 : 0;
  const key = `${scene}:${count}`;
  if (key === precipKey) return;
  precipKey = key;
  precipEl.replaceChildren();
  precipEl.classList.toggle('storm', storm);

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const near = Math.random() < 0.4; // 가까운 입자는 크고 선명, 먼 입자는 작고 흐리게
    p.style.left = `${rand(-5, 105).toFixed(1)}%`;
    p.style.animationDelay = `-${rand(0, 8).toFixed(2)}s`;
    if (scene === 'snowy') {
      const size = near ? rand(5, 9) : rand(2, 5);
      p.className = 'flake';
      p.style.width = p.style.height = `${size.toFixed(1)}px`;
      p.style.opacity = (near ? rand(0.7, 0.95) : rand(0.4, 0.7)).toFixed(2);
      p.style.filter = near ? 'blur(1.2px)' : 'blur(0.4px)';
      p.style.animationDuration = `${(near ? rand(6, 9) : rand(9, 14)).toFixed(1)}s`;
    } else {
      p.className = near ? 'drop near' : 'drop far';
      p.style.height = `${(near ? rand(30, 54) : rand(12, 24)).toFixed(0)}px`;
      p.style.opacity = (near ? rand(0.45, 0.8) : rand(0.2, 0.4)).toFixed(2);
      p.style.animationDuration = `${((near ? rand(0.55, 0.85) : rand(0.95, 1.4)) * (storm ? 0.65 : 1)).toFixed(2)}s`;
    }
    frag.append(p);
  }
  precipEl.append(frag);
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

function savePlace(place) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(place)); } catch { /* 저장 실패는 무시 */ }
}

function loadPlace() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

async function showPlace(place) {
  setStatus('날씨 불러오는 중…');
  setMascot('thinking');
  resultEl.hidden = true;
  try {
    const summary = await fetchWeather(place.lat, place.lon);
    const advice = getAdvice(summary);
    render(place, summary, advice);
    setMascot(advice.level, currentMood);
    savePlace(place);
    setStatus('');
  } catch (err) {
    setStatus(err.message || '날씨를 가져오지 못했어요.', true);
  }
}

async function onSearch(e) {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  candidatesEl.replaceChildren();
  setStatus('도시 찾는 중…');
  try {
    const places = await searchCity(q);
    if (!places.length) {
      setStatus(`"${q}"를 찾지 못했어요. 다른 이름으로 검색해 보세요.`, true);
      return;
    }
    renderCandidates(places);
    await showPlace(places[0]);
  } catch (err) {
    setStatus(err.message, true);
  }
}

function renderCandidates(places) {
  candidatesEl.replaceChildren();
  if (places.length < 2) return;
  for (const p of places) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${p.name}${p.region ? ` · ${p.region}` : ''}`;
    b.addEventListener('click', () => showPlace(p));
    candidatesEl.append(b);
  }
}

function onGeo() {
  if (!navigator.geolocation) {
    setStatus('이 브라우저는 위치 기능을 지원하지 않아요.', true);
    return;
  }
  setStatus('현재 위치 확인 중…');
  candidatesEl.replaceChildren();
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => showPlace({ name: '현재 위치', region: '', lat: coords.latitude, lon: coords.longitude }),
    (err) =>
      setStatus(
        err.code === err.PERMISSION_DENIED
          ? '위치 권한이 거부됐어요. 도시 이름으로 검색해 주세요.'
          : '현재 위치를 가져오지 못했어요.',
        true
      ),
    { timeout: 10000 }
  );
}

function render(place, s, advice) {
  const weather = describe(s.worstCode);
  const category = categoryOf(s, advice);
  const outfit = getOutfit(s);
  const range = (a, b, unit) => `${fmt(a)}~${fmt(b)}${unit}`;
  const moon = tonightMoon();
  const moonReport = getMoonReport(moon, s.night);
  document.body.dataset.tone = advice.tone;
  setScene(category);
  currentMood = MOODS[category] ?? 'neutral';

  const card = (label, item) => `
    <div class="check">
      <div class="check-label">${label}</div>
      <div class="check-icon">${item.icon}</div>
      <div class="check-title">${esc(item.title)}</div>
      <div class="check-desc">${esc(item.desc)}</div>
    </div>`;

  resultEl.innerHTML = `
    <div class="hero">
      <div class="place">${esc(place.name)}${place.region ? ` <span>${esc(place.region)}</span>` : ''}</div>
      <div class="hero-icon">${weather.icon}</div>
      <h2>${esc(advice.headline)}</h2>
      <p class="weather-line">${esc(weather.label)} · ${fmt(s.temp)}° (체감 ${fmt(s.feels)}°)</p>
      <p class="reasons">${advice.reasons.map(esc).join('<br>')}</p>
      <p class="reasons-sub">앞으로 12시간 기준</p>
    </div>

    <div class="checks">
      ${card('우산', advice.umbrella)}
      ${card('신발', advice.shoes)}
      ${card('우비', advice.raincoat)}
    </div>

    <div class="stats">
      <div><span>🌡 기온</span><b>${fmt(s.temp)}°</b><small>체감 ${fmt(s.feels)}° · ${range(s.minTemp, s.maxTemp, '°')}</small></div>
      <div><span>💧 습도</span><b>${Math.round(s.humidity)}%</b><small>${humidityLabel(s.humidity)}</small></div>
      <div><span>💨 바람</span><b>${fmt(s.maxWind)}m/s</b><small>${windLabel(s.maxWind)} · 돌풍 ${fmt(s.maxGust)}</small></div>
    </div>

    <div class="outfit">
      <div class="outfit-head">
        <div class="outfit-icon">${outfit.sleeve.icon}</div>
        <div>
          <h3>👗 오늘의 옷차림: ${esc(outfit.sleeve.title)}</h3>
          <p>${esc(outfit.sleeve.desc)} <span class="muted">(체감 ${fmt(outfit.base)}° 기준)</span></p>
        </div>
      </div>
      <dl>
        <dt>상의</dt><dd>${esc(outfit.top)}</dd>
        <dt>하의</dt><dd>${esc(outfit.bottom)}</dd>
        <dt>겉옷</dt><dd>${esc(outfit.outer)}</dd>
        ${outfit.extras.length ? `<dt>소품</dt><dd>${outfit.extras.map(esc).join(', ')}</dd>` : ''}
      </dl>
      ${outfit.tips.length ? `<ul class="tips">${outfit.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </div>

    ${advice.notes.length ? `<ul class="notes">${advice.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

    <div class="moon" data-rating="${moonReport.rating}">
      <div class="moon-head">
        <div class="moon-icon">${moon.icon}</div>
        <div>
          <h3>오늘 밤 달 · ${esc(moon.name)}</h3>
          <p class="moon-pct">밝기 약 <b>${moon.illumination}%</b> <span>(보름달 = 100%)</span></p>
        </div>
      </div>
      <div class="moon-meter"><i style="width:${moon.illumination}%"></i></div>
      <h4 class="moon-headline">${esc(moonReport.headline)}</h4>
      <ul class="moon-lines">${moonReport.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${moonReport.tips.length ? `<ul class="moon-tips">${moonReport.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${
        moonReport.bars.length
          ? `<div class="cloud-bars" aria-label="밤 시간대 구름량">${moonReport.bars
              .map(
                (b) => `<div class="cloud-bar${b.on ? ' on' : ''}" title="${b.hour}시 구름 ${Math.round(b.cloud)}%">
                  <span style="height:${Math.max(4, b.cloud)}%"></span><em>${b.hour}</em></div>`
              )
              .join('')}</div>
            <p class="bars-note">시간별 구름량 (진한 막대 = 달이 떠 있는 시간)</p>`
          : ''
      }
      <details id="cloud-map">
        <summary>🗺 구름·비 지도 보기</summary>
        <div id="cloud-map-body"></div>
        <p class="bars-note">Windy 구름·비 지도 · 아래 재생 막대를 밤 시간으로 옮겨 보세요</p>
      </details>
    </div>

    <div class="reco">
      <div class="reco-head">
        <h3>${esc(CATEGORY_LABEL[category])} 추천</h3>
        <button type="button" id="again-btn">🔄 다시 추천</button>
      </div>
      <div id="reco-body"></div>
    </div>`;

  const renderReco = () => {
    const { songs, foods } = recommend(category);
    const homeNote =
      advice.level === 'home'
        ? '<p class="home-note">🏠 오늘은 밖에 나가지 말고 배달로 해결해요!</p>'
        : '';
    $('reco-body').innerHTML = `
      <h4>🎵 음악</h4>
      <ul class="songs">
        ${songs
          .map(
            (song) => `<li><a href="${youtubeUrl(song)}" target="_blank" rel="noopener">
              <strong>${esc(song.title)}</strong>${song.artist ? `<span>${esc(song.artist)}</span>` : ''}<em>▶ YouTube</em></a></li>`
          )
          .join('')}
      </ul>
      <h4>🍽 오늘의 메뉴</h4>
      ${homeNote}
      <ul class="foods">
        ${foods.map((f) => `<li><span>${f.icon}</span>${esc(f.name)}</li>`).join('')}
      </ul>`;
  };
  renderReco();
  $('again-btn').addEventListener('click', renderReco);
  // 지도는 열 때만 불러오기 (외부 iframe 로딩 절약)
  $('cloud-map').addEventListener('toggle', (e) => {
    const body = $('cloud-map-body');
    if (e.target.open && !body.firstChild) {
      const frame = document.createElement('iframe');
      frame.src = cloudMapUrl(place.lat, place.lon);
      frame.title = '구름 지도';
      frame.loading = 'lazy';
      body.append(frame);
    }
  });
  resultEl.hidden = false;
}

form.addEventListener('submit', onSearch);
geoBtn.addEventListener('click', onGeo);

showPlace(loadPlace() ?? DEFAULT_PLACE);
