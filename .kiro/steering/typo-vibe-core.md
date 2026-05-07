---
inclusion: always
---

# typo-vibe Core Rules

이 프로젝트는 매일 하나의 문장에 맞춰 인터랙티브 타이포그래피 포스터/웹 UI를 만드는 아카이브다.

## 기본 원칙

- 결과물은 일반적인 웹 카드 UI가 아니라, 포스터형 인터랙티브 타이포그래피 실험이어야 한다.
- "예쁘게", "고급스럽게" 같은 추상적 개선 대신 레이아웃, 색상, 타이포, 질감, 모션, 인터랙션 구조를 구체적으로 판단한다.
- 레퍼런스가 있을 경우, 바로 구현하지 말고 먼저 Visual System과 Motion System으로 분해한다.
- 레퍼런스의 구조, 밀도, 질감, 모션 타이밍을 유지하는 것이 우선이다.
- 창의적 변형은 사용자가 요청한 경우에만 한다.
- 어려운 그래픽을 단순 gradient, opacity hover, scale hover로 대체하지 않는다.
- 인터랙션은 Trigger, Target, Reaction, Mapping, Timing, Physics, After-state로 정의한다.

## 구현 원칙

- 한 day는 독립적으로 실행 가능한 페이지여야 한다.
- GitHub Pages에서 동작해야 한다.
- 외부 라이브러리는 필요할 때만 사용한다.
- 구현 후 메인 아카이브 카드도 업데이트한다.
- 시각적 품질을 위해 필요한 경우 CSS, SVG, Canvas 2D, WebGL, Three.js, Matter.js, GSAP 중 적절한 기술을 선택한다.

## 금지

- 레퍼런스를 "영감" 수준으로만 해석하지 말 것.
- 일반적인 SaaS 랜딩 페이지처럼 만들지 말 것.
- 장식 없는 단순 중앙 정렬 텍스트로 축소하지 말 것.
- 인터랙션을 단순 hover scale / opacity / color change로 끝내지 말 것.
- 그래픽 요소 수와 질감 밀도를 임의로 낮추지 말 것.
