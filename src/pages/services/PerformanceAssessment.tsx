import type { MutableRefObject } from "react";
import { useNavigate } from "react-router";
import heroGrain from "@/assets/renewal/landing/hero-grain.png";
import iconFolder from "@/assets/renewal/landing/icon-folder-v2.png";
import iconLock from "@/assets/renewal/landing/icon-lock-v2.png";
import iconShield from "@/assets/renewal/landing/icon-shield-v2.png";
import audienceQuality from "@/assets/services/performance/audience-quality-v2.jpg";
import audienceResearch from "@/assets/services/performance/audience-research.jpg";
import audienceStructure from "@/assets/services/performance/audience-structure.jpg";
import audienceTopic from "@/assets/services/performance/audience-topic.jpg";
import coachBinoculars from "@/assets/services/performance/coach-binoculars.png";
import coachEmail from "@/assets/services/performance/coach-email.png";
import coachLaptopChair from "@/assets/services/performance/coach-laptop-chair.png";
import coachLaptopSitting from "@/assets/services/performance/coach-laptop-sitting.png";
import coachLaptopWork from "@/assets/services/performance/coach-laptop-work.png";
import coachLightbulb from "@/assets/services/performance/coach-lightbulb.png";
import coachRockingChair from "@/assets/services/performance/coach-rocking-chair.png";
import coachSisyphus from "@/assets/services/performance/coach-sisyphus.png";
import coachSummitHiking from "@/assets/services/performance/coach-summit-hiking.png";
import coachTablet from "@/assets/services/performance/coach-tablet.png";
import coachWriting from "@/assets/services/performance/coach-writing.png";
import heroAura from "@/assets/services/performance/hero-aura.svg";
import heroEvaluationReport from "@/assets/services/performance/hero-evaluation-report.png";
import iconCalendar from "@/assets/services/performance/icon-calendar-v2.png";
import ServiceAudienceCards from "@/components/services/ServiceAudienceCards";
import ServiceFaq from "@/components/services/ServiceFaq";
import ServiceHeroBrowserFrame from "@/components/services/ServiceHeroBrowserFrame";
import ServiceOutcomesPanel from "@/components/services/ServiceOutcomesPanel";
import ServiceProcessCards from "@/components/services/ServiceProcessCards";
import ServiceSection from "@/components/services/ServiceSection";
import ServiceStepCards from "@/components/services/ServiceStepCards";
import ServiceTabsPanel from "@/components/services/ServiceTabsPanel";
import ServiceTestimonials from "@/components/services/ServiceTestimonials";
import { useInView } from "@/hooks/useInView";

// 수행평가 서비스 랜딩 — /services/performance (구 경로 /page/services-ai-performance)
//
// [공통 컴포넌트 전환] 이 페이지의 섹션 마크업은 전부
// src/components/services/ 의 공통 컴포넌트를 통해 렌더된다. 기준(canonical)은
// src/pages/services/InDepthResearch.jsx 이며, 이 페이지는 그 기준으로 수렴시킨 결과다.
// 페이지 파일에는 (1) 히어로(페이지 고유), (2) 데이터 상수, (3) 섹션 조립과 pt 값만 남는다.
// 카드/그리드/타이포 클래스는 페이지에서 오버라이드하지 않는다 — 필요하면 공통 컴포넌트를
// 고쳐서 4페이지에 동시에 반영한다.
//
// ── 이 저장소의 레이아웃 3원칙 (전 서비스 랜딩 공통) ──────────────────────────
// 1. 시안 배율(0.766 등)은 레이아웃 치수(폭・gap・여백)에만 적용하고 폰트에는 적용하지 않는다.
// 2. 배율 1.0으로 그린 박스는 그 안쪽 치수도 1.0 — 한 요소 안에서 배율을 섞지 않는다.
// 3. 카드 안 컨텐츠 폭은 max-width 로 제한하지 않고 카드 패딩으로만 결정한다.
//
// ── 정본 토큰 ────────────────────────────────────────────────────────────────
// 컨테이너 max-w-content(72.75rem/1164px, 안쪽 실폭 1100px) / 네이비 #013262 /
// accent #0B84FD / 보더 #D7D7D7 / 회색 하한 #767676 / 카드 배경 #F9FAFB・#F5F5F7.
// 폐기: #D9D9D9(보더・텍스트), #F5F5F7 섹션 배경 밴드, wide(74rem) 고정폭 그리드.
//
// ── 섹션 간 갭 정책 ──────────────────────────────────────────────────────────
// 기준 페이지가 히어로~마지막까지 bg-white 단일이므로 이 페이지의 #F5F5F7 배경 밴드
// (Audience・StageSummary)를 제거하고 전 구간 흰색으로 수렴시켰다. 배경 경계가 사라졌으니
// "배경이 같으면 시안 갭 ×0.67" 정책이 전 경계에 적용되고, 밴드 경계라 예외적으로 pb 를
// 직접 갖고 있던 두 섹션(Coaching・StageSummary)의 pb 는 제거해 뒤 섹션 pt 로 합친다.
// 하단 여백은 마지막 섹션(이용 방법 안내)만 갖는다.
//
//   Process pt         157px = 9.8125rem   (기존 유지)
//   Coaching pt        149px = 9.3125rem   (기존 유지, pb 181px 제거)
//   Audience pt        202px = 12.625rem   ← (Coaching pb 181 + Audience pt 120) × 0.67
//   StageSummary pt    163px = 10.1875rem  (기존 유지, pb 120px 제거)
//   Outcomes pt        161px = 10.0625rem  ← (StageSummary pb 120 + Outcomes pt 120) × 0.67
//   Testimonials pt    160px = 10rem       (기존 유지)
//   Faq pt             172px = 10.75rem    (기존 유지)
//   이용 방법 안내 pt  147px = 9.1875rem   (기존 유지) / pb 는 모바일 값만
//
// 브레이크포인트는 기준을 따라 md: → lg: 로 통일했다(768~1023px 구간 렌더가 바뀐다).
//

// 수행평가 진입 동선은 목표관리(GoalManagement.jsx)와 동일한 하드 전환 패턴을 따른다
// (2026-08-13 사용자 확정 — 외부 앱은 실운영 서비스가 아니라 고객사 초안 프로토타입으로
// 이관 종결됐고, 이 브랜치의 dev 머지 시점이 곧 인앱 전환 시점이라 병행 플래그가
// 불필요하다). 히어로 CTA는 `/app/performance`로 단순 이동만 하고, 실제 판정(로그인
// 여부・결제 여부)은 전부 RequireEntitlement 가드(App.jsx)가 처리한다 — 여기서
// openPaidServiceOrAlert 같은 판정 로직을 다시 호출하면 이중 판정이 된다(GoalManagement.jsx
// 상단 주석과 동일한 이유). 가드가 이용권 미보유자를 되돌리는 목적지는 목표관리
// (requireGoalAccessMiddleware)와 동일하게 `/pricing`(이용요금 탭)이다 — 이 랜딩으로
// 되돌리지 않는다(QA 지적, performanceAppRoutes.tsx 주석 참고: 되돌렸을 때 배너가
// history.state에 남아 새로고침해도 사라지지 않는 문제가 있었다).
const HERO_SERVICE = { name: "수행평가 서비스", to: "/app/performance" };

// 이용 방법 안내 영상. 새 탭으로 연다.
const GUIDE_VIDEO_URL = "https://www.youtube.com/watch?v=nloYdudqG-o";

// desc는 시안(2393:12092) 원문 그대로 자동 줄바꿈이 아니라 "명시적 개행"이다.
// 배열의 각 원소가 한 줄이며 ServiceProcessCards 가 <br />로 잇는다.
// STEP 라벨은 데이터가 아니라 index 로 생성되므로 step 키를 두지 않는다.
const PROCESS_STEPS = [
  {
    title: "요청 내용 입력",
    desc: ["과목・유형, 주제 범위, 요구사항을", "학생이 직접 입력합니다."],
  },
  {
    // '・' 뒤 공백은 시안(2393:12092) 원문 그대로다.
    title: "주제・ 자료 방향 제안",
    desc: ["학생별 탐구 주제와", "자료 수집 방향을 제안합니다."],
  },
  {
    title: "구성 설계 리포트",
    desc: ["탐구 흐름・목차구성 설계를", "리포트로 제공합니다."],
  },
  {
    title: "결과 점검・피드백",
    desc: ["학생이 작성한 결과물의", "점검 포인트를 확인합니다."],
  },
];

// 탭 4개(주제 추천/자료 방향/구성 설계 리포트/결과 리포트) — 탭·카드 콘텐츠는 시안 별도 노드
// (2159:915 자료방향・2159:998 구성설계・2159:1034 결과리포트)의 텍스트/일러스트를 인용했다.
const COACHING_TABS = [
  "주제 추천",
  "자료 방향",
  "구성 설계 리포트",
  "결과 리포트",
];

const COACHING_CONTENT = {
  "주제 추천": [
    {
      icon: coachBinoculars,
      title: "관심 분야・유형별 주제 제안",
      desc: "과목과 관심사에 맞는 탐구 주제 후보를 제안합니다.",
    },
    {
      icon: coachSisyphus,
      title: "탐구 가치 있는 방향 제시",
      desc: "단순 조사에 그치지 않는 탐구형 주제 방향을 안내합니다.",
    },
    {
      // 360×360 고해상도판(coach-lightbulb-alt)을 coach-lightbulb.png 이름으로 배치해
      // 탭1・탭3 양쪽에서 재사용한다 — 같은 일러스트의 260×260 저해상도판은 배치하지 않았다.
      icon: coachLightbulb,
      title: "차별화 포인트 안내",
      desc: "흔한 주제를 나만의 관점으로 좁히는 포인트를 짚어줍니다.",
    },
  ],
  "자료 방향": [
    {
      icon: coachLaptopChair,
      title: "신뢰할 수 있는 자료 추천",
      desc: "검증된 출처 중심으로 참고 자료 방향을 안내합니다.",
    },
    {
      icon: coachSummitHiking,
      title: "자료 수집 방향 안내",
      desc: "어디서 무엇을 찾을지 수집 전략을 제시합니다.",
    },
    {
      icon: coachTablet,
      title: "자료 분석 방향 제시",
      desc: "수집한 자료를 어떻게 해석할지 분석 관점을 제안합니다.",
    },
  ],
  "구성 설계 리포트": [
    {
      icon: coachWriting,
      title: "논리적 탐구 흐름 설계",
      desc: "선정한 주제에 맞춰 수행의 흐름을 제시합니다.",
    },
    {
      // QA 행 83(2026-09-06) — 러닝머신 일러스트가 시안(2159:999)과 달라 "앉아서 노트북" 일러스트로 교체.
      icon: coachLaptopSitting,
      title: "세부 구성 제안",
      desc: "문단의 구성과 그에 따른 내용의 방향을 제시합니다.",
    },
    {
      icon: coachLightbulb,
      title: "핵심 포인트 정리",
      desc: "담아야 할 핵심 요소를 정리해 방향을 잡아줍니다.",
    },
  ],
  "결과 리포트": [
    {
      icon: coachEmail,
      title: "결과 점검・피드백",
      desc: "학생이 작성한 결과물을 점검하고 피드백합니다.",
    },
    {
      icon: coachRockingChair,
      title: "보완 포인트 안내",
      desc: "부족한 부분과 보완 방향을 구체적으로 안내합니다.",
    },
    {
      icon: coachLaptopWork,
      title: "제출 전 완성도 점검",
      desc: "제출 전 마지막 완성도 체크리스트를 제공합니다.",
    },
  ],
};

const AUDIENCE_CARDS = [
  {
    image: audienceTopic,
    title: "주제 선정이 막막한 학생",
    desc: "관심 주제나 방향 설정부터 어려운 학생",
  },
  {
    image: audienceResearch,
    title: "자료 분석이 어려운 학생",
    desc: "믿을 자료와 분석 방법이 필요한 학생",
  },
  {
    // 시안 원본 텍스트에 제어문자(U+001D)가 혼입돼 있어(스펙 §3) 정정했다.
    image: audienceStructure,
    title: "구성・전개가 어려운 학생",
    desc: "논리적 흐름과 구성을 고민하는 학생",
  },
  {
    image: audienceQuality,
    title: "완성도를 높이고 싶은 학생",
    desc: "마지막 점검과 보완이 더 필요한 학생",
  },
];

// S3 탭 라벨과 정확히 일치하는 4단계 요약 — 스펙 §S5 참고(탭-카드 매핑 공백을 이 섹션이 보완).
const STAGE_SUMMARY_CARDS = [
  {
    title: "주제 추천",
    desc: "관심 분야・유형별 주제 제안, 탐구 가치 있는 방향과 차별화 포인트를 안내합니다.",
  },
  {
    title: "자료 방향",
    desc: "신뢰할 수 있는 자료 추천, 수집・분석 방향을 제시합니다.",
  },
  {
    title: "구성 설계 리포트",
    desc: "논리적 탐구 흐름 설계, 목차・세부 구성과 핵심 포인트를 정리합니다.",
  },
  {
    title: "결과 리포트",
    desc: "최종 내용 점검・피드백, 보완 포인트와 제출 전 완성도를 점검합니다.",
  },
];

// 아이콘-라벨 의미 매칭이 다소 어색하지만(자물쇠=시간절약 등) 시안 그대로 구현했다(스펙 §S6).
const OUTCOME_ITEMS = [
  { icon: iconLock, label: "시간 절약" },
  { icon: iconCalendar, label: "전문적인 방향성" },
  { icon: iconFolder, label: "체계적인 구성" },
  { icon: iconShield, label: "자신감 향상" },
];

const TESTIMONIALS = [
  {
    emoji: "😉",
    quote:
      "주제 선정부터 자료, 구성까지 단계별로 도와주셔서 막막했던 수행평가가 훨씬 수월했어요. 결과물도 더 체계적이고 완성도가 높아졌습니다!",
    name: "고2 김OO",
    tag: "인문계열",
  },
  {
    emoji: "☺️",
    quote:
      "구성 설계 리포트가 정말 큰 도움이 됐어요. 흐름이 정리되니 자료 분석과 정리도 수월했고, 발표까지 자신 있게 했습니다!",
    name: "고3 박OO",
    tag: "자연계열",
  },
  // QA 시트 행 40(2026-09-07 시안 5094-19525 갱신): 후기 4장으로 확장. 문구는 시트 K40
  // 메모 원문, 이름 표기는 기존 2장과 같은 "성OO" 마스킹을 따른다.
  {
    emoji: "🙂",
    quote:
      "과목별로 어떤 자료를 찾아야 할지 몰랐는데, 필요한 자료를 콕 집어 추천해주셔서 시간을 훨씬 아꼈어요. 덕분에 마감 기한 전에 여유 있게 마무리할 수 있었습니다!",
    name: "고1 이OO",
    tag: "인문계열",
  },
  {
    emoji: "😄",
    quote:
      "피드백이 빠르고 구체적이어서 뭘 고쳐야 할지 바로 알 수 있었어요. 수정할 때마다 완성도가 눈에 띄게 좋아져서 발표 평가에서도 좋은 점수를 받았습니다!",
    name: "고3 안OO",
    tag: "자연계열",
  },
];

// 답변 콘텐츠 — 시안 상세(2161:9743, 1920×1002, 전부 펼친 상태) 원문 인용.
// 1번 답변: 2026-09-02 QA(시트 행 85) 확정 문구로 교체 — 과목 나열·"탐구・보고서형 과제" 한정을
// 빼고 "대부분 과목의 수행평가"로 단순화했다(가운뎃점은 페이지 다른 문구와 같은 "・" 사용).
const FAQ_ITEMS = [
  {
    q: "어떤 과목의 수행평가도 도움을 받을 수 있나요?",
    a: "대부분 과목의 수행평가에 대해 주제・자료・구성 방향을 안내합니다.",
  },
  {
    q: "이용 절차와 소요 시간은 어떻게 되나요?",
    a: "요청 내용 입력 → 방향 제안 → 구성 설계 리포트 → 결과 점검 순으로 진행되며, 과제 범위에 따라 소요 시간이 달라집니다.",
  },
  {
    q: "제시된 내용을 그대로 제출해도 되나요?",
    a: "아니요. 위닝 수행평가는 주제・자료・구성 방향을 제안하는 코칭 서비스이며, 실제 탐구와 작성은 학생 본인이 수행하는 것을 원칙으로 합니다. 제안 내용을 그대로 옮겨 제출하는 것은 학교 규정 및 학문적 정직성에 어긋날 수 있어 권장하지 않습니다.",
  },
  {
    q: "개인 정보와 결과물은 안전하게 관리되나요?",
    a: "수집 정보는 개인정보처리방침에 따라 목적 범위 내에서만 이용・보관하며, 학생・학부모 동의 절차를 따릅니다.",
  },
];

// 히어로는 페이지 고유 섹션이라 공통화 대상이 아니다(오라 회전 애니메이션・브라우저 목업의
// 위치값이 4페이지 전부 다름). 이 함수는 이번 공통 컴포넌트 전환에서 손대지 않았다.
function HeroSection() {
  const navigate = useNavigate();

  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다 — SVG 리페인트 비용 절감
  // (서비스 랜딩 4종 + LearningDiagnosisLanding.jsx HeroSection 공통 useInView 훅 구조).
  const [auraRef, auraInView] = useInView() as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];

  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-9">
      {/* 섹션 패딩(md:pb-0 md:pt-[2.25rem])은 목표관리(GoalManagement.jsx)/학습진단
          (LearningDiagnosisLanding.jsx) 히어로와 동일 규격으로 통일했다(사용자 지시 — 1600px
          실측 대조 결과 두 페이지가 이미 공통 규격을 이루고 있어 그 규격을 정본으로 삼는다).
          시안(2393:12079)이 이 값과 어긋나도 코드가 정본이라는 프로젝트 원칙을 따른다. */}
      {/* 시안(2393:12079)의 `Gradient` 그룹 851×869 @ (375,166)이 4프레임(2716:2003→2069→2135→2201)
          에서 0°/−90°/−180°/+90°로 회전하는 프로토타입이다 — 자식(Eclipse/Planet)은 4프레임 전부
          transform 동일(자체 모션 없음), 피벗은 전부 (800,600) = 1600×1200 좌표계의 중심으로 일치한다.
          즉 프레임 간 유일한 변화는 그룹 전체 회전각뿐이므로 rotate(0→360deg) 무한 반복 하나로 완전히
          대체된다. 시안 주기는 4×3000ms=12초지만, 목표관리(GoalManagement.jsx)·학습진단
          (LearningDiagnosisLanding.jsx) 히어로에서 회전은 전정계 자극 등급이 높은 모션이라 앰비언트
          배경 애니메이션 권장 구간(8~20s)보다도 느린 30초를 채택한 선례가 있어, 3개 서비스 랜딩 간
          모션 리듬 일관성을 위해 이 페이지도 동일하게 30s로 통일한다.

          레이어 구조는 LearningDiagnosisLanding.jsx HeroSection(위치/회전 분리)과 동일하게 따른다 —
          같은 요소에 위치용 translate와 회전용 rotate를 같이 걸면 rotate가 translate를 덮어써
          이미지가 밀려나기 때문에 위치 전담 div와 회전 전담 div를 분리한다.

          바깥 div(auraRef) = 위치 전담. w-[100rem](1600px)과 top-0은 시안 내부 프레임(1600×875)
          좌상단에 Gradient 그룹을 담는 1600×1200 텍스처 프레임이 붙는 배치에 대응하며,
          aspect-[4/3]로 그 프레임의 세로(1200px)를 고정한다.

          안쪽 .perf-aura-spin = 회전 전담이자 실제 정사각(1600×1600) SVG 배치. 위치 래퍼 폭을 w라
          하면 aspect-[4/3]인 래퍼의 높이는 0.75w, 안쪽 정사각(w-full, aspect-square)의 높이는 w다.
          세로로 중심 정렬하려면 위아래 여백이 각각 (0.75w − w)/2 = −0.125w씩 필요하다. CSS의 top%는
          containing block 높이(=래퍼 높이 0.75w) 기준이므로 top% × 0.75w = −0.125w
          → top% = −0.125/0.75 = −16.6667%. SVG 단위로는 −0.125w = 정사각 변 1600 기준 −200, 즉
          위아래로 정확히 200씩(=1600−1200의 절반) 넘친다 — hero-aura.svg의 언클립 뷰박스
          (y −200~1400)와 일치한다. 이렇게 하면 정사각 SVG 중심이 래퍼 중심과 정확히 일치하고, 그
          중심이 곧 SVG 뷰박스 중심(800,600) = Figma 회전 피벗이므로 transform-origin은 기본값
          50% 50% 그대로 두면 된다(별도 선언 금지).

          그레인(아래 별도 div)은 회전 밖(위치 래퍼의 형제)에 둔다 — transform이 걸린 요소는 새
          stacking context를 만들어 mix-blend-overlay가 섹션의 bg-white를 backdrop으로 잡지 못하고
          검정/투명에 합성돼 그레인이 전면 노출되는 회귀가 LearningDiagnosisLanding에서 실제로 있었다. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 top-0 aspect-4/3 w-[100rem] max-w-none -translate-x-1/2 select-none"
      >
        <style>{`
          @keyframes perf-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .perf-aura-spin[data-float='on'] {
              animation: perf-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <div
          className="perf-aura-spin absolute left-0 top-[-16.6667%] aspect-square w-full"
          data-float={auraInView ? "on" : "off"}
        >
          <img
            src={heroAura}
            alt=""
            aria-hidden="true"
            draggable="false"
            className="block w-full"
          />
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-size-[8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        {/* eyebrow/h1/서브 문단/CTA 타이포그래피는 목표관리(GoalManagement.jsx) HeroSection
            클래스를 그대로 이식했다(사용자 지시 — 세 히어로 공통 규격 통일). 텍스트 내용만
            수행평가 고유 카피를 유지한다. */}
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          학교 과제부터 보고서까지
        </p>

        {/* max-w는 목표관리의 max-w-[56rem]을 이식하지 않고 생략했다 — 수행평가 헤드라인이
            더 길어 한 줄 유지를 위해 컨테이너(max-w-content) 폭 전체를 그대로 쓴다(스펙 지시:
            "텍스트 내용과 max-w는 수행평가 것을 유지"). */}
        <h1 className="mt-6 break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          주제 선정부터 구성・점검까지, 수행평가를 함께 완성합니다
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-ink sm:text-[1.25rem] md:text-[1.5rem]">
          주제-자료-구성-점검까지, 학생이 스스로 완성하도록 돕는 든든한
          파트너입니다.
        </p>

        <button
          type="button"
          onClick={() => navigate(HERO_SERVICE.to)}
          className="mt-6 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] bg-primary px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:h-17 sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        {/* 브라우저 목업 — 래퍼/프레임 지오메트리(폭 1068px, radius 5px, 3중 그림자, 상단
            마진 + 하단 음수 마진으로 다음 섹션과 겹치는 처리)는 목표관리(GoalManagement.jsx)
            HeroSection 목업 구조를 그대로 이식했다(사용자 지시 — 세 히어로 공통 규격 통일).
            본문은 진행 단계 캡처 4컷(2026-09-02, QA 행 38·81·354)이었다가, 디자이너 갱신 시안
            (4982:18708, 2026-09-04)이 "수행평가 평가 리포트" 캡처 1장으로 되돌려 QA 행
            354·81·38 재지적에 맞춰 다시 1장으로 교체한다. 목표관리 히어로 대시보드 이미지와
            동일하게 md:object-cover md:object-top으로 프레임 폭에 채우고 상단부터 보이게 한다
            (md 미만은 목표관리와 동일하게 고정 비율 없이 w-full 자연 비율을 따른다). */}
        <ServiceHeroBrowserFrame>
          <img
            src={heroEvaluationReport}
            alt="수행평가 평가 리포트 화면 — 학생별 탐구 결과물 점검 포인트와 피드백을 보여준다"
            className="w-full md:min-h-0 md:flex-1 md:object-cover md:object-top"
          />
        </ServiceHeroBrowserFrame>
      </div>
    </section>
  );
}

export default function PerformanceAssessment() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />

      {/* 히어로 목업이 lg:mb-[-7.89375rem]로 이 섹션 위에 겹치므로 pt 가 페이지 내 최소값이다. */}
      <ServiceSection
        className="lg:pt-39.25"
        heading="위닝 수행평가와 함께하는 완성까지의 흐름"
      >
        <ServiceProcessCards items={PROCESS_STEPS} />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-37.25"
        heading="네 가지 영역으로 코칭합니다"
      >
        {/* 탭 전환 시 섹션 높이가 튀는 걸 막는 lg 고정 패널 높이는 콘텐츠 줄 수 실측값이라
            페이지가 넘긴다(자기평가 탭패널과 동일한 방식). */}
        <ServiceTabsPanel
          tabs={COACHING_TABS}
          content={COACHING_CONTENT}
          ariaLabel="수행평가 코칭 영역"
          idPrefix="coaching"
          panelHeightClass="lg:h-68"
        />
      </ServiceSection>

      {/* 학생 사진(JPG) 카드라 imageFit="cover" — 일러스트 PNG 를 쓰는 기준 페이지만 contain 이다. */}
      <ServiceSection
        className="lg:pt-50.5"
        heading={
          <>
            이런 학생에게{" "}
            <span className="text-primary">수행평가를 추천해요</span>
          </>
        }
      >
        <ServiceAudienceCards items={AUDIENCE_CARDS} imageFit="cover" />
      </ServiceSection>

      <ServiceSection className="lg:pt-40.75" heading="네 단계로 차근차근">
        <ServiceStepCards items={STAGE_SUMMARY_CARDS} columns={4} />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-40.25"
        heading="수행평가 서비스로 달라지는 것들"
      >
        <ServiceOutcomesPanel items={OUTCOME_ITEMS} />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-40"
        heading="수행평가 서비스를 받아본 학생들의 후기"
      >
        <ServiceTestimonials items={TESTIMONIALS} columns={2} />
      </ServiceSection>

      <ServiceSection className="lg:pt-43" heading="자주 묻는 질문">
        <ServiceFaq items={FAQ_ITEMS} />
      </ServiceSection>

      <ServiceSection
        containerClassName="text-center"
        className="pb-20 sm:pb-24 lg:pb-28.25 lg:pt-36.75"
        heading="수행평가 이용 방법 안내"
      >
        <a
          href={GUIDE_VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[0.9375rem] bg-primary px-8 text-[0.9375rem] font-semibold text-white transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:mt-12 lg:h-13 lg:w-75 lg:px-0"
        >
          수행평가 영상 보기
          <span className="sr-only"> (새 창)</span>
        </a>
      </ServiceSection>
    </main>
  );
}
