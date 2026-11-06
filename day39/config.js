// Everything tunable and every line of text for 어느 귀를 막을까.
// Units are metres, kilograms and seconds.
export const CFG = {
  camera: { pos: [0, 1.05, 0], lookAt: [0, 0.86, -0.42], fov: 62 },

  arm: {
    // Shoulders in camera space, a little below and beside your eyes
    shoulder: [0.19, -0.25, 0.02],
    upper: { halfHeight: 0.13, radius: 0.045 },
    fore: { halfHeight: 0.12, radius: 0.038 },
    palm: { half: [0.042, 0.06, 0.014] },
    density: 220,
    angularDamping: 1.6,
    linearDamping: 0.2,
    // The palm's pull toward the pointer: F = k (T - p) - c v, weakly damped so it sways
    k: 240,
    c: 2.6,
    maxForce: 90,
  },

  // Your own ears, in camera space; the palm has to reach one of these
  myEars: { pos: [0.088, -0.01, 0.0], radius: 0.055 },
  myHeadRadius: 0.068,
  // Pointer this close to the screen edge (0..1 from centre) pulls the hand to your own ear
  edge: [0.7, 0.96],

  cat: {
    base: [0, 0.55, -0.44],
    headRadius: 0.085,
    earSensorRadius: 0.05,
  },

  noise: {
    // Seconds of drilling, then seconds of quiet
    burst: [2.5, 7],
    rest: [1, 3.5],
    // Hammer blows per second: the du-du-du
    rate: [13, 17],
  },

  // Covering an ear: what that side hears (low-pass cut-off in Hz, and gain)
  muffle: { open: 18000, covered: 320, coveredGain: 0.45 },

  // Gauges fill per second at full noise; covered ears let this share through
  gauge: {
    catRate: 0.03,
    catRelax: 0.05,
    catCoveredShare: 0.35,
    earRate: 0.018,
    earCoveredShare: 0.2,
  },
};

export const UI = {
  title: '어느 귀를 막을까',
  intro: [
    '옆 라인 엘리베이터 공사가 시작됐다.',
    '무릎 앞엔 고양이. 손은 두 개.',
    '고양이 귀를 막을까, 내 귀를 막을까.',
  ],
  controls: [
    '좌클릭 누르는 동안 왼손, 우클릭 누르는 동안 오른손이 따라옵니다.',
    '둘 다 누르면 두 손이 좌우 대칭으로 움직여요.',
    '화면 가장자리로 끌면 내 귀를 막습니다.',
  ],
  touch: '터치: 화면 왼쪽 손가락은 왼손, 오른쪽 손가락은 오른손',
  headphones: '이어폰이나 헤드폰을 끼면 막은 쪽 귀가 먹먹해지는 게 들려요.',
  loading: '불러오는 중…',
  start: '공사 시작',
  loadError: '3D 엔진을 불러오지 못했어요. 새로고침해 주세요.',
  noWebgl: '이 브라우저에서는 3D를 그릴 수 없어요.',
  gauges: { cat: '고양이 스트레스', ear: '내 귀 데미지' },
  ears: { catL: '고양이 왼귀', catR: '고양이 오른귀', myL: '내 왼귀', myR: '내 오른귀' },
  hint: '좌클릭 · 우클릭을 누르고 있으세요',
  touchHint: '손가락으로 누르고 있으세요',
  word: ['두두두두', '두두두두두두', '두두두'],
  endCat: '고양이가 침대 밑으로 숨었다',
  endEar: '귀가 멍하다',
  endStats: (sec, cat, ear) => [`버틴 시간 ${sec}초`, `고양이 스트레스 ${cat}%`, `내 귀 데미지 ${ear}%`],
  again: '다시',
};
