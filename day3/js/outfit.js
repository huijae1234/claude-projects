// 기온·체감·습도·바람을 반영한 옷차림 추천

export const humidityLabel = (h) =>
  h < 30 ? '건조해요' : h <= 60 ? '쾌적해요' : h <= 75 ? '약간 습해요' : '습해요';

export const windLabel = (w) =>
  w < 3 ? '잔잔해요' : w < 7 ? '약간 불어요' : w < 11 ? '바람이 강해요' : '매우 강해요';

// 기준 체감온도(°C) 하한 -> 옷차림. 위에서부터 먼저 맞는 것 적용
const BANDS = [
  {
    min: 28,
    sleeve: { icon: '🩳', title: '반팔 OK', desc: '민소매도 좋아요' },
    top: '민소매, 반팔 티 (린넨·기능성)',
    bottom: '반바지, 얇은 린넨 팬츠',
    outer: '필요 없어요',
    extras: ['모자·선글라스', '물 / 휴대용 선풍기'],
  },
  {
    min: 23,
    sleeve: { icon: '👕', title: '반팔 OK', desc: '편하게 입어도 돼요' },
    top: '반팔 티, 얇은 셔츠',
    bottom: '면바지, 반바지',
    outer: '필요 없어요 (냉방 심한 곳엔 얇은 셔츠)',
    extras: [],
  },
  {
    min: 20,
    sleeve: { icon: '👔', title: '반팔 + 겉옷', desc: '반팔도 되지만 얇은 겉옷 하나' },
    top: '반팔 티 또는 얇은 긴팔 티',
    bottom: '청바지, 면바지',
    outer: '얇은 가디건, 셔츠',
    extras: [],
  },
  {
    min: 17,
    sleeve: { icon: '🧶', title: '긴팔 추천', desc: '선선해서 긴팔이 무난해요' },
    top: '얇은 니트, 맨투맨',
    bottom: '청바지, 슬랙스',
    outer: '가디건, 얇은 자켓',
    extras: [],
  },
  {
    min: 12,
    sleeve: { icon: '🧥', title: '긴팔 + 자켓', desc: '쌀쌀해서 겉옷이 필요해요' },
    top: '니트, 맨투맨 (셔츠 겹쳐 입기)',
    bottom: '청바지, 두께감 있는 팬츠',
    outer: '자켓, 청자켓, 가디건',
    extras: [],
  },
  {
    min: 9,
    sleeve: { icon: '🧥', title: '긴팔 + 아우터', desc: '꽤 쌀쌀해요' },
    top: '두꺼운 니트, 후드티',
    bottom: '기모 없는 두꺼운 팬츠',
    outer: '트렌치코트, 야상, 가죽자켓',
    extras: ['얇은 목도리'],
  },
  {
    min: 5,
    sleeve: { icon: '🧣', title: '긴팔 + 코트', desc: '춥고 껴입는 게 좋아요' },
    top: '니트 + 히트텍',
    bottom: '기모 바지, 두꺼운 팬츠',
    outer: '코트, 두꺼운 자켓',
    extras: ['목도리'],
  },
  {
    min: -5,
    sleeve: { icon: '🧤', title: '단단히 껴입기', desc: '패딩이 필요해요' },
    top: '기모 맨투맨 + 히트텍',
    bottom: '기모 바지',
    outer: '패딩, 롱패딩',
    extras: ['목도리', '장갑', '비니'],
  },
  {
    min: -Infinity,
    sleeve: { icon: '🥶', title: '완전 무장', desc: '살을 에는 추위예요' },
    top: '히트텍 + 기모 상의 + 두꺼운 니트',
    bottom: '기모 바지 + 내복',
    outer: '두꺼운 롱패딩',
    extras: ['목도리', '장갑', '비니', '핫팩'],
  },
];

/**
 * s: { feels, minFeels, humidity, maxWind, maxGust, maxPrecip, worstCode }
 * 반환: { base, sleeve, top, bottom, outer, extras[], tips[] }
 */
export function getOutfit(s) {
  const windy = s.maxWind >= 8 || s.maxGust >= 12;
  const humid = s.humidity >= 70;
  const dry = s.humidity <= 35;
  const wet = s.maxPrecip >= 0.5;

  // 지금 체감과 앞으로 12시간 중 가장 낮은 체감의 중간값 (귀가 시간 고려)
  let base = (s.feels + s.minFeels) / 2;
  if (windy) base -= 1; // 체감온도에 반영돼 있지만 돌풍이 세면 한 단계 더 춥게 느껴짐
  if (humid && base <= 10) base -= 1; // 습한 추위는 더 춥게 느껴짐

  const band = BANDS.find((b) => base >= b.min);
  const outfit = { ...band, extras: [...band.extras], tips: [], base };

  if (windy) {
    outfit.tips.push(
      base >= 17
        ? '💨 바람이 불어요. 반팔이라도 얇은 바람막이나 셔츠를 하나 챙기세요.'
        : '💨 바람이 불어요. 목을 감싸고 바람을 막아 주는 아우터를 입으세요.'
    );
  }
  if (humid && base >= 20) {
    outfit.tips.push('💦 습해요. 땀이 잘 마르는 린넨·기능성 소재가 쾌적해요.');
  }
  if (humid && base < 10) {
    outfit.tips.push('💦 습한 추위는 더 춥게 느껴져요. 한 겹 더 입으세요.');
  }
  if (dry) {
    outfit.tips.push('🧴 건조해요. 립밤·보습제를 챙기고 니트는 정전기에 주의하세요.');
  }
  if (wet) {
    outfit.tips.push('👖 비가 와요. 빨리 마르는 소재가 좋고, 밑단이 긴 바지와 흰 옷(비침)은 피하세요.');
  }
  if (outfit.sleeve.title.startsWith('반팔') && s.minFeels < s.feels - 4) {
    outfit.tips.push('🌙 저녁에 기온이 꽤 내려가요. 얇은 겉옷을 가방에 넣어 두세요.');
  }
  return outfit;
}
