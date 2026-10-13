import { isSnow, isRain, isDrizzle } from './weather-codes.js';

export const CATEGORY_LABEL = {
  clear: '맑은 날',
  cloudy: '흐린 날',
  drizzle: '이슬비 오는 날',
  rain: '비 오는 날',
  storm: '폭우·태풍 오는 날',
  snow: '눈 오는 날',
  hot: '더운 날',
  cold: '추운 날',
};

// pin=true 곡은 해당 날씨에서 항상 하나는 추천 목록에 들어감
const song = (title, artist, pin = false) => ({ title, artist, pin });
const food = (icon, name) => ({ icon, name });

const MALDALLIJA = song('말달리자', 'C Jamm (Feat. Vasco)', true);
const TRIP = song('TRIP', '릴러말즈', true);
const RAIN_SHOWER = song('Rain Shower (Remix)', 'Just Music', true);

const SONGS = {
  clear: [
    MALDALLIJA,
    TRIP,
    song('좋은 날', '아이유'),
    song('Here Comes the Sun', 'The Beatles'),
    song('Happy', 'Pharrell Williams'),
    song('Sunday Morning', 'Maroon 5'),
    song('Dynamite', 'BTS'),
    song('여행', '볼빨간사춘기'),
    song('새삥', '지코'),
    song('Day Day', '비와이'),
    song('METEOR', '창모'),
    song('Nike Shoes', '빈지노'),
    song('Fly', '에픽하이'),
    song('All I Wanna Do', '박재범'),
    song('Small girl', '이영지'),
    song('Alright', 'Kendrick Lamar'),
    song('Good Morning', 'Kanye West'),
    song('It Was a Good Day', 'Ice Cube'),
    song('Hey Ya!', 'OutKast'),
    song('Still D.R.E.', 'Dr. Dre'),
    song('Juicy', 'The Notorious B.I.G.'),
  ],
  cloudy: [
    song('밤편지', '아이유'),
    song('Yellow', 'Coldplay'),
    song('Fix You', 'Coldplay'),
    song('Skinny Love', 'Bon Iver'),
    song('Someone Like You', 'Adele'),
    song('Mad World', 'Gary Jules'),
    song('양화대교', 'Zion.T'),
    song('Instagram', 'DEAN'),
    song('Aqua Man', '빈지노'),
    song('Beautiful', 'Crush'),
    song('Aruarian Dance', 'Nujabes'),
    song('Redbone', 'Childish Gambino'),
    song('Self Care', 'Mac Miller'),
    song("Day 'n' Nite", 'Kid Cudi'),
    song("Bitch, Don't Kill My Vibe", 'Kendrick Lamar'),
    song('See You Again', 'Tyler, the Creator'),
  ],
  drizzle: [
    RAIN_SHOWER,
    song('Rain', '태연'),
    song('우산 (Feat. 윤하)', '에픽하이'),
    song("Raindrops Keep Fallin' on My Head", 'B.J. Thomas'),
    song('Rainy Days and Mondays', 'Carpenters'),
    song('Umbrella', 'Rihanna'),
    song('비도 오고 그래서', '헤이즈'),
    song('Aqua Man', '빈지노'),
    song('Feather', 'Nujabes'),
    song('Aruarian Dance', 'Nujabes'),
    song('Luv(sic) pt3', 'Nujabes'),
    song('양화대교', 'Zion.T'),
    song('Rainy Dayz', 'Mary J. Blige (Feat. Ja Rule)'),
    song('Beautiful', 'Crush'),
  ],
  rain: [
    RAIN_SHOWER,
    song('비와 당신', '이무진'),
    song('Have You Ever Seen the Rain?', 'Creedence Clearwater Revival'),
    song('November Rain', "Guns N' Roses"),
    song('Purple Rain', 'Prince'),
    song('Set Fire to the Rain', 'Adele'),
    song('비도 오고 그래서', '헤이즈'),
    song('우산 (Feat. 윤하)', '에픽하이'),
    song('Rainy Dayz', 'Mary J. Blige (Feat. Ja Rule)'),
    song('Stan', 'Eminem'),
    song('Mockingbird', 'Eminem'),
    song('양화대교', 'Zion.T'),
    song('Aruarian Dance', 'Nujabes'),
    song('Nights', 'Frank Ocean'),
  ],
  storm: [
    song('Riders on the Storm', 'The Doors'),
    song('Thunderstruck', 'AC/DC'),
    song('Stormy Weather', 'Etta James'),
    song('Thunder', 'Imagine Dragons'),
    song('Weather with You', 'Crowded House'),
    song('Home', 'Phillip Phillips'),
    song('Lose Yourself', 'Eminem'),
    song('Till I Collapse', 'Eminem'),
    song('HUMBLE.', 'Kendrick Lamar'),
    song('DNA.', 'Kendrick Lamar'),
    song('SICKO MODE', 'Travis Scott'),
    song('POWER', 'Kanye West'),
    song('METEOR', '창모'),
    song('Stan', 'Eminem'),
  ],
  snow: [
    song('눈의 꽃', '박효신'),
    song('Let It Snow', 'Dean Martin'),
    song('White Christmas', 'Bing Crosby'),
    song('Snowman', 'Sia'),
    song('Snow (Hey Oh)', 'Red Hot Chili Peppers'),
    song('Winter Bear', '뷔'),
    song('Let It Go', 'Idina Menzel'),
    song('첫눈처럼 너에게 가겠다', '에일리'),
    song('Snow on tha Bluff', 'J. Cole'),
    song('Aruarian Dance', 'Nujabes'),
    song('Beautiful', 'Crush'),
  ],
  hot: [
    MALDALLIJA,
    TRIP,
    song('Summertime', 'DJ Jazzy Jeff & The Fresh Prince'),
    song('Cruel Summer', 'Taylor Swift'),
    song('여름 안에서', '듀스'),
    song('Butter', 'BTS'),
    song('Levitating', 'Dua Lipa'),
    song('Cool for the Summer', 'Demi Lovato'),
    song('Summer Madness', '빈지노'),
    song('Hot Summer', 'f(x)'),
    song('새삥', '지코'),
    song('몸매 (MOMMAE)', '박재범'),
    song('All I Wanna Do', '박재범'),
    song("Drop It Like It's Hot", 'Snoop Dogg (Feat. Pharrell)'),
    song('Hot in Herre', 'Nelly'),
    song('Hotline Bling', 'Drake'),
    song('Hot Girl Summer', 'Megan Thee Stallion'),
  ],
  cold: [
    song('Winter Bear', '뷔'),
    song('첫눈처럼 너에게 가겠다', '에일리'),
    song('Chasing Cars', 'Snow Patrol'),
    song('Let Her Go', 'Passenger'),
    song('Cold Heart', 'Elton John & Dua Lipa'),
    song('눈의 꽃', '박효신'),
    song('Fix You', 'Coldplay'),
    song("Marvins Room", 'Drake'),
    song("Hold On, We're Going Home", 'Drake'),
    song('Runaway', 'Kanye West'),
    song('Nights', 'Frank Ocean'),
    song('Love Yourz', 'J. Cole'),
    song('Instagram', 'DEAN'),
    song('Beautiful', 'Crush'),
  ],
};

const FOODS = {
  clear: [food('🥗', '샐러드'), food('🍜', '냉면'), food('🥪', '샌드위치'), food('🍚', '회덮밥'), food('🍱', '도시락 소풍')],
  cloudy: [food('🍲', '순두부찌개'), food('🍜', '칼국수'), food('🥩', '제육볶음'), food('🍝', '파스타'), food('🍜', '짜장면')],
  drizzle: [food('🥞', '김치전'), food('🍜', '잔치국수'), food('🍲', '수제비'), food('🍜', '칼국수'), food('🍶', '파전과 막걸리')],
  rain: [food('🥞', '해물파전'), food('🍜', '짬뽕'), food('🍲', '수제비'), food('🍲', '부대찌개'), food('🍜', '칼국수')],
  storm: [food('🍜', '배달 라면'), food('🍗', '치킨 배달'), food('🍕', '피자 배달'), food('🌶️', '떡볶이 배달'), food('🍖', '족발 배달')],
  snow: [food('🍢', '어묵탕'), food('🍲', '샤브샤브'), food('🥟', '호빵'), food('🍚', '국밥'), food('🐟', '붕어빵')],
  hot: [food('🍜', '냉면'), food('🥣', '콩국수'), food('🍗', '삼계탕'), food('🍜', '냉모밀'), food('🍧', '빙수')],
  cold: [food('🍲', '순대국'), food('🍲', '설렁탕'), food('🥘', '전골'), food('🍜', '따끈한 라멘'), food('🍵', '어묵과 따뜻한 차')],
};

export function categoryOf(s, advice) {
  if (advice.level === 'home' || advice.level === 'raincoat') return 'storm';
  if (isSnow(s.worstCode)) return 'snow';
  if (advice.level === 'long') return 'rain';
  if (advice.level === 'folding' || advice.level === 'hood') return 'drizzle';
  if (isRain(s.worstCode)) return 'rain';
  if (isDrizzle(s.worstCode)) return 'drizzle';
  if (s.temp >= 28) return 'hot';
  if (s.temp <= 3) return 'cold';
  if (s.worstCode >= 2) return 'cloudy';
  return 'clear';
}

function pick(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export const youtubeUrl = ({ title, artist }) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`.trim())}`;

const SONG_COUNT = 5;

export function recommend(category) {
  const pool = SONGS[category];
  const pinned = pick(pool.filter((s) => s.pin), 1);
  const others = pick(pool.filter((s) => !pinned.includes(s)), SONG_COUNT - pinned.length);
  return { songs: pick([...pinned, ...others], SONG_COUNT), foods: pick(FOODS[category], 3) };
}
