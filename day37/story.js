// Fridge CCTV: what each camera watches, how fast things go off, and every on-screen string.
// box: the watched item in the photo, as [x, y, w, h] fractions of the full photo
// decay: brown (browning, wilting) | grey (spoiling meat) | murky (drink clouding) | mold
window.FRIDGE = {
  // Fridge hours per real second. real follows the wall clock, so a reload days later finds it worse
  speeds: [
    { id: 'real', hoursPerSecond: 1 / 3600, label: '×1', hint: '실시간' },
    { id: 'fast', hoursPerSecond: 0.1, label: '×360', hint: '1초 = 6분' },
    { id: 'faster', hoursPerSecond: 1.5, label: '×5400', hint: '1초 = 1.5시간' },
  ],
  defaultSpeed: 'faster',
  // A week of watching, then someone restocks the fridge
  loopHours: 168,
  restockSeconds: 1.6,
  fps: 10,
  // Real seconds between the door opening, and how long it stays open
  doorEvery: [25, 50],
  doorSeconds: 2.4,
  maxLog: 80,
  // Your own photo: the watched spot defaults to the middle of the frame
  userBox: [0.3, 0.28, 0.4, 0.44],
  userShelfDays: [1, 3, 7],
  // Share of shelf life when the camera starts tracking (임박)
  watchFrom: 0.7,

  cams: [
    { file: 'img/cam01.jpg', name: '샐러드 채소', code: 'SALAD', shelfHours: 96, box: [0.51, 0.32, 0.16, 0.22], decay: ['brown', 'mold'], overview: true },
    { file: 'img/cam02.jpg', name: '계란', code: 'EGGS', shelfHours: 504, box: [0.33, 0.25, 0.45, 0.55], decay: ['grey'] },
    { file: 'img/cam03.jpg', name: '슬라이스 치즈', code: 'CHEESE', shelfHours: 336, box: [0.18, 0.33, 0.35, 0.5], decay: ['mold'] },
    { file: 'img/cam04.jpg', name: '생닭', code: 'CHICKEN', shelfHours: 48, box: [0.15, 0.27, 0.4, 0.5], decay: ['grey'], flies: true },
    { file: 'img/cam05.jpg', name: '아보카도', code: 'AVOCADO', shelfHours: 72, box: [0.28, 0.32, 0.22, 0.26], decay: ['brown', 'mold'] },
    { file: 'img/cam06.jpg', name: '먹다 남은 고기', code: 'LEFTOVER', shelfHours: 72, box: [0.14, 0.37, 0.42, 0.55], decay: ['grey', 'mold'], flies: true },
    { file: 'img/cam07.jpg', name: '먹다 남은 음료', code: 'DRINK', shelfHours: 24, box: [0.1, 0.4, 0.27, 0.52], decay: ['murky', 'mold'] },
    { file: 'img/cam08.jpg', name: '레몬 반쪽', code: 'LEMON', shelfHours: 120, box: [0.4, 0.38, 0.18, 0.22], decay: ['brown', 'mold'] },
    { file: 'img/cam09.jpg', name: '과일 칸', code: 'FRUIT', shelfHours: 132, box: [0.15, 0.22, 0.75, 0.68], decay: ['brown', 'mold'], flies: true },
    { file: 'img/cam10.jpg', name: '남은 완두콩', code: 'PEAS', shelfHours: 96, box: [0.37, 0.28, 0.48, 0.55], decay: ['mold'] },
    { file: 'img/cam11.jpg', name: '머스터드', code: 'MUSTARD', shelfHours: 1440, box: [0.45, 0.4, 0.15, 0.55], decay: [] },
    // Nobody remembers what this is, so its date is unknown
    { file: 'img/cam12.jpg', name: '포일에 싼 무언가', code: 'UNKNOWN', shelfHours: 144, box: [0.35, 0.42, 0.15, 0.2], decay: ['mold'], unknown: true },
  ],

  credit: {
    text: '사진: USDA Food Safety and Inspection Service, 퍼블릭 도메인 (Wikimedia Commons)',
    url: 'https://commons.wikimedia.org/w/index.php?search=%22Cut+Waste+in+Refrigerators%22&title=Special:MediaSearch&type=image',
  },

  ui: {
    title: '유통기한 감시 중',
    camera: n => `CAMERA ${n}`,
    rec: '● REC',
    restockTitle: 'RESTOCK',
    loadingTitle: 'LOADING',
    restock: '장 보고 오는 중…',
    loading: '카메라 연결 중…',
    loadFailed: '카메라 연결 실패',
    status: { fresh: '신선', watch: '임박', expired: '기한 지남', rotten: '부패 중', unknown: '정체불명' },
    // Tags on the red tracking box
    tagLeft: (code, d, h) => `${code} D-${d} ${String(h).padStart(2, '0')}H`,
    tagExpired: (code, d, h) => `${code} EXPIRED +${d}D ${String(h).padStart(2, '0')}H`,
    tagUnknown: code => `${code} D-??`,
    overview: (watch, expired) => `WATCH ${watch} / EXPIRED ${expired}`,
    cellLabel: (n, name, status) => `카메라 ${n}, ${name}, ${status}. 눌러서 크게 보기`,
    noTarget: 'NO TARGET',
    doorOpen: 'DOOR OPEN',
    dispose: '버리기 (DISPOSE)',
    disposedStatus: '버림',
    sound: { on: '♪ 소리 켜짐', off: '♪ 소리 꺼짐' },
    speedLabel: '감시 속도',
    logTitle: '감시 로그',
    // Log lines: [time] CAMxx CODE event
    log: {
      watch: '임박 — TRACKING',
      expired: 'EXPIRED',
      rotten: 'ROTTING',
      flies: 'MOTION DETECTED (FLIES)',
      disposed: 'DISPOSED — FEED OFF',
      doorOpen: 'DOOR OPEN',
      doorClose: 'DOOR CLOSED — NOTHING TAKEN',
      restock: 'RESTOCK — ALL FEEDS RESET',
      newCam: 'NEW CAMERA ONLINE',
      speed: label => `SPEED ${label}`,
    },
    mine: {
      add: '📷 내 냉장고 사진 넣기',
      replace: '📷 내 냉장고 사진 바꾸기',
      name: '품목 이름',
      namePlaceholder: '예: 어제 산 두부',
      defaultName: '내 냉장고',
      shelf: '유통기한',
      days: n => `${n}일 뒤`,
      submit: '카메라 달기',
      cancel: '취소',
      code: 'MINE',
      privacy: '사진은 이 브라우저 안에서만 쓰이고 어디에도 올라가지 않습니다. 새로고침하면 사라집니다.',
      failed: '사진을 열 수 없습니다. 다른 사진으로 해 주세요.',
    },
    info: {
      item: '품목',
      stocked: '넣은 날',
      expiry: '유통기한',
      left: '남은 시간',
      status: '상태',
      unknownDate: '알 수 없음',
      leftTime: (d, h) => `${d}일 ${h}시간`,
      overTime: (d, h) => `${d}일 ${h}시간 지남`,
      close: '닫기 (Esc)',
    },
  },
};
