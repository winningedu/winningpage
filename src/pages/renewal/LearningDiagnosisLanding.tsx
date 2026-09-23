import type { CSSProperties, MutableRefObject } from "react";
import { Link } from "react-router";
import benefitStrengthTable from "@/assets/renewal/landing/benefit-strength-table.png";
import benefitSummaryCard from "@/assets/renewal/landing/benefit-summary-card.png";
import benefitSupplementGuide from "@/assets/renewal/landing/benefit-supplement-guide.png";
import heroGlow from "@/assets/renewal/landing/hero-glow.svg";
import heroGrain from "@/assets/renewal/landing/hero-grain.png";
import heroReportPage1 from "@/assets/renewal/landing/hero-report-page-1.png";
import heroReportPage2 from "@/assets/renewal/landing/hero-report-page-2.png";
import illustrationStrength from "@/assets/renewal/landing/illustration-strength.png";
import illustrationTrial from "@/assets/renewal/landing/illustration-trial.png";
import illustrationWeakness from "@/assets/renewal/landing/illustration-weakness.png";
import macbookFull from "@/assets/renewal/landing/macbook-full.png";
import ServiceProcessCards from "@/components/services/ServiceProcessCards";
import { useInView } from "@/hooks/useInView";

const CTA_LINK_CLASS =
  "inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] px-8 text-base font-semibold text-white transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-17 sm:text-[1.25rem]";

// STEP 라벨은 데이터에 두지 않는다 — ServiceProcessCards 가 index 로 생성한다.
const STEPS = [
  { title: "문항 입력", desc: "학년, 성적 흐름을 간단히 입력해요" },
  { title: "상세 분석", desc: "지금 겪는 어려움을 선택해요" },
  { title: "결과 확인", desc: "응답을 바탕으로 유형을 분석해요" },
  { title: "서비스 추천", desc: "가장 먼저 필요한 서비스를 추천해요" },
];

// 시안은 카드마다 이미지 규격이 다르다 — 카드1 353×269/top 0(상단 플러시), 카드2·3 353×235/top 34.
// 즉 셋 다 이미지 영역의 "바닥"이 y269에 맞고 카드2·3만 위에 34 여백이 붙는 구조다.
// 원본 픽셀이 정확히 그 비율이다: strength 706×538 = 353:269, weakness/trial 706×470 = 353:235.
// 그래서 wide 미만에서도 이미지 박스를 일괄 aspect-[353/269]로 두고 object-contain+object-bottom
// 으로 바닥을 맞추면, 카드1은 무손실 정합(비율 동일) / 카드2·3은 상단에 boxW×34/353 여백이
// 자동 생성돼 시안 구조가 전 폭에서 그대로 보존된다(과거 aspect-[3/2]는 카드1을 세로 12.5% 잘랐다).
// 아래 imageClass의 고정 높이/마진은 wide(1184px~) 전용이다.
const AUDIENCE = [
  {
    image: illustrationStrength,
    imageClass: "wide:mt-0 wide:h-67.25",
    titleLines: ["내 강점이 뭔지", "아직 정리가 안된 학생"],
    descLines: [
      "목표는 있는데 지금 무엇을 준비해야",
      "할지 감이 안 잡히는 경우",
    ],
  },
  {
    image: illustrationWeakness,
    imageClass: "wide:mt-8.5 wide:h-58.75",
    titleLines: ["어떤 학습부분에서 약한지", "확인하고 싶은 학생"],
    descLines: ["해야 할 건 많은데 우선순위가", "서지 않아 시작이 어려운 경우"],
  },
  {
    image: illustrationTrial,
    imageClass: "wide:mt-8.5 wide:h-58.75",
    titleLines: ["유료 서비스 전에 무료로", "서비스를 경험해보고 싶은 학생"],
    descLines: ["내 위치를 데이터로 확인하고", "맞는 서비스를 찾고 있는 경우"],
  },
];

const BENEFITS = [
  {
    image: benefitSummaryCard,
    label: "상세 진단 요약카드",
    alt: "학습진단 리포트 — 진단 요약카드 미리보기",
  },
  {
    image: benefitStrengthTable,
    label: "강점 정리본",
    alt: "학습진단 리포트 — 강점 정리본 미리보기",
  },
  {
    image: benefitSupplementGuide,
    label: "보완안내",
    alt: "학습진단 리포트 — 보완안내 미리보기",
  },
];

// 플로팅 칩 — 시안 절대좌표(x290~1605, 스팬 1315)가 max-w-content(1164) 밖이라 그대로 쓸 수 없다.
// 맥북 박스(1008×591) 기준 %로 재해석: 좌 1개 / 우 2개라는 시안의 배치 관계와 세로 위치는 그대로 두고,
// 가로 오버행만 Lid(rel x 98~914)에 "밀착"하는 한계까지 압축했다.
//   📊 left -120 (칩 폭 218 → right 98 = Lid 좌단) / 📋·✏️ left 914 = Lid 우단
// 시안 갭 46/13/34px을 포기하는 대신 칩 노출 하한이 1340 → 1248로 내려가 1280 랩톱을 살린다(확정).
// top(201 / -69 / 344)은 시안 그대로.
const MACBOOK_W = 1008;
const MACBOOK_H = 591;
const pctX = (px: number) => `${(px / MACBOOK_W) * 100}%`;
const pctY = (px: number) => `${(px / MACBOOK_H) * 100}%`;

// X/Y/회전을 별개 keyframes·별개 주기로 분리(축 분해)했다 — 셋의 합성 경로는
// 최소공배주기가 사실상 존재하지 않아(리사주 도형) 눈이 패턴을 학습하지 못한다.
// 주기·진폭이 칩마다 전부 다른 것 + 축마다 다른 delay를 준 것은 의도다. 절대 통일하지 마라.
// 통일하면 위상만 다른 하나의 기계로 읽힌다.
const FLOATING_BADGES = [
  {
    emoji: "📊",
    label: "상세 진단 요약 카드",
    style: { left: pctX(-120), top: pctY(201) },
    x: { amplitude: "0.375rem", duration: "4.3s", delay: "0s" },
    y: { amplitude: "1rem", duration: "3.1s", delay: "-1.1s" },
    rot: { amplitude: "1deg", duration: "5.7s", delay: "-2.3s" },
  },
  {
    emoji: "📋",
    label: "보완 안내",
    style: { left: pctX(914), top: pctY(-69) },
    x: { amplitude: "0.3125rem", duration: "5.1s", delay: "-0.4s" },
    y: { amplitude: "0.8125rem", duration: "3.7s", delay: "-1.6s" },
    rot: { amplitude: "1.2deg", duration: "6.3s", delay: "-3.4s" },
  },
  {
    emoji: "✏️",
    label: "나의 강점 정리본",
    style: { left: pctX(914), top: pctY(344) },
    x: { amplitude: "0.375rem", duration: "4.7s", delay: "-0.9s" },
    y: { amplitude: "1.125rem", duration: "4.1s", delay: "-2.2s" },
    rot: { amplitude: "0.8deg", duration: "6.9s", delay: "-4.1s" },
  },
];

// 맥북 통이미지(macbook-full.png) — 2208×1374 @2x = 1104×687 @1x.
// 몸체(1008×591)를 사방 48px(@1x) 여백으로 감싼 형태라 몸체 원점은 이미지 안 (48, 48).
// 칩 좌표계(몸체 1008×591 기준 %)를 유지하려면 박스는 그대로 두고 img만 음수 inset으로 밀어야 한다.
const MACBOOK_IMG_STYLE = {
  left: pctX(-48),
  top: pctY(-48),
  width: pctX(1104),
  height: pctY(687),
};

// 시안 칩 폰트 굵기가 하나만 600, 둘은 500 → 시안 실수로 보고 셋 다 500으로 통일.
const BADGE_BASE_CLASS =
  "inline-flex items-center whitespace-nowrap rounded-[1.875rem] bg-[#F5FAFF] font-medium leading-[1.4] text-primary";

const SECTION_HEADING_CLASS =
  "break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] sm:text-[1.75rem] md:text-[2rem]";

// 히어로 전용 타이포 — SECTION_HEADING_CLASS는 다른 섹션과 공유하므로 별도 정의.
const HERO_EYEBROW_CLASS =
  "text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]";
const HERO_HEADLINE_CLASS =
  "break-keep max-w-4xl text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem] lg:max-w-none lg:whitespace-nowrap";
const HERO_SUBTEXT_CLASS =
  "text-[1.125rem] font-medium leading-[1.6] text-ink sm:text-[1.25rem] md:text-[1.5rem]";

// Figma TILE fill(scalingFactor 0.609 → 134px/8.375rem 타일) + blendMode OVERLAY 재현.
// 글로우 프레임 내부 1겹 + 히어로 프레임 전체 1겹, 총 2겹으로 원본과 동일하게 겹친다.
const HERO_GRAIN_STYLE = { backgroundImage: `url(${heroGrain})` };
const HERO_GRAIN_CLASS =
  "pointer-events-none absolute select-none bg-size-[8.375rem_8.375rem] bg-repeat mix-blend-overlay";

function HeroSection() {
  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다 — SVG 리페인트 비용 절감
  // (GoalManagement.jsx HeroSection과 동일 useInView 훅 구조).
  // useInView(범위 밖 파일)가 튜플이 아닌 배열을 반환해 각 원소가 유니온으로 추론되므로 단언.
  // QA 행 106 — rootMargin 없이는 요소가 뷰포트에 실제로 걸쳐야만 애니메이션이 시작돼
  // "애니메이션이 있는지도 모르겠다"는 피드백으로 이어졌다. 하단 마진을 양수로 넓혀
  // 화면에 닿기 전부터 in-view로 판정, 체감상 더 위(이른 스크롤 지점)에서 시작하게 한다.
  const [glowRef, glowInView] = useInView("0px 0px 200px 0px") as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];

  return (
    <section className="relative overflow-hidden bg-white pb-14 sm:pb-16 md:pb-0 md:pt-9">
      {/* 시안(2716:2804→2873→2882→2891)은 히어로 글로우가 360° 등속 회전하는 프로토타입의
          키프레임 4장이다(Smart Animate 3000ms LINEAR × 4프레임 = 12s 재생). 실제 구현
          주기는 12s가 아닌 30s로 완화했다 — 회전은 전정계 자극 등급이 높은 모션이라
          앰비언트 배경 애니메이션 권장 구간(8~20s)보다도 느리게 잡는다는 목표관리 선례
          (GoalManagement.jsx 349~373행)를 그대로 따른 것이다.
          회전 대상은 `05 - Poseidon's Realm`(1600×1200) 단일 프레임, 자기 중심(800,600)
          피벗, -90도씩 단방향 회전, 내부 자식(Eclipse/Planet/그레인)은 4프레임 전부 transform
          동일(자체 모션 없음) — 프레임 간 유일한 변화는 프레임 전체 회전각뿐이므로
          rotate(0→360deg) 30s linear infinite 하나로 완전히 대체 가능하다.

          시안 노드 3091:4717(독립 Poseidon 프레임 1600×1200) 실측: Eclipse ELLIPSE
          820×820 @ (390,254) 중심(800,664) blur200, Planet ELLIPSE 232×232 @
          (259,658) 중심(375,774) blur80. 블러 포함 실제 점유 범위는 Eclipse
          x190~1410/y54~1274, Planet x179~571/y578~970 — 기존 SVG의 1600×1200
          뷰박스로는 Eclipse 블러 하단이 잘려 회전 중 각도에 따라 크롭 직선이
          드러났다. 그래서 hero-glow.svg의 뷰박스를 "0 -200 1600 1600"(정사각,
          중심 800,600 = Figma 피벗)으로 언클립했고, 그 결과 이미지가 정사각이
          되어 아래 배치도 함께 바뀌었다.

          바깥 div(glowRef) = 위치 전담. Figma Poseidon 프레임(1600×1200)에
          대응하는 박스이며 left-1/2 top-[-1.09%] w-[83.34%] -translate-x-1/2는
          변경하지 않는다 — 현재 위치의 채도 균일도가 0.49로 목표관리가 채택한
          0.43과 동급이라 톤이 이미 일관돼 있다. 다만 이제 내부에 정사각 SVG를
          담아야 하므로 aspect-[4/3]를 직접 명시해 래퍼 높이를 고정한다(과거엔
          img 높이가 자동으로 이 비율을 만들어줬다).

          안쪽 .fd-hero-spin = 회전 전담이자 실제 정사각(1600×1600) SVG 배치.
          위치 래퍼 폭을 w라 하면 aspect-[4/3]인 래퍼의 높이는 0.75w, 안쪽
          정사각(w-full, aspect-square)의 높이는 w다. 세로로 중심 정렬하려면
          위아래 여백이 각각 (0.75w − w)/2 = −0.125w씩 필요하다. CSS의 top
          퍼센트는 containing block 높이(=래퍼 높이 0.75w) 기준이므로
          top% × 0.75w = −0.125w → top% = −0.125/0.75 = −16.6667%. SVG 단위로는
          −0.125w = 정사각 변 1600 기준 −200, 즉 위아래로 정확히 200씩(=1600−1200
          의 절반) 넘친다 — Figma 언클립 여유분(뷰박스 y −200~1400)과 일치한다.
          이렇게 하면 정사각 SVG 중심이 래퍼 중심과 정확히 일치하고, 그 중심이 곧 SVG
          뷰박스 중심(800,600) = Figma 회전 피벗이므로 transform-origin은 기본값
          50% 50% 그대로 두면 된다(별도 선언 금지 — GoalManagement.jsx 355~357행과
          동일 근거로, 같은 요소에 위치용 translate와 회전용 rotate를 같이 걸면
          rotate가 translate를 덮어써 이미지가 밀려나므로 위치/회전을 별도
          요소로 분리해 둔 구조이기도 하다).

          그레인 2장은 모두 회전 밖(위치 래퍼의 형제)에 둔다. 예전에 그레인 1장을
          회전 래퍼 안에 넣었던 적이 있는데, transform이 걸린 요소는 새 stacking
          context를 만들어 그 안의 mix-blend-mode: overlay가 섹션의 bg-white를
          backdrop으로 잡지 못하고 검정/투명에 합성되어 그레인이 전면 노출되는
          회귀가 있었다. 첫 번째 그레인(Poseidon 프레임 안 Texture, 1600×1200
          @ (0,0))은 위치 래퍼와 동일한 배치 클래스를 그대로 쓰고, 두 번째
          그레인(`01 - Sunset on Venus` 히어로 전체 직속 Texture)은 inset-0을
          유지한다 — 두 장 다 정지 상태이며 회전하는 것은 Eclipse/Planet 블롭뿐이다. */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute left-1/2 top-[-1.09%] aspect-4/3 w-[83.34%] max-w-none -translate-x-1/2 select-none"
      >
        <style>{`
          @keyframes fd-hero-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .fd-hero-spin[data-float='on'] {
              animation: fd-hero-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <div
          className="fd-hero-spin absolute left-0 top-[-16.6667%] aspect-square w-full"
          data-float={glowInView ? "on" : "off"}
        >
          <img
            src={heroGlow}
            alt=""
            aria-hidden="true"
            draggable="false"
            className="block w-full"
          />
        </div>
      </div>
      <div
        aria-hidden="true"
        style={HERO_GRAIN_STYLE}
        className={`${HERO_GRAIN_CLASS} left-1/2 top-[-1.09%] aspect-4/3 w-[83.34%] -translate-x-1/2`}
      />
      <div
        aria-hidden="true"
        style={HERO_GRAIN_STYLE}
        className={`${HERO_GRAIN_CLASS} inset-0`}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <p className={HERO_EYEBROW_CLASS}>학습진단</p>

        <h1 className={`mt-6 ${HERO_HEADLINE_CLASS}`}>
          학생부 업로드 없이 나에게 맞는 학습역량 및 학교생활,{" "}
          <br className="hidden sm:inline" />
          목표대학 합격가능성을 체크할 수 있어요
        </h1>

        <p className={`mt-6 ${HERO_SUBTEXT_CLASS}`}>
          설문조사로 나의 강점과 약점을 찾아드려요
        </p>

        <Link
          to="/app/learning-diagnosis/survey"
          className={`${CTA_LINK_CLASS} mt-6 bg-primary shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] hover:bg-[#01498F] focus-visible:ring-primary`}
        >
          지금 시작하기
        </Link>

        {/* Figma 2181:10898 — 흩뿌림 합성 1장(heroReportPages)을 걷어내고 A4 페이지 2장을
            나란히 평면 배치한다. 시안 실측(1600폭 프레임 기준): 페이지 각 326.5×462,
            간격 36px(2.25rem), 두 장 합계 폭 690px(43.125rem) — 컨테이너 max-w를 그 값으로
            고정한다. 페이지 top=398/히어로 높이 750이라 페이지 하단 110px가 히어로 아래에서
            잘려 나가는데(다음 섹션에 가려지는 게 아니라 히어로 프레임 자체의 클리핑),
            섹션에 이미 overflow-hidden이 있으므로 이 wrapper에는 desktop 전용으로
            max-h(462−110=352px=22rem)+overflow-hidden만 얹어 재현한다. 모바일은 클리핑 없이
            전체 노출(작은 화면에서 페이지 하단이 잘리면 내용을 못 읽는다).
            items-start 가 필수다 — flex 기본 stretch 는 img 높이를 max-h(352px)에 맞춰
            눌러 버려 object-cover 가 페이지 상단(제목·학생 정보)을 잘라냈다(2026-09-07 실측).
            상단 정렬로 img 가 aspect 높이(462px)를 유지하고 wrapper 가 하단만 클리핑한다. */}
        <div className="relative z-10 mx-auto mt-8 flex w-full max-w-172.5 items-start justify-center gap-4 sm:mt-10 md:mt-12.25 lg:gap-9 lg:max-h-88 lg:overflow-hidden">
          <img
            src={heroReportPage1}
            alt="학습진단 리포트 1페이지 미리보기"
            width={980}
            height={1387}
            className="aspect-[326.5/462] min-w-0 flex-1 max-w-[20.40625rem] rounded-[0.25rem] bg-white object-cover object-top"
          />
          <img
            src={heroReportPage2}
            alt="학습진단 리포트 2페이지 미리보기"
            width={980}
            height={1387}
            className="aspect-[326.5/462] min-w-0 flex-1 max-w-[20.40625rem] rounded-[0.25rem] bg-white object-cover object-top"
          />
        </div>
      </div>
    </section>
  );
}

function StepsSection() {
  return (
    <section className="bg-white pt-20 pb-10 md:pt-30 md:pb-0">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`${SECTION_HEADING_CLASS} text-ink-title`}>
          학생부 업로드 없이,
          <br />
          10분이면 완성하는 학습진단
        </h2>

        {/* 이 카드행은 심화탐구 기준 ServiceProcessCards 로 수렴했다. 기존 학습진단 시안
            결정(B7)은 폐기. */}
        {/* Figma 2162:1078 — 카드 배경 그라데이션(#FFFFFF→#D1E8FF, surface-02 토큰)에
            "보더 없음"이 추가됐다. ServiceProcessCards는 cn()(tailwind-merge)을 거치지
            않는 raw 템플릿 문자열이라 base의 `border border-line`과 cardClassName이
            같은 속성(border-width)을 동시에 살아있는 클래스로 남긴다 — Tailwind는 클래스가
            className 문자열 안에서 어디에 있는지가 아니라 자체 유틸리티 생성 순서로 CSS를
            뽑아내므로 뒤에 적었다고 반드시 이긴다는 보장이 없다(tailwind-merge가 존재하는
            이유 그 자체). 그래서 순서 경쟁에 기대지 않고 `!border-0`로 important를 걸어
            결정적으로 보더를 지운다. shadow/rounded-perf-modal(1.25rem, index.css 기준
            시안 radius와 일치)은 base 그대로 두고 그라데이션만 갈아 끼운다. 다른 5개
            사용처(GoalManagement 등)는 cardClassName 미지정이라 기존 bg-white+보더 그대로다. */}
        <ServiceProcessCards
          items={STEPS}
          cardClassName="!border-0 bg-gradient-to-b from-white to-surface-02"
        />
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section className="bg-white pt-20 pb-10 md:pt-62.5 md:pb-0">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`${SECTION_HEADING_CLASS} text-ink-title`}>
          이런 학생에게 학습 진단을 추천해요
        </h2>

        {/* 353×498 카드 3장 + gap 20 = 1099 → 컨테이너 내부 1100 안에 정확히 수용.
            3열은 wide(1184)에서만 성립한다 — lg(1024) 내부 950으로 3열을 짜면 카드 300.67,
            카드 패딩 px-9(72)을 빼면 텍스트 폭 228.67이라 시안이 <br/>로 직접 끊어놓은 최장 행
            ('서비스를 경험해보고 싶은 분' ≈250 / '목표는 있는데 지금 무엇을 준비해야' ≈252)이
            한 줄에 안 들어가 2줄 구조가 3~4줄로 붕괴한다. 그래서 640~1183은 2열을 유지하고,
            3장 중 마지막 1장이 좌측에 고아로 남는 문제만 아래 last: 규칙으로 해소한다. */}
        <div className="mt-10 grid grid-cols-1 justify-center gap-6 sm:grid-cols-2 md:mt-perf-inset wide:grid-cols-[repeat(3,22.0625rem)] wide:gap-5">
          {AUDIENCE.map((item) => (
            <article
              key={item.titleLines.join("")}
              /* 640~1183: 마지막 카드를 2칸 스팬 + 중앙정렬한다. 스팬 영역 폭 W(=행 전체)에 대해
                 calc(50% - 0.75rem) = W/2 − 12 = (W − gap24)/2 이므로 폭이 앞 두 장과 정확히 같다
                 (실측 검산: vw640 컨테이너 566 → 271 = 실측 컬럼 폭 일치).
                 wide(3열)에서는 이 규칙을 되돌린다. `max-wide:` 한 방으로 끝내고 싶지만 이 프로젝트는
                 screens가 px(기본) + rem(wide·desktop) 혼용이라 Tailwind가 max- 계열 변형 생성을
                 거부한다("mixed units" 경고) — 조용히 무효 클래스가 되므로 max- 변형은 쓰면 안 된다.
                 대신 wide: 로 되돌린다(생성 순서상 wide 규칙이 sm 규칙 뒤라 ≥1184에서 이긴다). */
              className="flex flex-col overflow-hidden rounded-[1.875rem] bg-[#FBFAFA] transition hover:-translate-y-1 hover:shadow-[0_1.25rem_2.5rem_rgba(82,82,82,0.14)] sm:last:col-span-2 sm:last:mx-auto sm:last:w-[calc(50%-0.75rem)] wide:h-124.5 wide:last:col-auto wide:last:mx-0 wide:last:w-auto"
            >
              <img
                src={item.image}
                alt={item.titleLines.join(" ")}
                className={`aspect-353/269 w-full shrink-0 object-contain object-bottom wide:aspect-auto wide:w-88.25 ${item.imageClass}`}
              />
              <div className="flex flex-col gap-3 px-7 py-8 sm:px-9 wide:ml-7.75 wide:mt-11 wide:w-70.75 wide:gap-5 wide:p-0">
                <p className="break-keep text-lg font-semibold leading-[1.3] tracking-[-0.025rem] text-ink sm:text-xl md:text-[1.25rem]">
                  {item.titleLines[0]}
                  <br />
                  {item.titleLines[1]}
                </p>
                <p className="break-keep text-base font-medium leading-[1.3] tracking-[-0.02em] text-[#808080]">
                  {item.descLines[0]}
                  <br />
                  {item.descLines[1]}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className="bg-white pb-10 pt-20 md:pt-60 md:pb-0">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-10 px-5 sm:px-8 md:gap-perf-inset">
        <h2 className={`text-center ${SECTION_HEADING_CLASS} text-ink-header`}>
          학습진단으로 얻을 수 있는 것
        </h2>

        {/* Figma 4971:18377 — 아이콘 → report-page-1~3 세로 캡처(회색 외곽 박스 안 aspect-70/99)
            구조를 걷어내고, 가로 크롭 캡처 3장(benefit-*, 각 960×618 = 320:206)을 시안대로
            바꿔 끼운다. 외곽 회색 박스(bg-[#FBFAFA]/border)는 시안에 없어 제거하고 3열
            grid + 열 사이 세로 구분선만 남긴다. 구분선은 시안이 카드 높이의 약 80%(166/206)
            짧은 선이지만, 별도 h-* 구분선 엘리먼트를 새로 만드는 대신 기존 섹션(위 BENEFITS
            리팩터 이전 버전)과 동일하게 divide-x 풀하이트 선을 그대로 쓴다 — rough 구현
            허용 범위 내 단순화(픽셀 재현보다 구조 우선). 열 간격은 시안 100px(6.25rem)을
            네이티브 grid gap으로 준다 — 구분선이 gap 정중앙에 오진 않지만(divide는 다음
            컬럼의 좌측 경계에 붙는다) 역시 rough 구현으로 허용한다. */}
        <div className="grid w-full max-w-242.5 grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-[6.25rem] sm:divide-x sm:divide-line">
          {BENEFITS.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-3">
              <img
                src={item.image}
                alt={item.alt}
                className="aspect-320/206 w-full max-w-80 rounded-[0.6125rem] object-cover shadow-[0_0.25rem_0.25rem_rgba(0,0,0,0.25)]"
              />
              <p className="text-[1.125rem] font-medium tracking-[-0.02em] text-ink">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 맥북 목업 — 시안(2240:4579) 벡터 조립(Lid/DarkScreen/Screen/각인/shadow/bottom)을 전부 걷어내고
// 그림자까지 구운 통이미지 1장으로 대체했다.
// 칩이 몸체 1008×591 기준 %로 배치돼 있으므로 그 비율의 relative 박스는 유지하고,
// img만 absolute + 음수 inset(-48)으로 밀어 몸체를 박스에 정확히 정렬한다.
function MacbookMockup() {
  // 이 섹션은 페이지 y2750 지점이라 대부분의 시간 화면 밖이다.
  // 뷰포트에 들어와 있는 동안만 애니메이션을 돌린다(이탈 시 정지).
  // useInView(범위 밖 파일)가 튜플이 아닌 배열을 반환해 각 원소가 유니온으로 추론되므로 단언.
  // QA 행 106 — 위 glowRef와 동일 사유로 트리거 지점을 200px 앞당긴다.
  const [chipLayerRef, chipsInView] = useInView("0px 0px 200px 0px") as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];

  return (
    <div className="relative mx-auto aspect-1008/591 w-full max-w-252">
      {/* 부유 모션 — src/index.css를 건드릴 수 없어 컴포넌트 로컬 <style>로 정의한다
          (AdmissionGuidelines.jsx에 동일 관행 존재).
          prefers-reduced-motion: no-preference **opt-in**이라 쿼리 미지원 브라우저에서는 정지가 기본값.

          "움직임이 인위적이다" 피드백 원인은 닫힌 궤도 하나를 linear+alternate로 등속 왕복시킨 것.
          → X/Y/회전을 keyframes 3종으로 완전히 분리(축 분해)하고 칩마다 셋의 주기를 전부 다르게 잡았다.
          세 사인파의 합성 경로는 사실상 반복되지 않아(리사주 도형) 패턴 학습이 안 된다.
          진폭은 --fd-x/--fd-y/--fd-rot로 각 칩 래퍼에 주입해 keyframes 자체는 공유한다. */}
      <style>{`
        @keyframes fd-chip-x {
          from { transform: translateX(calc(var(--fd-x) * -1)); }
          to { transform: translateX(var(--fd-x)); }
        }
        @keyframes fd-chip-y {
          from { transform: translateY(0rem); }
          to { transform: translateY(calc(var(--fd-y) * -1)); }
        }
        @keyframes fd-chip-rot {
          from { transform: rotate(calc(var(--fd-rot) * -1)); }
          to { transform: rotate(var(--fd-rot)); }
        }
        @media (prefers-reduced-motion: no-preference) {
          /* ease-in-out + alternate = 축마다 단순조화운동(사인파). 부력 받는 물체의 가감속에 가깝다.
             linear를 걷어낸 건 등속 왕복이 정확히 대칭이라 눈이 반환점을 즉시 포착하기 때문이다. */
          .fd-chip-x[data-float='on'],
          .fd-chip-y[data-float='on'],
          .fd-chip-rot[data-float='on'] {
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
            animation-direction: alternate;
            will-change: transform;
          }
          .fd-chip-x[data-float='on'] { animation-name: fd-chip-x; }
          .fd-chip-y[data-float='on'] { animation-name: fd-chip-y; }
          .fd-chip-rot[data-float='on'] { animation-name: fd-chip-rot; }
        }
      `}</style>

      {/* 통이미지 2208×1374(@2x) = 1104×687(@1x). 몸체 오프셋 (48,48)만큼 음수 inset. */}
      <img
        src={macbookFull}
        alt=""
        aria-hidden="true"
        draggable="false"
        width={2208}
        height={1374}
        className="pointer-events-none absolute max-w-none select-none"
        style={MACBOOK_IMG_STYLE}
      />

      {/* 플로팅 칩 — 칩이 Lid 밖으로 오버행하므로 컨테이너 폭 여유가 있는 xl(1280+)에서만 띄운다.
          아래 목록 블록이 xl:hidden이라 두 블록의 노출 구간은 xl 경계에서 정확히 상보다. */}
      <div
        ref={chipLayerRef}
        className="pointer-events-none absolute inset-0 hidden xl:block"
        aria-hidden="true"
      >
        {FLOATING_BADGES.map((badge) => {
          const floatState = chipsInView ? "on" : "off";
          return (
            /* 바깥 래퍼 = 위치 전담(left/top 절대배치 + 진폭 CSS 변수 주입).
               변수는 하위로 상속되므로 keyframes 3종은 자식 쪽에서 그대로 var()로 읽는다. */
            <div
              key={badge.label}
              className="absolute"
              style={
                {
                  ...badge.style,
                  // CSS 커스텀 프로퍼티는 CSSProperties 타입에 없어 단언이 필요하다(동작 동일).
                  "--fd-x": badge.x.amplitude,
                  "--fd-y": badge.y.amplitude,
                  "--fd-rot": badge.rot.amplitude,
                } as CSSProperties
              }
            >
              <div
                className="fd-chip-x inline-block"
                data-float={floatState}
                style={{
                  animationDuration: badge.x.duration,
                  animationDelay: badge.x.delay,
                }}
              >
                <div
                  className="fd-chip-y inline-block"
                  data-float={floatState}
                  style={{
                    animationDuration: badge.y.duration,
                    animationDelay: badge.y.delay,
                  }}
                >
                  {/* 회전 요소 = 실제 칩. drop-shadow-sm → box-shadow: 시각 결과는 같고
                      애니메이션 중 필터 래스터화 비용이 사라진다. */}
                  <span
                    className={`fd-chip-rot h-17 px-5 text-[1.25rem] shadow-[0_0.25rem_0.625rem_rgba(11,132,253,0.4)] ${BADGE_BASE_CLASS}`}
                    data-float={floatState}
                    style={{
                      animationDuration: badge.rot.duration,
                      animationDelay: badge.rot.delay,
                    }}
                  >
                    {badge.emoji} {badge.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 섹션 overflow-hidden은 쓰지 않는다 — 스크롤 컨테이너를 만들고 세로 그림자까지 잘라낸다.
// 대신 overflow-x-clip으로 가로 축만 자른다. 맥북 통이미지는 박스 폭의 -4.7619%~+109.5238%로
// 절대배치돼 좌우로 각각 boxW×4.7619%(=구운 그림자 여백 48px @1x)만큼 bleed 하는데,
// 박스가 컨테이너 폭에 붙는 461~639 / 737~1103 구간에서 이 bleed가 컨테이너 좌우 패딩
// (px-5=20 / sm:px-8=32)을 초과해 문서 전체에 가로 스크롤을 만들었다(1080에서 최대 16px).
// 섹션은 뷰포트 폭 블록이므로 클립 경계 = 뷰포트 경계다 → 화면 안에 들어오는 그림자는 그대로
// 보이고, ≥1104에서는 애초에 넘치는 픽셀이 없어 데스크톱 렌더가 바이트 단위로 불변이다.
// overflow-y는 visible로 남으므로 세로 그림자 bleed도 그대로다(clip이어야 하는 이유).
// 칩은 xl(1280+)에서만 뜨고 그 폭에서는 뷰포트 안에 들어온다.
function MacbookShowcase() {
  return (
    <section className="relative overflow-x-clip bg-white pt-16 pb-16 sm:pt-20 sm:pb-20 md:pt-48.5 md:pb-0">
      <div className="relative mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className={`text-center ${SECTION_HEADING_CLASS} text-ink`}>
          지금 내 입시 좌표를 확인 해보세요
        </h2>

        <div className="relative mx-auto mt-16 flex flex-col items-center sm:mt-20 md:mt-17.25">
          <MacbookMockup />

          {/* 칩 목록 — <768 세로 스택 / ≥768 가로 1행 중앙정렬(칩 3개 합 약 590px) / ≥1280 숨김.
              위 데스크톱 칩 레이어가 hidden xl:block + aria-hidden이라 노출 구간이 xl 경계에서 상보다. */}
          <div className="mt-8 flex w-full max-w-104 flex-col gap-3 md:max-w-none md:flex-row md:flex-wrap md:justify-center md:gap-4 xl:hidden">
            {FLOATING_BADGES.map((badge) => (
              <span
                key={badge.label}
                className={`justify-center gap-2 px-5 py-3 text-base shadow-[0_0.25rem_0.625rem_rgba(11,132,253,0.25)] ${BADGE_BASE_CLASS}`}
              >
                {badge.emoji} {badge.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BottomCta() {
  return (
    <section className="bg-[#172437] py-14 md:mt-59 md:pt-35.25 md:pb-35.5">
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-8 px-5 text-center sm:gap-10 sm:px-8 md:gap-perf-inset">
        <h2 className="break-keep text-[1.5rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[1.75rem] md:text-[2.75rem]">
          지금 바로 학습진단을 경험해보세요
        </h2>

        <Link
          to="/app/learning-diagnosis/survey"
          className={`${CTA_LINK_CLASS} bg-primary shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] hover:bg-[#01498F] focus-visible:ring-white`}
        >
          학습진단 시작하기 →
        </Link>
      </div>
    </section>
  );
}

export default function LearningDiagnosisLanding() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />
      <StepsSection />
      <AudienceSection />
      <BenefitsSection />
      <MacbookShowcase />
      <BottomCta />
    </main>
  );
}
