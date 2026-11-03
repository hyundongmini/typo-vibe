// Data for "다시 찍어 주세요": a morning commute through five ticket gates.
// Every failure is something that really happens at Seoul subway gates.
window.STORY = {
  startClock: 8 * 3600 + 40 * 60,
  deadline: 9 * 3600,
  startBalance: 2150,
  chargeAmount: 10000,

  // Seconds added to the clock
  penalty: { fail: 15, stepAside: 60, takeOut: 5, charge: 60 },
  // Failures at one gate before you give up and let the line pass
  maxAwkward: 3,

  // travel: minutes walked/ridden before reaching this gate
  // reader: which gate body holds YOUR reader; scale: reader size; read: seconds the card must stay
  // push: crowd shoves while you hold the card ([minGap, maxGap] seconds, force as share of stage width)
  gates: [
    {
      station: '집 앞 역', line: '2', color: '#00a84d', kind: 'enter', fare: 1400, travel: 1,
      reader: 'right', scale: 1, read: 0.45, push: null, queue: 1,
      intro: '늘 타던 역. 내 통로 단말기를 꾹 누르고 있자. 노란 링이 다 차고 삑 소리가 날 때까지 떼면 안 된다.',
    },
    {
      station: '첫 환승역', line: '9', color: '#bdb092', kind: 'transfer', fare: 0, travel: 4,
      reader: 'right', scale: 1, read: 0.5, push: null, queue: 2, wallet: true,
      intro: '9호선으로 갈아탄다. 아침에 급하게 나오느라 카드를 지갑째 들고 왔다. 지갑엔 카드가 두 장.',
    },
    {
      station: '환승 통로', line: '9', color: '#bdb092', kind: 'transfer', fare: 0, travel: 3,
      reader: 'left', scale: 0.9, read: 0.55, push: { gap: [1.4, 2.2], force: 0.02 }, queue: 4,
      intro: '사람이 몰리기 시작했다. 여기 개찰구는 단말기가 평소와 반대편에 붙어 있다. 단말기 옆 초록 화살표가 내 통로를 가리키는지 보자.',
    },
    {
      station: '신분당선 환승', line: '신', color: '#d4003b', kind: 'transfer', fare: 1000, travel: 4,
      reader: 'right', scale: 0.8, read: 0.6, push: { gap: [1.2, 2], force: 0.025 }, queue: 5, kiosk: true,
      intro: '신분당선은 별도 운임 1,000원이 붙는다. 잔액부터 확인하자. 옆에 충전기가 있다.',
    },
    {
      station: '회사 앞 역', line: '신', color: '#d4003b', kind: 'exit', fare: 0, travel: 4,
      reader: 'right', scale: 0.68, read: 0.8, push: { gap: [0.7, 1.3], force: 0.035 }, queue: 7,
      intro: '출근 피크. 단말기는 낡아서 인식이 느리고, 뒷사람이 바짝 붙었다.',
    },
  ],

  led: {
    idle: '카드를 대 주세요',
    reading: '· · ·',
    enter: '삑 — 1,400원',
    transfer: '환승입니다',
    transferFare: '환승 · 추가 1,000원',
    exit: '안녕히 가세요',
    retry: '다시 찍어 주세요',
    wallet: '카드를 한 장만 대 주세요',
    balance: '잔액이 부족합니다',
    charged: '충전 완료',
    neighbor: '환승입니다',
  },

  // What the people behind you do after each kind of failure
  reactions: {
    retry: ['아…', '(작은 한숨)', '저기요…', '(발을 동동)', '(헛기침)'],
    wallet: ['지갑째는 안 돼요…', '(뒤에서 지갑을 쳐다본다)', '아 그거…'],
    balance: ['아 잔액…', '(뒷사람이 옆 줄로 옮긴다)', '충전기 저기 있어요'],
    neighbor: ['어? 감사합니다!', '(옆 사람이 꾸벅하고 지나갔다)', '제 문이 열렸네요?'],
    push: ['(뒤에서 밀었다)', '(가방에 밀렸다)', '(누가 어깨를 쳤다)'],
    stepAside: '옆으로 비켜섰다. 뒷사람들이 먼저 지나간다.',
    defect: '(맨 뒷사람이 옆 줄로 옮겼다)',
  },

  // Labels for the awkward-moment log on the ending card
  failNames: {
    retry: '다시 찍어 주세요',
    wallet: '카드를 한 장만 대 주세요',
    balance: '잔액이 부족합니다',
    neighbor: '옆 개찰구 문을 열어 줌',
  },

  ui: {
    start: '집을 나선다',
    toGate: '개찰구로',
    retry: '다시 출근하기',
    takeOut: '카드 한 장 꺼내기',
    charge: '충전기로 가기',
    holdingWallet: '손에 든 것: 지갑 (카드 2장)',
    holdingCard: '손에 든 것: 교통카드',
    queue: n => `뒤에 ${n}명`,
    balance: n => `잔액 ${n.toLocaleString('ko-KR')}원`,
    awkward: n => `머쓱 ${n}`,
    awkwardLabel: (total, here, max) => `머쓱 총 ${total}회, 이 개찰구 ${here}/${max}`,
    fare: (kind, fare) => (kind === 'exit' ? '하차' : fare ? `운임 ${fare.toLocaleString('ko-KR')}원` : '환승 무료'),
    hint: '커서가 곧 카드. 단말기 위에서 꾹 누르고, 노란 링이 다 찰 때까지 떼지 말 것. 카메라: 오른쪽 버튼 드래그 또는 ◀ ▶. 키보드: 단말기에서 Space를 꾹.',
    stepAsideTitle: '머쓱',
    nextGate: '다음 개찰구',
    sound: '♪ 소리',
    no3d: '이 브라우저에서는 3D 화면을 열 수 없습니다. 다른 브라우저로 열어 주세요.',
    // The camera faces the player, so the player's left-hand reader shows on the right of the screen
    readerLabel: (side, isMine) => `화면 ${side === 'left' ? '오른쪽' : '왼쪽'} 단말기${isMine ? ' (내 통로)' : ' (옆 통로)'}`,
  },

  intro: {
    title: '다시 찍어 주세요',
    text:
      '오전 8시 40분. 9시까지 회사에 가야 한다.\n' +
      '가는 길에 개찰구가 다섯 번.\n\n' +
      '카드를 단말기에 올리고 "삑" 소리가 날 때까지 떼지 않으면 통과.\n' +
      '너무 빨리 떼거나, 밀려서 미끄러지면 "다시 찍어 주세요".\n' +
      '실패할수록 뒷줄이 길어지고, 머쓱해진다.',
  },

  endings: {
    pro: { title: '프로 환승러', text: '한 번도 머쓱하지 않았다. 뒷사람들은 내가 지나간 줄도 몰랐다.' },
    ok: { title: '무사 출근', text: '조금 머쓱했지만, 늦지는 않았다. 아무도 기억하지 않을 거야. 아마도.' },
    late: { title: '지각', text: '자리에 앉자 팀장님이 시계를 봤다.\n"…개찰구가 좀 말썽이었어요."' },
    summary: (time, n) => `도착 ${time} · 머쓱 ${n}회`,
    logTitle: '머쓱했던 순간',
    clean: '없음',
  },
};
