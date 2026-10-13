import { severity } from './weather-codes.js';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const WINDOW_HOURS = 12; // 지금부터 외출~귀가 시간대

async function getJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('네트워크 연결을 확인해 주세요.');
  }
  if (!res.ok) throw new Error(`날씨 서버 오류 (${res.status})`);
  return res.json();
}

// 지오코딩 API가 한글 도시명을 잘 못 찾아서(예: "서울" 결과 없음) 주요 도시는 영문명으로 바꿔 검색
const ALIASES = {
  서울: 'Seoul', 부산: 'Busan', 인천: 'Incheon', 대구: 'Daegu', 대전: 'Daejeon',
  광주: 'Gwangju', 울산: 'Ulsan', 세종: 'Sejong', 수원: 'Suwon', 성남: 'Seongnam',
  고양: 'Goyang', 용인: 'Yongin', 창원: 'Changwon', 청주: 'Cheongju', 전주: 'Jeonju',
  천안: 'Cheonan', 포항: 'Pohang', 제주: 'Jeju', 춘천: 'Chuncheon', 강릉: 'Gangneung',
  여수: 'Yeosu', 목포: 'Mokpo', 안동: 'Andong', 김해: 'Gimhae',
};

export async function searchCity(name) {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const q = ALIASES[trimmed.replace(/(특별시|광역시|시)$/, '')] ?? trimmed;
  const data = await getJson(
    `${GEO_URL}?name=${encodeURIComponent(q)}&count=5&language=ko&format=json`
  );
  // 인구가 많은 도시를 먼저 (동명이인 지역 대비)
  return (data.results ?? [])
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }));
}

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
    hourly:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high',
    timezone: 'auto',
    wind_speed_unit: 'ms',
    forecast_days: 2,
  });
  return summarize(await getJson(`${FORECAST_URL}?${params}`));
}

// 오늘 밤(저녁 19시 ~ 다음날 05시, 지금이 새벽이면 지금 ~ 05시)의 시간별 구름/강수
function nightHours({ current, hourly }) {
  const now = current.time.slice(0, 13);
  const day = current.time.slice(0, 10);
  const hr = Number(current.time.slice(11, 13));
  const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  let start;
  let end;
  if (hr < 5) {
    start = now;
    end = `${day}T05`;
  } else {
    start = hr >= 19 ? now : `${day}T19`;
    end = `${nextDay}T05`;
  }
  const v = (key, i) => hourly[key]?.[i] ?? 0;
  const out = [];
  hourly.time.forEach((t, i) => {
    const k = t.slice(0, 13);
    if (k < start || k > end) return;
    out.push({
      hour: Number(t.slice(11, 13)),
      cloud: v('cloud_cover', i),
      low: v('cloud_cover_low', i),
      mid: v('cloud_cover_mid', i),
      high: v('cloud_cover_high', i),
      prob: v('precipitation_probability', i),
      precip: v('precipitation', i),
    });
  });
  return out;
}

// API 응답 -> advice.js가 쓰는 요약값 (지금부터 WINDOW_HOURS 시간)
export function summarize({ current, hourly }) {
  const night = nightHours({ current, hourly });
  const now = current.time.slice(0, 13);
  const start = Math.max(0, hourly.time.findIndex((t) => t.slice(0, 13) >= now));
  const slice = (key) =>
    hourly[key].slice(start, start + WINDOW_HOURS).map((v) => v ?? 0);

  const precip = [current.precipitation, ...slice('precipitation')];
  const prob = slice('precipitation_probability');
  const gust = [current.wind_gusts_10m, ...slice('wind_gusts_10m')];
  const wind = [current.wind_speed_10m, ...slice('wind_speed_10m')];
  const codes = [current.weather_code, ...slice('weather_code')];
  const temps = [current.temperature_2m, ...slice('temperature_2m')];
  const feels = [current.apparent_temperature, ...slice('apparent_temperature')];
  const max = (a) => Math.max(...a);
  const min = (a) => Math.min(...a);

  return {
    temp: current.temperature_2m,
    feels: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    night,
    minTemp: min(temps),
    maxTemp: max(temps),
    minFeels: min(feels),
    maxFeels: max(feels),
    code: current.weather_code,
    worstCode: codes.reduce((w, c) => (severity(c) > severity(w) ? c : w)),
    maxPrecip: max(precip),
    maxProb: max(prob),
    maxGust: max(gust),
    maxWind: max(wind),
  };
}
