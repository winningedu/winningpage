// 프리미엄(A 프로그램, /page/premium/admission-consulting/a) 랜딩 섹션 1~10 공통 디자인 토큰.
//
// 출처: docs 스펙(대입컨설팅 프리미엄 A 프로그램) Figma 1920 데스크탑 단일 시안 실측.
// 러프 구현 목표(픽셀 재현 아님) — 모바일 램프는 시안이 없어 재량으로 잡는다.
//
// 왜 services/serviceTokens.ts 의 SECTION_HEADING_CLASS 를 그대로 쓰지 않는가 —
// 그쪽은 4개 서비스 랜딩(심화탐구·자기평가·수행평가·목표관리) 정본으로 헤딩이 좌측
// 정렬・색 #0F172A・최대 2rem 고정이다. 프리미엄 시안은 헤딩이 중앙 정렬・32px
// SemiBold・색 ink-strong(#191d23)으로 위계가 달라, 이걸 SECTION_HEADING_CLASS 에
// 얹으면 4페이지 전 섹션이 조용히 회귀한다. mentor-apply 가 MENTOR_HEADING_LG/MD 를
// 새로 연 선례(serviceTokens.ts 참고)와 동일한 판단으로 별도 상수를 둔다.
//
// 색은 index.css @theme 토큰을 우선 재사용한다(--color-gold: #af9364 = text-gold,
// --color-ink: #525252 = text-ink, --color-ink-strong: #191d23 = text-ink-strong,
// --color-line: #d7d7d7 = border-line). 시안 보더값 #d9d9d9 는 4서비스 랜딩에서 이미
// 폐기 선언된 값(serviceTokens.ts 주석 "#D9D9D9 → #D7D7D7")과 같은 자리라 --color-line
// 으로 대체한다. 베이지 #f7f6f3·natural #808080·다크 카드 #1c1a19 은 index.css @theme 에
// surface-beige / ink-natural / ink-dark 로 등록해 쓴다(프리미엄 외 기존 리터럴은 미변경).

export const PREMIUM_CONTAINER_CLASS =
  "mx-auto w-full max-w-content px-5 sm:px-8";

// 섹션 헤딩 — 32px(2rem) SemiBold lh1.4 tracking -0.02em(=-0.64px/32px) 중앙정렬.
export const PREMIUM_SECTION_HEADING_CLASS =
  "break-keep text-center text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[1.75rem] lg:text-[2rem]";

// 섹션 서브 — 20px(1.25rem) Medium ink(#525252) 중앙정렬.
export const PREMIUM_SECTION_SUB_CLASS =
  "break-keep text-center text-[1rem] font-medium leading-[1.4] text-ink sm:text-[1.125rem] lg:text-[1.25rem]";

// 섹션 세로 패딩 120px(7.5rem) — 모바일 py-16(4rem) → sm py-20(5rem) → lg 7.5rem 램프.
export const PREMIUM_SECTION_PADDING_CLASS = "py-16 sm:py-20 lg:py-[7.5rem]";

// 헤딩 블록 → 본문 gap 100px(6.25rem) — 헤딩 아래에 이 클래스로 감싼 본문을 둔다.
export const PREMIUM_HEADING_GAP_CLASS = "mt-10 sm:mt-14 lg:mt-[6.25rem]";

export const PREMIUM_GOLD_TEXT_CLASS = "text-gold";

// 카드 보더 — 시안 #d9d9d9 대신 --color-line(#d7d7d7) 토큰 사용(위 주석 참고).
export const PREMIUM_CARD_BORDER_CLASS = "border border-line bg-white";
// 카드 그림자 — 시안 실측값. Tailwind 임의 그림자 유틸로 표현 불가한 3-value 라 style 로 둔다.
export const PREMIUM_CARD_SHADOW_STYLE = {
  boxShadow: "0 12px 20px rgba(215,215,215,0.4)",
} as const;

// 섹션 배경 베이지 — --color-surface-beige.
export const PREMIUM_BEIGE_BG_CLASS = "bg-surface-beige";
// 다크 카드/밴드 배경.
const PREMIUM_DARK_BG_CLASS = "bg-ink-dark";
// natural 텍스트 톤(#808080) — --color-ink-natural.
export const PREMIUM_NATURAL_TEXT_CLASS = "text-ink-natural";

// S 페이지 다크 variant 섹션 배경 — #191d23 = --color-ink-strong.
export const PREMIUM_DARK_SECTION_BG_CLASS = "bg-ink-strong";

// 다크 variant 섹션 헤딩/서브 — PREMIUM_SECTION_HEADING_CLASS/PREMIUM_SECTION_SUB_CLASS 와
// 색만 흰색으로 반전(PremiumSectionHeading tone="dark" 가 사용).
export const PREMIUM_SECTION_HEADING_DARK_CLASS =
  "break-keep text-center text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-white sm:text-[1.75rem] lg:text-[2rem]";
export const PREMIUM_SECTION_SUB_DARK_CLASS =
  "break-keep text-center text-[1rem] font-medium leading-[1.4] text-white/80 sm:text-[1.125rem] lg:text-[1.25rem]";

// 대학원입학 프로그램(/page/premium/graduate-school) 전용 브랜드 진초록 — 시안 실측(픽셀
// 샘플) #1b5141. Tailwind 완성 리터럴 클래스 제약과 무관하게 style={{ backgroundColor }}로
// 쓰는 hex 상수라 여기(다른 프리미엄 토큰과 같은 위치)에서 정식 관리한다. 비교표 헤더·
// 2가지 집중 섹션 뱃지·CTA 배너(primaryTone="brand") 3곳이 공유한다.
export const PREMIUM_GRADUATE_GREEN = "#1b5141";
