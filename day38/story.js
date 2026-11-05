// Elevator works next door: two hands, four ears (yours and the cat's).
// Timings, how loud each kind of noise is, and every on-screen string.
window.NOISE = {
  // Quiet gap between bursts, and how long each kind of burst lasts (seconds)
  rest: [1.2, 4],
  kinds: {
    drill: { weight: 0.35, dur: [2, 5], level: 0.85 },
    hammer: { weight: 0.3, dur: [1.5, 4], level: 1, hitEvery: [0.32, 0.6] },
    grind: { weight: 0.2, dur: [1.5, 3.5], level: 1 },
    motor: { weight: 0.15, dur: [2, 4], level: 0.55 },
  },
  // How much a covering hand takes off (0..1) for you and for the cat
  muffle: { me: 0.4, cat: 0.45 },
  // The cat puts up with a hand on its ear for this long before shaking it off (seconds)
  catPatience: [7, 11],
  // Seconds between speech bubbles at most
  bubbleEvery: 3.5,

  words: {
    drill: ['드르르르르륵', '드드드드드드드', '두두두두두두두'],
    hammer: ['쿵!', '쾅!', '깡!', '쿵쿵!'],
    grind: ['끼이이이이익', '찌이이이잉', '삐이이이이이'],
    motor: ['위이이이잉', '우우우우웅'],
    // What the noise turns into once your ears are covered
    muffled: ['웅…', '둥…', '우웅…'],
    purr: ['그르릉…', '골골골…'],
  },

  lines: {
    // Your ears open, the cat's covered: you take it for the cat
    sacrifice: ['너라도 조용히…', '괜찮아 괜찮아…', '나는 괜찮아…'],
    // Your ears covered, the cat's open
    catComplains: ['냐아앙!!', '냥!!!', '먀아앙!'],
    // Everyone's ears open in a loud bit
    nobody: ['으아아아', '아 진짜…', '몇 시까지 해…'],
    // One hand each
    half: ['반반…', '한쪽씩만…'],
    // The cat shook a hand off
    shakeOff: ['냥!', '(털썩)', '흥.'],
  },

  ui: {
    title: '소음',
    hint: '손을 끌어서 귀를 막아 주세요',
    notice: ['공 지', '엘리베이터', '교체 공사', '11.3 ~ 11.28', '소음 양해 바랍니다'],
    ears: {
      myLeft: '내 왼쪽 귀',
      myRight: '내 오른쪽 귀',
      catLeft: '고양이 왼쪽 귀',
      catRight: '고양이 오른쪽 귀',
    },
    earButton: (name, isCovered) => `${name} ${isCovered ? '막는 손 떼기' : '손으로 막기'}`,
    sceneLabel: '엘리베이터 공사 소음 속에서 소파에 앉은 나와 무릎 위 고양이',
  },
};
