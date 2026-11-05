// 소음: the elevator works next door, your cat on your lap, and only two hands.
// You hold the cat's ears on screen; your own ears you'd have to cover for real.
window.NOISE = {
  // One working day squeezed into this many seconds
  daySeconds: 80,
  dayHours: [9, 18],
  // Quiet gap between bursts, and how long a burst lasts (seconds)
  rest: [1, 3.5],
  burst: [2.5, 7],

  // Real recordings (trimmed); each burst plays a stretch of one of them
  sounds: [
    { file: 'sound/next1.m4a', kind: 'drill', weight: 2 },
    { file: 'sound/next2.m4a', kind: 'drill', weight: 2 },
    { file: 'sound/next3.m4a', kind: 'drill', weight: 1 },
    { file: 'sound/next4.m4a', kind: 'drill', weight: 1 },
    { file: 'sound/hammerdrill.m4a', kind: 'hammer', weight: 2 },
    { file: 'sound/pick.m4a', kind: 'hammer', weight: 1 },
    { file: 'sound/phammer.m4a', kind: 'hammer', weight: 1 },
  ],

  // The cat, from a real photo (pixel positions in the photo file)
  photo: {
    file: 'cat.jpg',
    crop: { x: 150, y: 0, w: 362, h: 330 },
    // Where a hand cups each ear, and the point the ear folds back around
    ears: [{ x: 218, y: 78, pivot: [252, 112] }, { x: 420, y: 70, pivot: [392, 104] }],
    earRadius: 38,
    // Irises get a flat mustard; the darkest part of each (the pupil) stays black
    eyes: [{ x: 300, y: 150, r: 22, below: 0.5, core: 0.1 }, { x: 387, y: 148, r: 22, below: 0.5, core: 0.1 }],
  },

  // How much one covered ear takes off for the cat (two ears: twice this)
  muffle: 0.42,
  // The cat bolts after this long at its wits' end, and comes back after a while (seconds)
  panicToFlee: 2.5,
  awaySeconds: [5, 8],
  // A hand on a cat's ear in a quiet stretch gets shaken off after this long
  catPatience: [8, 12],

  words: {
    drill: ['두두두두두두', '드르르르르륵', '두두두두두두두두'],
    hammer: ['따다다다다닥', '쿵쿵쿵쿵', '두두두두두'],
    purr: ['그르릉…', '골골골…'],
    flee: '후다닥!',
  },

  lines: {
    catUpset: ['냐아앙!!', '먀아앙!', '냥!!!'],
    shakeOff: ['냥!', '흥.', '(고개를 털었다)'],
    back: ['…냥', '(슬그머니 돌아왔다)'],
  },

  credit: '소리: “Drilling next door” 1–4 (ezwa, 퍼블릭 도메인), Hammer drill · Pneumatic pick · Pneumatic hammer Z300 (Work With Sounds, CC BY 4.0) — Wikimedia Commons',
  creditUrl: 'https://commons.wikimedia.org/wiki/File:Drilling_next_door_1.ogg',

  ui: {
    title: '소음',
    intro: [
      '옆 라인 엘리베이터 교체 공사가 시작됩니다.',
      '무릎 위엔 고양이가 있어요.',
      '고양이 귀는 화면을 누르고 있는 동안만 막힙니다.',
      '당신의 귀는… 당신 손으로 막으세요.',
    ],
    speakerNote: '이어폰 말고 스피커로, 소리를 조금 크게 들어 주세요.',
    start: '공사 시작',
    hold: '고양이 귀를 누르고 있어 주세요',
    keys: '키보드: F · J 를 누르고 있으면 양쪽 귀',
    clock: (h, m) => `${h < 12 ? '오전' : '오후'} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`,
    endTitle: '오늘 공사 끝',
    endSub: '(내일 9시에 또 합니다)',
    stats: {
      covered: pct => `고양이 귀를 막아 준 시간 ${pct}%`,
      fled: n => (n ? `고양이가 도망간 횟수 ${n}번` : '고양이는 끝까지 무릎에 있었어요'),
      you: '그동안 당신의 귀는?',
    },
    again: '내일 또',
    away: '고양이가 침대 밑으로 숨었다',
    notice: ['공 지', '엘리베이터', '교체 공사', '11.3 ~ 11.28'],
    sceneLabel: '무릎 위에서 나를 올려다보는 고양이. 공사 소음이 들린다',
    earLabel: (side, isCovered) => `고양이 ${side} 귀${isCovered ? ', 막는 중' : ''}`,
    sides: ['왼쪽', '오른쪽'],
  },
};
