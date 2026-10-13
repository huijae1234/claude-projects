import { isSnow, isThunder } from './weather-codes.js';

// 임계값 (조정하기 쉽게 한곳에 모음). 강수 mm/h, 바람 m/s
export const T = {
  homeGust: 20,
  homePrecip: 30,
  thunderGust: 15,
  coatGust: 14,
  coatPrecip: 10,
  coatWind: 9,
  coatWindPrecip: 1,
  longPrecip: 3,
  foldPrecip: 0.5,
  foldProb: 40,
};

const fmt = (n) => (Math.round(n * 10) / 10).toString();

/**
 * summary: { temp, feels, worstCode, maxPrecip, maxProb, maxGust, maxWind }
 * 반환: { level, tone, headline, umbrella, shoes, raincoat, notes[], reasons[] }
 *  level: home | raincoat | long | folding | hood | none
 *  tone : danger | warn | ok | safe  (색상용)
 */
export function getAdvice(s) {
  const wet = s.maxPrecip >= T.foldPrecip;
  const snow = isSnow(s.worstCode);
  const thunder = isThunder(s.worstCode);

  const reasons = [
    `최대 강수 ${fmt(s.maxPrecip)}mm/h · 강수확률 ${Math.round(s.maxProb)}%`,
    `최대 풍속 ${fmt(s.maxWind)}m/s · 돌풍 ${fmt(s.maxGust)}m/s`,
  ];

  let level;
  if (
    s.maxGust >= T.homeGust ||
    s.maxPrecip >= T.homePrecip ||
    (thunder && s.maxGust >= T.thunderGust)
  ) {
    level = 'home';
  } else if (
    (s.maxGust >= T.coatGust && wet) ||
    s.maxPrecip >= T.coatPrecip ||
    (s.maxWind >= T.coatWind && s.maxPrecip >= T.coatWindPrecip)
  ) {
    level = 'raincoat';
  } else if (s.maxPrecip >= T.longPrecip) {
    level = 'long';
  } else if (wet || s.maxProb >= T.foldProb) {
    level = 'folding';
  } else if (s.maxPrecip > 0) {
    level = 'hood';
  } else {
    level = 'none';
  }

  const table = {
    home: {
      tone: 'danger',
      headline: '오늘은 집에 있는 걸 추천해요 🏠',
      umbrella: { icon: '🚫', title: '우산 소용없음', desc: '바람과 비가 너무 거세요' },
      raincoat: { icon: '🧥', title: '나가야 한다면 필수', desc: '그래도 외출은 비추천이에요' },
      shoes: { icon: '🥾', title: '레인부츠', desc: '꼭 나가야 한다면 방수 필수' },
    },
    raincoat: {
      tone: 'warn',
      headline: '우비를 입고 나가세요 🧥',
      umbrella: { icon: '🚫', title: '우산은 비추천', desc: '센 바람에 뒤집히고 옷도 젖어요' },
      raincoat: { icon: '🧥', title: '우비 필수', desc: '상하의 분리형이면 더 좋아요' },
      shoes: { icon: '🥾', title: '레인부츠', desc: '물이 많이 고여 있을 거예요' },
    },
    long: {
      tone: 'warn',
      headline: '장우산을 챙기세요 ☂️',
      umbrella: { icon: '☂️', title: '장우산', desc: '꽤 내려서 접이식은 모자라요' },
      raincoat: { icon: '✅', title: '필요 없어요', desc: '우산이면 충분해요' },
      shoes: { icon: '🥾', title: '레인부츠', desc: '운동화는 젖을 수 있어요' },
    },
    folding: {
      tone: 'ok',
      headline: '접이식 우산 하나 챙기세요 🌂',
      umbrella: { icon: '🌂', title: '접이식 우산', desc: '가방에 쏙 넣어 두세요' },
      raincoat: { icon: '✅', title: '필요 없어요', desc: '가벼운 비예요' },
      shoes: {
        icon: '👟',
        title: '운동화 OK',
        desc: wet ? '방수 스프레이를 뿌리면 좋아요' : '비 올 확률은 있지만 약해요',
      },
    },
    hood: {
      tone: 'safe',
      headline: '후드만 써도 괜찮아요 🧢',
      umbrella: { icon: '🧢', title: '후드/모자', desc: '이슬비 정도예요' },
      raincoat: { icon: '✅', title: '필요 없어요', desc: '살짝 맞는 정도예요' },
      shoes: { icon: '👟', title: '운동화', desc: '편하게 신고 나가세요' },
    },
    none: {
      tone: 'safe',
      headline: '우산 없이 가볍게 나가요 😎',
      umbrella: { icon: '✅', title: '필요 없어요', desc: '비 소식이 없어요' },
      raincoat: { icon: '✅', title: '필요 없어요', desc: '' },
      shoes: { icon: '👟', title: '운동화', desc: '마음껏 신으세요' },
    },
  };

  const advice = { level, ...table[level], notes: [], reasons };

  const notes = advice.notes;
  if (snow) {
    advice.shoes = { icon: '🥾', title: '방수 부츠', desc: '눈길이 미끄러울 수 있어요' };
    notes.push('❄️ 눈 소식이 있어요. 미끄럼에 주의하세요.');
  }
  if (thunder) notes.push('⚡ 천둥·번개 가능성이 있어요. 나무 아래는 피하세요.');
  if ((level === 'long' || level === 'folding') && s.maxGust >= 10) {
    notes.push('💨 바람이 있어요. 우산이 뒤집힐 수 있으니 튼튼한 걸로 챙기세요.');
  }
  if (s.feels <= 5) notes.push('🧣 쌀쌀해요. 따뜻한 겉옷을 챙기세요.');
  if (s.feels >= 30) notes.push('💧 무더워요. 물을 챙기세요.');

  return advice;
}
