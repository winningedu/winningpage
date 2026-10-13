import type { CSSProperties, MutableRefObject } from "react";
import { useNavigate } from "react-router";
import audienceDirection from "@/assets/services/goal/audience-direction.png";
import audienceExecution from "@/assets/services/goal/audience-execution.png";
import audienceGoal from "@/assets/services/goal/audience-goal.png";
import audienceParent from "@/assets/services/goal/audience-parent.png";
import heroAura from "@/assets/services/goal/hero-aura.png";
import heroDashboard from "@/assets/services/goal/hero-dashboard.png";
import iconBinoculars from "@/assets/services/goal/icon-binoculars.png";
import iconStrength from "@/assets/services/goal/icon-strength.png";
import iconTablet from "@/assets/services/goal/icon-tablet.png";
import iconWarrior from "@/assets/services/goal/icon-warrior.png";
import iconWriting from "@/assets/services/goal/icon-writing.png";
import outcomeCalendar from "@/assets/services/goal/outcome-calendar.png";
import outcomeFolder from "@/assets/services/goal/outcome-folder.png";
import outcomePencil from "@/assets/services/goal/outcome-pencil.png";
import outcomeSettings from "@/assets/services/goal/outcome-settings.png";
import outcomeShield from "@/assets/services/goal/outcome-shield.png";
import phoneReportMockup from "@/assets/services/goal/phone-report-mockup.png";
import stageAlarm from "@/assets/services/goal/stage-alarm.png";
import stageDiagJuggler from "@/assets/services/goal/stage-diag-juggler.png";
import stageDiagMeditation from "@/assets/services/goal/stage-diag-meditation.png";
import stageDiagSmartphone from "@/assets/services/goal/stage-diag-smartphone.png";
import stageDiagTreadmill from "@/assets/services/goal/stage-diag-treadmill.png";
import stageDiagWeightlifting from "@/assets/services/goal/stage-diag-weightlifting.png";
import stageExecHeart from "@/assets/services/goal/stage-exec-heart.png";
import stageExecLaptopWork from "@/assets/services/goal/stage-exec-laptop-work.png";
import stageExecStrength from "@/assets/services/goal/stage-exec-strength.png";
import stageExecWizard from "@/assets/services/goal/stage-exec-wizard.png";
import stageParentAgreeing from "@/assets/services/goal/stage-parent-agreeing.png";
import stageParentApproval from "@/assets/services/goal/stage-parent-approval.png";
import stagePlanAi from "@/assets/services/goal/stage-plan-ai.png";
import stagePlanCoffee from "@/assets/services/goal/stage-plan-coffee.png";
import stagePlanLaptopChair from "@/assets/services/goal/stage-plan-laptop-chair.png";
import stagePlanWriting from "@/assets/services/goal/stage-plan-writing.png";
import ServiceAudienceCards from "@/components/services/ServiceAudienceCards";
import ServiceFaq from "@/components/services/ServiceFaq";
import ServiceHeroBrowserFrame from "@/components/services/ServiceHeroBrowserFrame";
import ServiceOutcomesPanel from "@/components/services/ServiceOutcomesPanel";
import ServiceProcessCards from "@/components/services/ServiceProcessCards";
// 서비스 랜딩 4종 공통 컴포넌트 — 정본은 InDepthResearch.jsx(심화탐구)다.
// 섹션 껍데기·카드 마크업·타이포는 전부 아래 컴포넌트가 소유하고, 이 파일에는
// 데이터 배열과 이 페이지 고유 섹션(Hero / PhoneReport)만 남긴다.
import ServiceSection from "@/components/services/ServiceSection";
import ServiceStepCards from "@/components/services/ServiceStepCards";
import ServiceTabsPanel from "@/components/services/ServiceTabsPanel";
import ServiceTestimonials from "@/components/services/ServiceTestimonials";
import { SECTION_HEADING_CLASS } from "@/components/services/serviceTokens";
import { useInView } from "@/hooks/useInView";

// 목표관리 서비스 랜딩 — /services/goal (구 경로 /page/services-goal)
// Figma 시안(1889:6944, "목표관리" 프레임)에서 출발했으나, 레이아웃 정본은 시안이 아니라
// 심화탐구(InDepthResearch.jsx)다. 섹션 껍데기·카드·탭·FAQ는 전부
// components/services/ 공통 컴포넌트로 수렴했고, 이 파일에는 데이터 배열과 이 페이지
// 고유 섹션(HeroSection / PhoneReportSection)만 남는다.
//
// 목표관리 진입 동선(로그인 → 이용권 → 온보딩 → 대시보드)은 RequireGoalAccess가 소유한다
// (src/components/goal/RequireGoalAccess.jsx). 히어로 CTA는 /app/goal로 단순 이동만 하고,
// 실제 판정(로그인 여부・결제 여부・온보딩 완료 여부)은 전부 그 가드가 처리한다 — 여기서
// openPaidServiceOrAlert 같은 판정 로직을 다시 호출하면 이중 판정이 된다.

const HERO_SERVICE = { name: "목표관리 서비스", to: "/app/goal" };

// 컨테이너 폭 — 시안은 섹션마다 1100/1436/1443/1600px로 제각각이지만(스펙 §4),
// dev 정본 토큰 max-w-content(72.75rem≈1164px, 내부 실콘텐츠 1100px)로 전 섹션을 통일했다
// (ServiceSection 이 소유).
// 수직 스페이싱 — 모바일/sm 은 ServiceSection 이 고정(pt-16 sm:pt-20)하고, 데스크톱만
// 시안(1889:6944) 실측 rem 값을 섹션별로 className 에 리터럴로 넘긴다. 브레이크포인트는
// 기준 페이지에 맞춰 md: → lg: 로 이관했다. 섹션 하단 여백은 다음 섹션의 lg:pt-가
// 담당하며 마지막 섹션(가격)만 pb 를 갖는다.

const PROCESS_STEPS = [
  {
    title: "목표 설정",
    desc: "목표 대학・학과를 정하고 현재 위치와 확률을 확인합니다",
  },
  {
    title: "학습 분석",
    desc: "성적과 활동을 진단해 강점과 약점을 데이터로 분석합니다",
  },
  {
    title: "목표 시간 제안",
    desc: "합격에 필요한 학습 시간을 데이터 기반으로 제안합니다.",
  },
  {
    title: "전략 실행 & 점검",
    desc: "주간 실행을 점검하고 전략을 계속 조정해 나갑니다",
  },
];

const STAGE_TABS = [
  "목표 설정",
  "성적 진단",
  "학습 설계",
  "실행 관리",
  "학부모 안내",
];

// 탭별 카드 콘텐츠 — Figma 시안 3종(2063:11610 성적진단, 2063:11744 학습설계,
// 2063:11878 실행관리)을 반영해 탭마다 실제 카드가 전환되도록 구성했다. '목표 설정' 탭은
// 기존 확정 콘텐츠(구 STAGE_CARDS)를 그대로 이전했다. '학부모 안내' 탭은 QA 1차 68행 이후
// 추가된 시안(4885:20175)의 카드 5장을 그대로 반영했다 — 아이콘 3종(tablet・alarm・heart)은
// 기존 에셋 재사용, approval・agreeing 2종만 신규 export.
//
// 시안(1889:7053, 목표 설정 탭)은 5개 카드 중 2~5번 설명 문구가 전부 "과목과 관심사에 맞는
// 탐구 주제 후보를 제안합니다."로 동일한 placeholder가 남아있다(다른 서비스 카피가 잘못
// 복붙된 것으로 추정 — 스펙 문서에도 결함으로 명시됨). 그대로 옮기면 카드마다 제목과 무관한
// 문장이 반복돼 오히려 사용자에게 결함을 노출하므로, 각 카드 제목에 맞는 설명으로 대체했다
// (구조·순서·아이콘·제목은 시안 그대로).
const STAGE_CONTENT = {
  "목표 설정": [
    {
      icon: iconBinoculars,
      title: "목표 대학・학과 설정",
      desc: "희망 대학과 학과를 정해 목표를 구체화합니다.",
    },
    {
      icon: iconWarrior,
      title: "현재 위치 파악",
      desc: "성적과 활동 데이터로 지금의 위치를 진단합니다.",
    },
    {
      icon: iconTablet,
      title: "목표 확률 분석",
      desc: "목표 대비 합격 확률을 데이터로 분석합니다.",
    },
    {
      icon: iconWriting,
      title: "매일 실행 목표 게시",
      desc: "오늘 해야 할 학습 목표를 매일 안내합니다.",
    },
    {
      icon: iconStrength,
      title: "목표 현황 안내",
      desc: "목표 달성 현황을 한눈에 확인할 수 있게 안내합니다.",
    },
  ],
  "성적 진단": [
    {
      icon: stageDiagJuggler,
      title: "과목별 성적 진단",
      desc: "과목별 성적 흐름과 등급 변화를 추적합니다.",
    },
    {
      icon: stageDiagSmartphone,
      title: "강・약점 분석",
      desc: "어떤 단원・영역이 부족한지 데이터로 짚어냅니다.",
    },
    {
      icon: stageDiagMeditation,
      title: "오답 패턴 파악",
      desc: "반복되는 실수 유형을 찾아 개선 포인트를 제시합니다.",
    },
    {
      icon: stageDiagTreadmill,
      title: "목표 대비 격차",
      desc: "목표 대학 기준과의 격차를 수치로 보여줍니다.",
    },
    {
      icon: stageDiagWeightlifting,
      title: "전형별 유불리",
      desc: "수시・정시 전형별로 유리한 방향을 안내합니다.",
    },
  ],
  "학습 설계": [
    {
      icon: stagePlanLaptopChair,
      title: "맞춤 학습 설계",
      desc: "진단 결과를 바탕으로 개인별 학습 계획을 설계합니다.",
    },
    {
      icon: stagePlanAi,
      title: "주간 플래너",
      desc: "주 단위 학습 분량을 자동으로 배분합니다.",
    },
    {
      icon: stageAlarm,
      title: "목표 학습 시간",
      desc: "합격에 필요한 목표 학습 시간을 제안합니다.",
    },
    {
      icon: stagePlanWriting,
      title: "과제・오답 관리",
      desc: "과제와 오답을 놓치지 않도록 관리합니다.",
    },
    {
      icon: stagePlanCoffee,
      title: "계획 조정",
      desc: "실행 결과에 따라 계획을 유연하게 조정합니다.",
    },
  ],
  "실행 관리": [
    {
      icon: stageExecLaptopWork,
      title: "매일 실행 점검",
      desc: "매일의 목표 실행 여부를 체크하고 기록합니다.",
    },
    {
      icon: stageAlarm,
      title: "일정・시험 알림",
      desc: "시험・제출・마감 일정을 놓치지 않게 알려줍니다.",
    },
    {
      icon: stageExecHeart,
      title: "진도・성취도 기록",
      desc: "과목별 진도와 성취도를 함께 기록합니다.",
    },
    {
      icon: stageExecStrength,
      title: "실행 피드백",
      desc: "실행이 흐트러지면 바로 피드백을 제공합니다.",
    },
    {
      icon: stageExecWizard,
      title: "주간 리포트",
      desc: "한 주의 실행 결과를 리포트로 정리합니다.",
    },
  ],
  "학부모 안내": [
    {
      icon: iconTablet,
      title: "매일 학습 안내",
      desc: "매일 목표 학습 시간과 실행률을 문자로 보냅니다.",
    },
    {
      icon: stageAlarm,
      title: "이탈 알림",
      desc: "목표에서 벗어나면 학부모께 바로 알려드립니다.",
    },
    {
      icon: stageParentApproval,
      title: "주간・월간 리포트",
      desc: "성장 흐름을 리포트로 정리해 전달합니다.",
    },
    {
      icon: stageParentAgreeing,
      title: "상담 연계",
      desc: "필요 시 담당 컨설턴트 상담으로 연결됩니다.",
    },
    {
      icon: stageExecHeart,
      title: "안심 관리",
      desc: "아이의 학습을 데이터로 투명하게 확인합니다.",
    },
  ],
};

const AUDIENCE_CARDS = [
  {
    image: audienceGoal,
    title: "명확한 목표가 필요한 학생",
    desc: "어떤 대학을 목표로 해야 할지, 지금 뭘 해야 할지 막막한 학생",
  },
  {
    image: audienceDirection,
    title: "방향이 막막한 학생",
    desc: "성적은 나오는데 목표까지 어떻게 가야할지 모르겠는 학생",
  },
  {
    image: audienceExecution,
    title: "실행이 어려운 학생",
    desc: "계획은 세우지만 매번 실행과 점검이 흐지부지되는 학생",
  },
  {
    image: audienceParent,
    title: "함께 관리하고 싶은 학부모",
    desc: "아이의 학습 진행을 함께 확인하고 소통하고 싶은 학부모",
  },
];

const MANAGEMENT_CARDS = [
  {
    title: "타이밍",
    desc: "집중 학습에 가장 좋은 타이밍을 데이터로 잡아줍니다.",
  },
  { title: "학습 플래너", desc: "일・주 단위 학습 계획을 자동으로 정리합니다" },
  {
    title: "진도 & 성취도",
    desc: "과목별 학습 진도와 성취도를 함께 확인합니다",
  },
  {
    title: "과제 & 오답 관리",
    desc: "과제와 오답을 관리해 약점을 놓치지 않습니다",
  },
  {
    title: "스케줄 지원",
    desc: "시험・일정・제출 알림을 놓치지 않게 지원합니다",
  },
  { title: "리포트", desc: "주간・월간 리포트로 성장 흐름을 한눈에 봅니다" },
];

const OUTCOME_ITEMS = [
  { icon: outcomePencil, label: "합격 확률 향상" },
  { icon: outcomeCalendar, label: "학습 시간 최적화" },
  { icon: outcomeFolder, label: "학습 습관 형성" },
  { icon: outcomeSettings, label: "성적 향상" },
  { icon: outcomeShield, label: "부모님 안심" },
];

// 폰 목업 주변 플로팅 배지 — 시안 1889:7243 실측 좌표(1920px 프레임 기준)를 폰 박스
// (x=911 y=161, 372×781) 기준 %/rem으로 환산했다. LearningDiagnosisLanding(MacbookMockup)의
// 부유 칩 배치·애니메이션 관행을 그대로 이식한다(스펙 §A5/§B).
//   📊 매주 리포트 자동 발송: x585 y435 351×104 (폰 좌측 중단)
//   📋 이번 주 성과를 한눈에: x703 y713 262×104 (폰 좌하단)
//   ✏️ PDF 리포트 확인:      x1231 y713 240×104 (폰 우하단)
// left = (badge.x − phone.x)/phone.w × 100, top = (badge.y − phone.y)/phone.h × 100
// (기존 % 체계 유지, 근사값과 일치 확인 — 폭이 줄어도 폰 기준 %좌표라 재계산 불필요).
// width는 폰 목업 렌더 폭(max-w-[20rem]=320px)을 1x 기준으로 badge.w/phone.w × 20rem 환산
// (기존 코드의 고정 rem 폭 관행을 유지 — % width는 absolute 중첩 레이어에서 해석이 불안정해 배제).
// QA 시트 행 117(2026-09-07) "말풍선에 비해 폰트가 너무 큼" — 시안 실측 폰 372px 대비
// 말풍선 351/262/240px 비율을 그대로 폰 렌더 폭(20rem)에 적용해 재환산했다
// (351/372×20≈18.875rem, 262/372×20≈14.0625rem, 240/372×20≈12.9375rem).
//
// X/Y/회전을 keyframes 3종으로 분리(축 분해)하고 칩마다 진폭·주기·delay를 모두 다르게 뒀다
// (LearningDiagnosisLanding FLOATING_BADGES 선례 — 세 사인파 합성 경로가 사실상 반복되지 않는
// 리사주 도형 원리로 패턴 학습을 막는다. 절대 통일하지 말 것).
const PHONE_BADGES = [
  {
    emoji: "📊",
    title: "매주 리포트 자동 발송",
    desc: "따로 챙기지 않아도 카카오톡 알림톡으로 도착해요",
    // 시안(1889:7243) 폭 351px → 18.875rem(폰 비율 환산). 높이는 고정값이 아니라
    // p-4(32) + title(0.875rem×1.4≈20) + gap 6 + desc(0.75rem×1.4≈17)로 텍스트에 따라
    // 자연히 맞춰진다(약 75px 내외).
    style: { left: "-87.63%", top: "35.08%", width: "18.875rem" },
    x: { amplitude: "0.375rem", duration: "4.5s", delay: "0s" },
    y: { amplitude: "1rem", duration: "3.3s", delay: "-1.2s" },
    rot: { amplitude: "1deg", duration: "5.9s", delay: "-2.4s" },
  },
  {
    emoji: "📋",
    title: "이번 주 성과를 한눈에",
    desc: "목표 달성률, 학습 시간, 순위률 요약",
    // 시안 폭 262px → 14.0625rem(폰 비율 환산)
    style: { left: "-55.91%", top: "70.68%", width: "14.0625rem" },
    x: { amplitude: "0.3125rem", duration: "5.3s", delay: "-0.5s" },
    y: { amplitude: "0.8125rem", duration: "3.9s", delay: "-1.7s" },
    rot: { amplitude: "1.2deg", duration: "6.5s", delay: "-3.5s" },
  },
  {
    emoji: "✏️",
    title: "PDF 리포트 확인",
    desc: "클릭 한 번으로 전체 내용을 열람",
    // 시안 폭 240px → 12.9375rem(폰 비율 환산)
    style: { left: "86.02%", top: "70.68%", width: "12.9375rem" },
    x: { amplitude: "0.375rem", duration: "4.9s", delay: "-1s" },
    y: { amplitude: "1.125rem", duration: "4.3s", delay: "-2.3s" },
    rot: { amplitude: "0.8deg", duration: "7.1s", delay: "-4.2s" },
  },
];

const TESTIMONIALS = [
  {
    quote:
      "내 목표 대학까지의 확률이 눈에 보이니까, 막연하던 공부가 방향이 생겼어요.",
    name: "고1 김OO",
    tag: "인문계열",
  },
  {
    quote: "매일 뭘 해야 할지 콕 짚어주니, 미루던 습관이 줄었습니다.",
    // QA 시트 행 69(시안 1889:7426 원문, 디자이너 확정) — 고1 → 고2로 수정.
    name: "고2 최OO",
    tag: "자연계열",
  },
  {
    quote: "주간 리포트로 아이 상황을 함께 볼 수 있어 안심이 됩니다.",
    name: "고3 박OO",
    tag: "학부모",
  },
];

// 답변 콘텐츠 — 시안(2281:1297)은 닫힌 상태만 존재해 질문 텍스트만 확정돼 있다.
// 아코디언을 펼쳤을 때 빈 화면이 되는 걸 막기 위해 구 serviceLandingContent.js에 있던
// 동일 질문 4개의 답변을 그대로 재사용했다(신규 작성 아님 — 기존 확정 카피).
const FAQ_ITEMS = [
  {
    q: "합격 확률은 어떻게 계산되나요?",
    a: "누적된 진학 데이터와 학생의 성적・활동 데이터를 비교・분석해 목표 대학・학과와의 상대적 위치를 참고 지표로 제시합니다.",
  },
  {
    q: "목표 학습 시간은 어떻게 제안되나요?",
    a: "목표 대비 현재 격차와 남은 기간을 바탕으로 과목별 필요 학습량을 산출해 주・일 단위 목표 시간으로 제안합니다.",
  },
  {
    q: "학부모에게 어떤 알림이 오나요?",
    a: "매일 목표 학습 시간과 실행률, 목표 이탈 알림, 주간・월간 리포트가 문자로 발송됩니다.",
  },
  {
    q: "개인 정보는 안전하게 관리되나요?",
    a: "수집 정보는 개인정보처리방침에 따라 목적 범위 내에서만 이용・보관하며, 학생 본인 및 학부모 동의 절차를 따릅니다.",
  },
];

// 애니메이션 인뷰 시작점 — 뷰포트 아래 200px 여유에서 미리 발화해 "보이는지 모르게
// 늦게 시작"하는 문제를 막는다(QA 행106, 학습진단 랜딩과 동일 값).
const ANIMATION_IN_VIEW_MARGIN = "0px 0px 200px 0px";

function HeroSection() {
  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다 — 큰 PNG(1600x1200) 리페인트 비용 절감
  // (PhoneReportSection과 동일 훅 구조. 서비스 랜딩 4종 + LearningDiagnosisLanding 공통 useInView).
  const [auraRef, auraInView] = useInView(ANIMATION_IN_VIEW_MARGIN) as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-9">
      {/* 시안(2716:2905→2976→2986→2996)은 히어로 오라가 12초 동안 360° 등속 회전하는
          프로토타입의 키프레임 4장이다(Smart Animate 3000ms LINEAR × 4프레임 = 12s).
          회전 대상은 1600x1200 단일 프레임, 자기 중심(800,600) 피벗, -90도씩 단방향 CW,
          내부 자식은 4프레임 전부 transform 동일(자체 모션 없음) — 즉 프레임 간 유일한
          변화는 프레임 전체의 회전각뿐이라 rotate(0→360deg) 30s linear infinite 하나로
          완전히 대체 가능하다.
          바깥 div = 위치 전담(-translate-x-1/2 포함), 안쪽 img = 회전 전담으로 분리한다 —
          같은 요소에서 animation의 rotate()가 위치용 translate transform을 덮어써 버리면
          이미지가 좌측으로 800px(원본 절반 폭) 밀려나기 때문.
          top을 -10rem(160px)만큼 끌어올리는 이유: 시안 4프레임은 텍스트·목업이 없는
          순수 배경 플레이트라 오라 전체가 노출되지만, 실제 페이지는 목업(데스크톱 1600
          기준 섹션-로컬 y=341부터, 모바일 375 기준 y=411부터)이 오라의 컬러 코어를 덮는다.
          채도맵 적분으로 회전 24각도 전수 측정한 결과, 보이는 영역의 채도 균일도(최악
          각도 ÷ 평균)는 top-0에서 데스크톱 0.02 / 모바일 0.67, -10rem에서 데스크톱
          0.43 / 모바일 0.81, 균일도 최적값인 -26.25rem에서 데스크톱 0.95 / 모바일
          0.95다. -26.25rem이 균일도 자체는 최적이지만 모바일에서 오라가 과하게 진해져,
          -10rem은 그 최적값 대신 모바일 과포화를 피하려고 의도적으로 완화한 절충값이다.
          transform-origin을 바꾸지 않는 이유: 회전 0°일 때는 원점이 어디든 렌더 결과가
          동일하므로, 360° 루프가 반드시 지나는 θ=0° 구간의 밋밋함은 원점 조정으로
          해결되지 않는다(원점만 최적화 시 균일도 0.27에서 천장). 블롭 덩어리를 보이는
          띠 안으로 통째로 올려야 한다.
          -translate-y-* 대신 top을 쓰는 이유: 래퍼가 이미 -translate-x-1/2를 쓰고 있어
          transform 합성이 얽히고, top은 정적 레이아웃 1회 계산이라 애니메이션 경로에
          비용을 더하지 않는다.
          30s 주기: 앰비언트 배경 애니메이션 권장 구간(8~20s)보다 느리게 잡은 값. 회전은
          전정계 자극 등급이 높은 모션이라 의도적으로 느리게 설정. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 -top-40 w-[100rem] max-w-none -translate-x-1/2 select-none opacity-90"
      >
        <style>{`
          @keyframes goal-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .goal-aura-spin[data-float='on'] {
              animation: goal-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <img
          src={heroAura}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="goal-aura-spin block w-full"
          data-float={auraInView ? "on" : "off"}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          목표관리
        </p>

        <h1 className="mt-6 break-keep max-w-4xl text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          목표의 합격 확률을 관리합니다
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-ink sm:text-[1.25rem] md:text-[1.5rem]">
          데이터가 합격을 만들고, 실행이 결과를 만듭니다
        </p>

        <button
          type="button"
          onClick={() => navigate(HERO_SERVICE.to)}
          className="mt-6 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] bg-primary px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:h-17 sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        <ServiceHeroBrowserFrame>
          <img
            src={heroDashboard}
            alt="목표관리 대시보드 화면 — 좌측 메뉴, 오늘의 목표 학습 시간 입력과 진행률, 우측 이상・최소 목표 대학의 수시・정시 합격 확률을 보여준다"
            className="w-full md:min-h-0 md:flex-1 md:object-cover md:object-top"
          />
        </ServiceHeroBrowserFrame>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <ServiceSection
      className="lg:pt-35"
      heading={
        <>
          위닝 목표관리의
          <br />
          <span className="text-primary">4단계 핵심 프로세스</span>
        </>
      }
    >
      {/* STEP 라벨은 데이터가 아니라 index 로 생성된다(ServiceProcessCards).
          시안 카드 폭 280px 를 wide(74rem)에서 276px 로 클램프하던 고정폭 그리드는
          기준 페이지에 wide 분기가 없어 폐기했다. */}
      <ServiceProcessCards items={PROCESS_STEPS} />
    </ServiceSection>
  );
}

function StageSection() {
  return (
    <ServiceSection className="lg:pt-55" heading="단계별로, 목표를 관리합니다">
      {/* 탭 — 시안 3종(2063:11610 성적진단, 2063:11744 학습설계, 2063:11878 실행관리)의
          카드 콘텐츠를 반영해 인터랙티브 탭으로 전환했다. '목표 설정' 탭은 기존 확정 콘텐츠를
          그대로 쓴다. '학부모 안내' 탭은 후속 시안(4885:20175)의 카드 5장을 반영했다. */}
      <ServiceTabsPanel
        tabs={STAGE_TABS}
        content={STAGE_CONTENT}
        columns={5}
        ariaLabel="목표관리 단계"
        idPrefix="stage"
      />
    </ServiceSection>
  );
}

function AudienceSection() {
  return (
    <ServiceSection
      className="lg:pt-71.75"
      heading={
        <>
          이런 학생에게{" "}
          <span className="text-primary">목표관리 서비스를 추천해요</span>
        </>
      }
    >
      {/* 일러스트 PNG 라 imageFit 은 기본값 contain — 레터박스 여백은 카드 배경이 채운다. */}
      <ServiceAudienceCards items={AUDIENCE_CARDS} />
    </ServiceSection>
  );
}

function ManagementSection() {
  return (
    <ServiceSection
      className="lg:pt-55.5"
      heading="목표 달성까지, 이 모든 걸 함께 관리합니다"
    >
      {/* 카드 마크업이 '다섯 단계로 차근차근' 스텝 카드와 100% 동일해 새 컴포넌트를 만들지
          않고 ServiceStepCards 를 3열로 재사용한다(6장 = 3열 2행). */}
      <ServiceStepCards items={MANAGEMENT_CARDS} columns={3} />
    </ServiceSection>
  );
}

function OutcomesSection() {
  return (
    <ServiceSection className="lg:pt-60" heading="목표관리로 달라지는 것들">
      {/* items 5장 → ServiceOutcomesPanel 이 sm:grid-cols-5 를 자동 적용한다. */}
      <ServiceOutcomesPanel items={OUTCOME_ITEMS} />
    </ServiceSection>
  );
}

function PhoneReportSection() {
  // 이 섹션도 스크롤 상당히 아래(lg:pt-[16.125rem])라 뷰포트에 들어와 있는 동안만
  // 애니메이션을 돌린다(LearningDiagnosisLanding MacbookMockup과 동일 훅 구조).
  const [chipLayerRef, chipsInView] = useInView(ANIMATION_IN_VIEW_MARGIN) as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];

  return (
    <section className="overflow-x-clip bg-white pt-16 sm:pt-20 lg:pt-64.5">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="max-w-104 text-center lg:max-w-145.75 lg:text-left">
            <h2 className={SECTION_HEADING_CLASS}>
              아이의 일주일 목표 관리를
              <br />
              확인 할 수 있어요
            </h2>
            <p className="mt-4 break-keep text-[1.25rem] font-medium leading-[1.6] text-ink lg:mt-5.75">
              매주 정리된 리포트가 카카오톡 알림톡으로 도착하고, 달성률부터
              학습시간까지 한눈에 확인할 수 있어요.
            </p>
          </div>

          {/* lg:mr — PDF 리포트 칩(아래 PHONE_BADGES 3번째, left 86.02%·width 15rem)이
              폰(렌더 폭 20rem=320px) 우측 밖으로 86.02%*320+240-320 ≈ 195.26px(12.2rem)
              돌출해 max-w-content 밖으로 넘치는 문제. 시안(1889:7243) 실측 여백 227px은
              372px 폭 폰 기준이라 그대로 쓰면(14.1875rem) 렌더 폭(320px)에는 과도 —
              위 계산값(12.2rem)에 subpixel 버퍼를 더한 12.5rem(200px)으로 수납. */}
          <div className="relative mx-auto w-full max-w-[20rem] shrink-0 lg:mx-0 lg:mr-50 lg:mt-15.25">
            {/* 부유 모션 — src/index.css를 건드릴 수 없어 컴포넌트 로컬 <style>로 정의한다
                (LearningDiagnosisLanding MacbookMockup 선례). prefers-reduced-motion: no-preference
                **opt-in**이라 쿼리 미지원 브라우저에서는 정지가 기본값. */}
            <style>{`
              @keyframes goal-chip-x {
                from { transform: translateX(calc(var(--gc-x) * -1)); }
                to { transform: translateX(var(--gc-x)); }
              }
              @keyframes goal-chip-y {
                from { transform: translateY(0rem); }
                to { transform: translateY(calc(var(--gc-y) * -1)); }
              }
              @keyframes goal-chip-rot {
                from { transform: rotate(calc(var(--gc-rot) * -1)); }
                to { transform: rotate(var(--gc-rot)); }
              }
              @media (prefers-reduced-motion: no-preference) {
                .goal-chip-x[data-float='on'],
                .goal-chip-y[data-float='on'],
                .goal-chip-rot[data-float='on'] {
                  animation-timing-function: ease-in-out;
                  animation-iteration-count: infinite;
                  animation-direction: alternate;
                  will-change: transform;
                }
                .goal-chip-x[data-float='on'] { animation-name: goal-chip-x; }
                .goal-chip-y[data-float='on'] { animation-name: goal-chip-y; }
                .goal-chip-rot[data-float='on'] { animation-name: goal-chip-rot; }
              }
            `}</style>

            <img
              src={phoneReportMockup}
              alt="아이폰 화면 속 카카오톡 알림톡 — 주간 목표관리 리포트 도착 카드, 목표 달성률 84%, 총 학습시간 32시간 10분, 학습 순위 상위 12%"
              className="relative z-0 w-full"
            />

            {/* 플로팅 배지 — lg 미만은 폰 하단에 스택으로(기존 목록 UI 그대로), lg 이상은
                시안(1889:7243) 좌표 기반 절대배치 + 부유 애니메이션 */}
            <div className="mt-6 flex flex-col gap-3 lg:hidden">
              {PHONE_BADGES.map((badge) => (
                <div
                  key={badge.title}
                  className="rounded-2xl bg-white px-5 py-3 text-left shadow-[0_0.5rem_1.5rem_rgba(1,50,98,0.12)]"
                >
                  {/* QA 시트 행 117 — 모바일 스택도 데스크톱과 같은 이유로 제목만 한 단계
                      축소(1rem→0.9375rem). 설명은 이미 목표 크기(0.8125rem)라 유지. */}
                  <p className="text-[0.9375rem] font-semibold leading-[1.4] text-primary">
                    {badge.emoji} {badge.title}
                  </p>
                  <p className="mt-1 break-keep text-[0.8125rem] font-medium leading-normal text-primary/80">
                    {badge.desc}
                  </p>
                </div>
              ))}
            </div>

            <div
              ref={chipLayerRef}
              className="pointer-events-none absolute inset-0 hidden lg:block"
              aria-hidden="true"
            >
              {PHONE_BADGES.map((badge) => {
                const floatState = chipsInView ? "on" : "off";
                return (
                  /* 바깥 래퍼 = 위치 전담(left/top/width 절대배치 + 진폭 CSS 변수 주입).
                     변수는 하위로 상속되므로 keyframes 3종은 자식 쪽에서 그대로 var()로 읽는다. */
                  <div
                    key={badge.title}
                    className="absolute"
                    style={
                      {
                        ...badge.style,
                        "--gc-x": badge.x.amplitude,
                        "--gc-y": badge.y.amplitude,
                        "--gc-rot": badge.rot.amplitude,
                      } as CSSProperties
                    }
                  >
                    <div
                      className="goal-chip-x block w-full"
                      data-float={floatState}
                      style={{
                        animationDuration: badge.x.duration,
                        animationDelay: badge.x.delay,
                      }}
                    >
                      <div
                        className="goal-chip-y block w-full"
                        data-float={floatState}
                        style={{
                          animationDuration: badge.y.duration,
                          animationDelay: badge.y.delay,
                        }}
                      >
                        {/* 회전 요소 = 실제 칩(시안 1889:7243 실측): bg #F1F8FF, radius 40px,
                            padding 20px, shadow accent(#0B84FD) 40% off(0,2) blur20 */}
                        <div
                          className="goal-chip-rot w-full rounded-[2.5rem] bg-[#F1F8FF] p-4 text-left shadow-[0_0.125rem_1.25rem_rgba(11,132,253,0.4)]"
                          data-float={floatState}
                          style={{
                            animationDuration: badge.rot.duration,
                            animationDelay: badge.rot.delay,
                          }}
                        >
                          {/* QA 시트 행 117(2026-09-07) — 폰 목업 대비 여전히 과대해 한 단계
                              더 축소(1rem→0.875rem semibold). desc도 0.75rem으로, 패딩은
                              p-5→p-4, 제목↔설명 gap은 0.375rem(mt-1.5)로 좁혔다(시안 4885 톤). */}
                          <p className="text-[0.875rem] font-semibold leading-[1.4] text-primary">
                            {badge.emoji} {badge.title}
                          </p>
                          {/* 시안 원본 #808080 → 프로젝트 회색 하한선(#767676 이상 —
                              ManagementSection/StageSection 선례)으로 클램프 */}
                          <p className="mt-1.5 break-keep text-[0.75rem] font-normal leading-relaxed text-[#767676]">
                            {badge.desc}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <ServiceSection
      className="lg:pt-53.5"
      heading="목표관리 서비스를 받아본 학생&학부모 후기"
    >
      {/* 이모지는 데이터에 없으므로 ServiceTestimonials 기본값 '😉' 가 그대로 쓰인다.
          tag 는 이름 아래 줄바꿈으로 렌더된다(문구 무변경). */}
      <ServiceTestimonials items={TESTIMONIALS} columns={3} />
    </ServiceSection>
  );
}

function FaqSection() {
  return (
    <ServiceSection
      className="pb-20 sm:pb-24 lg:pb-27.5 lg:pt-60.75"
      heading="자주 묻는 질문"
    >
      <ServiceFaq items={FAQ_ITEMS} />
    </ServiceSection>
  );
}

export default function GoalManagement() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />
      <ProcessSection />
      <StageSection />
      <AudienceSection />
      <ManagementSection />
      <OutcomesSection />
      <PhoneReportSection />
      <TestimonialsSection />
      <FaqSection />
    </main>
  );
}
