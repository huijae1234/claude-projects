// 달의 위상(밝기 %)과 "오늘 밤 달 볼 수 있나?" 판단
const SYNODIC = 29.530588853;

// range: 달이 떠 있는 시간대 (밤 시각: 19~23시는 그대로, 0~5시는 +24)
const PHASES = [
  { max: 1.85, name: '삭 (신월)', icon: '🌑', when: '달이 해와 같은 방향이라 거의 보이지 않아요.', range: null },
  { max: 5.53, name: '초승달', icon: '🌒', when: '해 진 직후 서쪽 하늘 낮은 곳에서 잠깐 보여요.', range: [19, 22] },
  { max: 9.22, name: '상현달', icon: '🌓', when: '저녁에 남쪽 하늘에 떠서 자정 무렵 져요.', range: [19, 25] },
  { max: 12.91, name: '차오르는 달', icon: '🌔', when: '저녁부터 밤늦게까지 동쪽~남쪽 하늘에 떠 있어요.', range: [19, 27] },
  { max: 16.61, name: '보름달 근처', icon: '🌕', when: '해 질 무렵 동쪽에서 떠올라 밤새 보여요.', range: [19, 29] },
  { max: 20.3, name: '기우는 달', icon: '🌖', when: '밤 9~10시쯤 동쪽에서 떠올라 새벽까지 보여요.', range: [22, 29] },
  { max: 23.99, name: '하현달', icon: '🌗', when: '자정 무렵 떠올라 새벽에 높이 떠요.', range: [24, 29] },
  { max: 27.68, name: '그믐달', icon: '🌘', when: '새벽에 동쪽 하늘에서 가늘게 떠요.', range: [27, 29] },
  { max: Infinity, name: '삭 (신월)', icon: '🌑', when: '달이 해와 같은 방향이라 거의 보이지 않아요.', range: null },
];

/** 달 나이로 밝기(보름=100%)와 위상 계산. 오차는 몇 % 이내라 "약"으로 표시 */
export function getMoon(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const age = (((jd - 2451550.1) % SYNODIC) + SYNODIC) % SYNODIC;
  const illumination = ((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2) * 100;
  const phase = PHASES.find((p) => age < p.max);
  const result = { age, illumination: Math.round(illumination), ...phase };
  if (result.illumination >= 97) result.name = '보름달';
  return result;
}

// 오늘 밤을 기준으로 달 계산 (낮에 열어도 저녁 9시 기준, 새벽이면 지금 기준)
export function tonightMoon(now = new Date()) {
  const d = new Date(now);
  const h = d.getHours();
  if (h >= 5 && h < 21) d.setHours(21, 0, 0, 0);
  return getMoon(d);
}

const nightHour = (h) => (h >= 12 ? h : h + 24);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n) => `${Math.round(n)}%`;

/**
 * night: summary.night (시간별 구름). 반환: { rating, headline, lines[], tips[], bars[] }
 *  rating: great | good | fair | poor | gone
 */
export function getMoonReport(moon, night) {
  const isNew = !moon.range;
  const range = moon.range ?? [19, 29]; // 삭이면 별 보기 기준으로 밤 전체
  const inRange = (n) => nightHour(n.hour) >= range[0] && nightHour(n.hour) <= range[1];
  const visible = night.filter(inRange);
  const bars = night.map((n) => ({ hour: n.hour, cloud: n.cloud, on: inRange(n) }));

  const base = { bars, lines: [moon.when], tips: [] };

  if (!visible.length) {
    return {
      ...base,
      rating: 'gone',
      headline: isNew ? '오늘 밤은 달이 없는 밤이에요' : '오늘 밤 달은 아직 안 떴거나 이미 졌어요',
    };
  }

  const cloud = avg(visible.map((n) => n.cloud));
  const low = avg(visible.map((n) => n.low));
  const mid = avg(visible.map((n) => n.mid));
  const high = avg(visible.map((n) => n.high));
  const rainy = visible.some((n) => n.prob >= 60 || n.precip >= 0.5);
  const clearest = visible.reduce((b, n) => (n.cloud < b.cloud ? n : b));
  const dawnOnly = range[0] >= 24;

  let rating;
  if (rainy || cloud > 70) rating = 'poor';
  else if (cloud > 45) rating = 'fair';
  else if (cloud > 20) rating = 'good';
  else rating = 'great';

  const headlines = {
    great: isNew ? '달은 없지만 별이 잘 보이는 밤이에요 ✨' : dawnOnly ? '새벽에 달이 떠요. 하늘이 맑아서 잘 보일 거예요 🌙' : '오늘은 달이 잘 보여요~ 🌙',
    good: isNew ? '구름이 조금 있지만 별이 보이는 밤이에요 ✨' : '구름이 조금 있지만 달이 보여요 🌙',
    fair: '구름이 많아서 달이 가끔만 보여요 ⛅',
    poor: rainy ? '오늘은 비 때문에 달 보기 어려워요 ☔' : '구름이 두꺼워서 달 보기 어려워요 ☁️',
  };

  const lines = [
    moon.when,
    `달이 뜬 시간대 구름 평균 ${pct(cloud)} (낮은 ${pct(low)} · 중간 ${pct(mid)} · 높은 ${pct(high)})`,
  ];
  if (rating !== 'poor') {
    lines.push(`가장 맑은 시간은 ${clearest.hour}시쯤이에요 (구름 ${pct(clearest.cloud)})`);
  }
  if (moon.illumination >= 85) lines.push('달빛이 아주 밝아서 별은 잘 안 보여요.');
  else if (moon.illumination <= 15 && !isNew) lines.push('달빛이 약해서 별 보기에도 좋아요 ✨');

  // 구름 감상 포인트: 달이 어느 정도 밝고 비가 없을 때
  const tips = [];
  if (!rainy && !isNew && moon.illumination >= 15) {
    if (high >= 35 && low < 35) {
      tips.push('🌌 높은 곳의 새털구름이 얇게 깔려서 달 주변에 달무리(둥근 빛)가 보일 수도 있어요!');
    } else if (mid >= 25 && low < 30) {
      tips.push('☁️ 중간 높이 구름이 달빛을 받아 은은하게 빛날 거예요. 구름 구경하기 좋아요.');
    } else if (cloud >= 25 && cloud <= 55) {
      tips.push('📸 구름 사이로 달이 숨바꼭질해서 사진 찍기 좋은 하늘이에요.');
    }
  }
  if (rating === 'great' || rating === 'good') {
    tips.push(isNew ? '오늘은 별 보면 좋겠다~ ✨' : '오늘 밤 잠깐 하늘 올려다보면 좋겠다~ 🌙');
  }

  return { rating, headline: headlines[rating], lines, tips, bars };
}
