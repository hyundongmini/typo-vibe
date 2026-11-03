// Data for "다시 찍어 주세요": a real morning commute, 길음 (Line 4) to 몽촌토성 (Line 8).
// Line 4 → 2 → 8 transfers are all one operator, so there are only two gates: in and out.
// Every failure is something that really happens at Seoul subway gates.
window.STORY = {
  startClock: 9 * 3600 + 40 * 60,
  deadline: 10 * 3600 + 30 * 60,
  startBalance: 1450,
  chargeAmount: 10000,

  // Seconds added to the clock
  penalty: { fail: 15, stepAside: 60, takeOut: 5, charge: 30 },
  // Failures at one gate before you give up and let the line pass
  maxAwkward: 3,
  // Ride photos kept per run
  maxPhotos: 8,

  // Stops shown in the top bar; gate: index of the gate at that stop (transfers have none)
  route: [
    { name: '길음', gate: 0 },
    { name: '동대문역사문화공원', via: '2호선 환승' },
    { name: '잠실', via: '8호선 환승' },
    { name: '몽촌토성', gate: 1 },
  ],

  // travel: minutes walked/ridden before reaching this gate
  // reader: which gate body holds YOUR reader; scale: reader size; read: seconds the card must stay
  // push: crowd shoves while you hold the card ([minGap, maxGap] seconds, force as share of stage width)
  // sign: station sign like the real ones (number, neighbors)
  gates: [
    {
      station: '길음', line: '4', color: '#00a5de', kind: 'enter', fare: 1400, travel: 3,
      reader: 'right', scale: 1, read: 0.5, push: { gap: [1.6, 2.4], force: 0.015 }, queue: 3, wallet: true,
      sign: { number: '417', prev: ['416', '미아사거리'], next: ['418', '성신여대입구'] },
      intro: '길음역 개찰구. 급하게 나오느라 카드를 지갑째 들고 왔다. 지갑엔 카드가 두 장.',
    },
    {
      station: '몽촌토성', line: '8', color: '#e6186c', kind: 'exit', fare: 200, travel: 41,
      reader: 'left', scale: 0.72, read: 0.75, push: { gap: [0.8, 1.4], force: 0.033 }, queue: 7, kiosk: true,
      sign: { number: '813', sub: '평화의 문', prev: ['812', '강동구청'], next: ['814', '잠실'] },
      intro: '동대문역사문화공원에서 2호선, 잠실에서 8호선으로 갈아타고 몽촌토성 도착. 나갈 때 거리만큼 추가 운임 200원이 붙는데, 잔액이 50원뿐이다. 옆에 정산기가 있다. 이 개찰구는 단말기가 평소와 반대편이고, 출근 피크라 뒤에서 민다.',
    },
  ],

  led: {
    idle: '카드를 대 주세요',
    reading: '· · ·',
    enter: '삑 — 1,400원',
    transfer: '환승입니다',
    transferFare: '환승 · 추가 1,000원',
    exit: '안녕히 가세요',
    exitFare: '하차 · 추가 200원',
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
    neighbor: ['어? 감사합니다!', '(꾸벅) 잘 쓸게요~', '제 문이 열렸네요? 감사해요!'],
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
    takeOut: '지갑 열기',
    walletHint: '교통카드를 위로 끌어 꺼내세요',
    walletWrong: '이건 신용카드다. 도로 넣자.',
    walletCards: { transit: '교통카드', credit: '신용카드' },
    walletTip: '눌러서 열기',
    cardOutTip: '이제 단말기에 찍기',
    kioskTitle: '교통카드 충전·정산기',
    kioskCard: '교통카드',
    kioskBill: n => `${n.toLocaleString('ko-KR')}원`,
    kioskPlaceCard: '교통카드를 올려 주세요',
    kioskShort: (balance, fare) => `잔액 ${balance.toLocaleString('ko-KR')}원\n부족 ${(fare - balance).toLocaleString('ko-KR')}원\n돈을 넣어 주세요`,
    kioskDone: n => `충전 완료\n잔액 ${n.toLocaleString('ko-KR')}원`,
    kioskHintCard: '카드를 화면 아래 패드로 끌어 놓으세요',
    kioskHintBill: '지폐를 투입구로 끌어 넣으세요',
    kioskCardFirst: '먼저 카드부터 올려야 한다',
    charge: '충전기로 가기',
    settle: '정산기로 가기',
    holdingWallet: '손에 든 것: 지갑 (카드 2장)',
    holdingCard: '손에 든 것: 교통카드',
    queue: n => `뒤에 ${n}명`,
    balance: n => `잔액 ${n.toLocaleString('ko-KR')}원`,
    awkward: n => `머쓱 ${n}`,
    awkwardLabel: (total, here, max) => `머쓱 총 ${total}회, 이 개찰구 ${here}/${max}`,
    fare: (kind, fare) => {
      const won = n => `${n.toLocaleString('ko-KR')}원`;
      if (kind === 'exit') return fare ? `하차 · 추가 운임 ${won(fare)}` : '하차';
      return fare ? `운임 ${won(fare)}` : '환승 무료';
    },
    stepAsideTitle: '머쓱',
    nextGate: '다음 개찰구',
    sound: '♪ 소리',
    photoBrand: '머쓱 포토',
    photoTagline: '오늘의 환승 기념 사진',
    photoSticker: '머쓱!',
    savePhoto: '사진 저장',
    photoAlt: info => `머쓱 사진 ${info.number}: ${info.station} ${info.time}, ${info.what}`,
    webcamOn: '📷 내 얼굴로',
    webcamOff: '📷 얼굴 끄기',
    webcamDenied: '카메라 권한이 거부되어 그림 얼굴로 진행합니다. 주소창의 카메라 권한을 허용하면 다시 쓸 수 있습니다.',
    webcamFailed: '카메라를 열 수 없어 그림 얼굴로 진행합니다.',
    faceTrackFailed: '얼굴 인식을 불러오지 못해 화면 가운데를 보여 줍니다.',
    webcamUnsupported: '이 브라우저는 카메라를 지원하지 않아 그림 얼굴로 진행합니다.',
    no3d: '이 브라우저에서는 3D 화면을 열 수 없습니다. 다른 브라우저로 열어 주세요.',
    // The camera faces the player, so the player's left-hand reader shows on the right of the screen
    readerLabel: (side, isMine) => `화면 ${side === 'left' ? '오른쪽' : '왼쪽'} 단말기${isMine ? ' (내 통로)' : ' (옆 통로)'}`,
  },

  intro: {
    title: '다시 찍어 주세요',
    text:
      '오전 9시 40분, 길음역. 10시 반까지 몽촌토성에 있는 회사에 가야 한다.\n' +
      '개찰구는 두 번. 카드를 찍고 지나가자.',
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
