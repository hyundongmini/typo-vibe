// Story data for "구멍 너머 티스베" (Pyramus & Thisbe, Ovid Met. IV)
// Thisbe's looks are rolled per game; text clues reveal them night by night.
window.STORY = {
  maxHearts: 3,
  // Candidates are told apart only by how they knock on the wall.
  // 'o' = knock, '-' = pause; timing shared by the sound and the scene
  knockBeat: 0.16,
  knockRest: 0.3,
  knocks: [
    { pattern: 'o', name: '똑', label: '한 번' },
    { pattern: 'oo', name: '똑똑', label: '두 번' },
    { pattern: 'ooo', name: '똑똑똑', label: '세 번' },
    { pattern: 'o-o', name: '똑·똑', label: '한 번, 쉬고 한 번' },
    { pattern: 'oo-o', name: '똑똑·똑', label: '두 번, 쉬고 한 번' },
    { pattern: 'o-oo', name: '똑·똑똑', label: '한 번, 쉬고 두 번' },
  ],

  // people: candidates at the hole, clues: total clues known by that night,
  // diff: [min, max] clued traits each impostor gets wrong
  nights: [
    { name: '첫째 밤', people: 3, clues: 3, candles: 5, diff: [2, 2], source: '티스베의 첫 편지' },
    { name: '둘째 밤', people: 3, clues: 5, candles: 6, diff: [1, 2], source: '유모가 흘린 말' },
    { name: '셋째 밤', people: 4, clues: 6, candles: 7, diff: [1, 2], source: '시장의 소문' },
    { name: '넷째 밤', people: 4, clues: 7, candles: 8, diff: [1, 1], source: '티스베의 둘째 편지' },
    { name: '다섯째 밤', people: 5, clues: 8, candles: 8, diff: [1, 1], source: '꿈에서 들은 목소리', lion: true },
  ],

  // knock is heard for free; the others cost a candle to peek
  parts: { eye: '눈', mouth: '입', hand: '손', talk: '말', knock: '노크' },

  // Each trait lives on one part; clue text is what Pyramus remembers
  traits: {
    mole: {
      part: 'eye',
      values: {
        one: '눈 밑에 점이 하나 있다. 내가 "별"이라 부르던 점.',
        two: '눈 밑에 점 두 개가 나란히 찍혀 있다.',
        none: '얼굴에 점 하나 없이 깨끗하다.',
      },
    },
    eyeShape: {
      part: 'eye',
      values: {
        round: '놀란 듯 동그랗고 큰 눈.',
        narrow: '가늘고 길게 뻗은 눈.',
      },
    },
    brow: {
      part: 'eye',
      values: {
        thick: '짙고 굵은 눈썹.',
        thin: '실처럼 가는 눈썹.',
      },
    },
    lip: {
      part: 'mouth',
      values: {
        stained: '뽕나무 열매를 달고 살아서 입술이 늘 검붉게 물들어 있다.',
        rouge: '입술에 반들거리는 연지를 바른다.',
        plain: '아무것도 바르지 않은 옅은 입술.',
      },
    },
    smile: {
      part: 'mouth',
      values: {
        up: '입꼬리가 늘 올라가 있다.',
        flat: '좀처럼 웃지 않는다. 입술을 꼭 다문다.',
      },
    },
    ring: {
      part: 'hand',
      values: {
        silverRing: '내가 준 은반지를 약지에 낀다.',
        silverPinky: '내가 준 은반지가 작아서 새끼손가락에 낀다.',
        goldRing: '보석 박힌 금반지를 약지에 낀다.',
        none: '반지는 끼지 않는다. 일할 때 거추장스럽다고.',
      },
    },
    bracelet: {
      part: 'hand',
      values: {
        beads: '손목에 구슬 팔찌를 찬다.',
        none: '손목엔 아무것도 차지 않는다.',
      },
    },
    call: {
      part: 'talk',
      values: {
        name: '나를 꼭 이름으로 부른다. "피라모스."',
        young: '나를 장난스럽게 "이웃집 도련님"이라 부른다.',
        you: '나를 그냥 "너"라고 부른다.',
      },
    },
    // Matched against the pause in each candidate's knock pattern
    rhythm: {
      part: 'knock',
      values: {
        pause: '두드릴 때 꼭 한 박자 쉬었다가 다시 두드린다.',
        steady: '쉬지 않고 한달음에 두드린다.',
      },
    },
    // Thisbe always knows the password; impostors may have overheard it
    password: {
      part: 'talk',
      fixed: 'right',
      values: {
        right: '"시샘 많은 벽아" 하면 "그래도 네 덕에 말을 건넨다"고 답한다.',
        wrong: '',
      },
    },
  },

  talk: {
    call: {
      name: '"피라모스, 거기 있어?"',
      young: '"이웃집 도련님, 거기 있어요?"',
      you: '"야, 너 거기 있어?"',
    },
    ask: '"시샘 많은 벽아." 하고 속삭이자 —',
    password: {
      right: ['"그래도 네 덕에 말을 건넨다."'],
      wrong: ['"벽…? 무슨 소리야?"', '"어, 음… 벽아, 안녕?"', '…(대답이 없다)', '"그런 건 됐고, 얼굴 좀 보여 줘."'],
    },
    lion: '…(그르렁. 축축하고 낮은 숨소리)',
  },

  impostors: ['티스베의 어머니', '하녀', '유모', '이웃집 딸', '사촌 언니', '꽃 파는 처녀', '문지기의 딸'],
  lionName: '암사자',

  ui: {
    markNames: { '': '모름', o: '맞음', x: '다름' },
    accuse: name => `${name} — 이 사람이 티스베다`,
    next: '다음 밤',
    retry: '처음부터',
    start: '벽으로 간다',
    noCandle: '촛불이 다 탔다. 이미 본 것만 다시 볼 수 있다.',
    peek: (who, part) => `> ${who} — ${part}`,
    sound: '소리',
    clueTitle: '기억 — 티스베',
    nightIntro: count => `오늘 밤, 그림자 ${count}이 차례로 벽을 두드렸다.`,
    counts: ['', '하나', '둘', '셋', '넷', '다섯'],
    correct: '■ 알아보았다',
    wrong: '× 어긋났다',
    mismatchLead: '네가 고른 사람은 이 단서와 달랐다.',
    lionMismatch: '네가 고른 것은 사람이 아니었다.',
    thisbeNote: '← 티스베',
    chosenNote: '← 네가 고른 사람',
    clueCount: n => (n ? `단서 ${n}개` : '단서 없음'),
    soundOn: '♪ 소리',
  },

  intro: {
    title: '구멍',
    text:
      '바빌론. 피라모스와 티스베의 집은 벽 하나를 사이에 두고 있다.\n' +
      '두 사람은 벽의 작은 구멍으로만 만난다.\n\n' +
      '그런데 구멍의 비밀이 새어 나갔다. 밤마다 여러 사람이 구멍 앞에 와서 티스베인 척한다.\n\n' +
      '구멍 너머의 사람은 벽을 두드리는 소리로만 구별한다. 노크는 촛불 없이 들린다.\n' +
      '구멍으로는 한 번에 눈, 입, 손 중 하나만 보인다.\n' +
      '처음 보는 곳을 엿볼 때마다 촛불이 하나씩 탄다.\n' +
      '단서는 밤마다 쌓인다. 새 단서뿐 아니라 지난 밤 단서까지 모두 맞는 사람이 진짜 티스베다.',
  },

  reactions: {
    correct: '"…피라모스." 틈 사이로 숨결이 오간다.',
    wrong: who => `"어머, 나를 티스베로 알았어?" ${who}가 웃으며 사라졌다. 벽 너머 어딘가에서 누군가 훌쩍였다.`,
    lion: '속삭이는 순간, 틈으로 뜨거운 숨이 훅 끼쳤다. 발톱이 벽을 긁는다.',
  },

  endings: {
    true: {
      title: '하얀 뽕나무 아래',
      text: '"내일 밤, 니누스의 무덤. 하얀 뽕나무 아래에서."\n\n— 그 뽕나무 열매가 아직 하얗던 시절의 이야기.',
    },
    silent: {
      title: '엇갈린 약속',
      text: '마지막 밤, 너는 엉뚱한 사람에게 약속을 건넸다.\n티스베는 무덤에 오지 않았고, 그래서 아무도 죽지 않았다.\n\n뽕나무 열매는 오래도록 하얬다.',
    },
    sealed: {
      title: '벽',
      text: '소문은 두 집안에 닿았다.\n구멍에는 진흙이 단단히 발렸고, 다시는 그녀의 목소리를 듣지 못했다.',
    },
    score: (n, total) => `${total}번의 밤 중 ${n}번, 너는 그녀를 알아보았다.`,
  },
};
