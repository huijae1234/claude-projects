// Open-Meteo WMO weather code helpers
export const isThunder = (c) => c >= 95 && c <= 99;
export const isSnow = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
export const isRain = (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82);
export const isDrizzle = (c) => c >= 51 && c <= 57;

// 구간 안에서 "가장 나쁜" 코드를 고르기 위한 심각도
export function severity(c) {
  if (isThunder(c)) return 5;
  if (isSnow(c)) return 4;
  if (isRain(c)) return 3;
  if (isDrizzle(c)) return 2;
  if (c === 45 || c === 48) return 1;
  return 0;
}

export function describe(c) {
  if (c === 0) return { label: '맑음', icon: '☀️' };
  if (c === 1 || c === 2) return { label: '대체로 맑음', icon: '🌤️' };
  if (c === 3) return { label: '흐림', icon: '☁️' };
  if (c === 45 || c === 48) return { label: '안개', icon: '🌫️' };
  if (isDrizzle(c)) return { label: '이슬비', icon: '🌦️' };
  if (c === 80 || c === 81 || c === 82) return { label: '소나기', icon: '🌧️' };
  if (isRain(c)) return { label: '비', icon: '🌧️' };
  if (isSnow(c)) return { label: '눈', icon: '🌨️' };
  if (isThunder(c)) return { label: '뇌우', icon: '⛈️' };
  return { label: '알 수 없음', icon: '🌡️' };
}
