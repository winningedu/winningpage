import type { MutableRefObject } from "react";
import { useNavigate } from "react-router";
import heroGrain from "@/assets/renewal/landing/hero-grain.png";
import iconBinoculars from "@/assets/services/goal/icon-binoculars.png";
import stageStructWarrior from "@/assets/services/goal/icon-warrior.png";
import outcomeCalendar from "@/assets/services/goal/outcome-calendar.png";
import outcomeFolder from "@/assets/services/goal/outcome-folder.png";
import outcomeSettings from "@/assets/services/goal/outcome-settings.png";
import stageOrganizeWeight from "@/assets/services/goal/stage-diag-weightlifting.png";
import stageOrganizeLaptop from "@/assets/services/goal/stage-exec-laptop-work.png";
import stageFeedbackStrength from "@/assets/services/goal/stage-exec-strength.png";
import stageStructWriting from "@/assets/services/goal/stage-plan-writing.png";
import stageOrganizeTablet from "@/assets/services/performance/coach-tablet.png";
import iconLightbulb from "@/assets/services/performance/icon-lightbulb-sketch.png";
import iconSisyphus from "@/assets/services/performance/icon-sisyphus.png";
import heroAura from "@/assets/services/self-assessment/hero-aura.svg";
import iconWallet from "@/assets/services/self-assessment/icon-wallet.png";
import stageFeedbackMessage from "@/assets/services/self-assessment/stage-feedback-message.png";
import stageFeedbackShield from "@/assets/services/self-assessment/stage-feedback-shield.png";
import stageStrengthKnot from "@/assets/services/self-assessment/stage-strength-knot.png";
import stageStrengthRain from "@/assets/services/self-assessment/stage-strength-rain.png";
import stageStrengthWinner from "@/assets/services/self-assessment/stage-strength-winner.png";
import stageStructWand from "@/assets/services/self-assessment/stage-struct-wand.png";
import studentCardWriting from "@/assets/services/self-assessment/student-card-01-writing.jpg";
import studentCardOrganizing from "@/assets/services/self-assessment/student-card-02-organizing.jpg";
import studentCardStructuring from "@/assets/services/self-assessment/student-card-03-structuring.jpg";
import studentCardPolishing from "@/assets/services/self-assessment/student-card-04-polishing.jpg";
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

// 자기평가서 서비스 랜딩 — /services/self-assessment (구 경로 /page/services-self-assessment)
// Figma 시안(1907:20783, "자기평가서" 프레임, 1920×6560) + 상태 변형 노드 8개 + 히어로 애니메이션
// 원본(3248:2343) 정합 전면 재작성. 목표관리(GoalManagement.jsx), 수행평가(PerformanceAssessment.jsx)
// 와 같은 방식으로 components/services/ServiceLandingPage 공용 스켈레톤을 벗어나 bespoke로
// 구현했다(구 SERVICE_LANDING_CONTENT.selfAssessment 항목은 serviceLandingContent.js에서 함께
// 제거 — goal/performance 선례와 동일).
// 히어로 CTA 는 /app/selfeval 로 이동한다(handleHeroCta). 게스트와 이용권 미보유 처리는
// 앱 라우트의 RequireEntitlement 가 한다(자기평가서 개발 계획서 §2 32).

// 컨테이너 폭 — 시안은 섹션마다 1436~1444px(1920 기준)로 드리프트하지만, StageSection 실측
// (1441×0.766 ≈ 1104 ≈ 1100)이 dev 정본 토큰 max-w-content(안쪽 실폭 1100px)와 정확히 맞아
// 토큰 정정 없이 전 섹션을 이 컨테이너로 통일했다. 예외였던 OutcomesSection 패널 폭 제한
// (lg:max-w-[54.6875rem])은 공통 컴포넌트 수렴에서 폐기됐다 — 기준(InDepthResearch)이 같은
// 시안 결함을 이미 full-width로 정규화해 헤딩과 패널 좌단을 맞춰 뒀다.
//
// 섹션 간 상단 여백 — 시안 실제 형제 갭은 전 경계 0이고 리듬은 섹션 내부 패딩(상 100~120px)이
// 만든다(하단 패딩 편차 113~168px는 line-box 잔여 노이즈로 정규화). 배경이 전 구간 흰색이라
// 인접 두 섹션의 경계 갭(100+100=200px)을 ×0.67로 축소해 각 섹션 pt에 몰아준다
// (134px=lg:pt-[8.375rem]). 히어로→프로세스 경계만 시안 자체가 120px로 더 좁아
// lg:pt-[5rem](80px)를 쓰고, FAQ→푸터 경계는 유일한 배경 전환 지점이라 축소 없이
// lg:pb-[7.0625rem](113px)를 그대로 쓴다.
//
// 섹션 마크업 — 헤딩・컨테이너・카드 그리드는 전부 components/services/ 공통 컴포넌트를 쓴다
// (기준 = InDepthResearch.jsx). 이 파일에는 데이터 배열과 히어로(페이지 고유)만 남는다.

const PROCESS_STEPS = [
  {
    title: "문항・활동 입력",
    desc: "문항과 활동 자료를 학생이 직접 입력합니다.",
  },
  {
    title: "핵심 내용 정리",
    desc: "입력한 내용에서 핵심을 체계적으로 정리합니다.",
  },
  {
    title: "구조 설계",
    desc: "논리적 구성과 흐름을 설계합니다.",
  },
  {
    title: "피드백・점검",
    desc: "학생이 작성한 초안의 표현・완성도를 점검합니다.",
  },
];

const STAGE_TABS = ["문항분석", "내용정리", "강점추출", "구조설계", "피드백"];

// 탭별 카드 3장×5탭 — 상태 변형 노드 5개(문항분석 1907:20878, 내용정리 2181:1279, 강점추출
// 2181:1365, 구조설계 2181:1533, 피드백 2181:1574)가 전부 존재해(스펙 §3-0) 문항분석 탭만
// 정적으로 노출하던 구현을 폐기하고 인터랙티브 탭으로 전환했다. 문항분석 콘텐츠는 기존 코드
// 그대로 유지, 나머지 4탭은 신규 자산・카피.
const STAGE_CONTENT = {
  문항분석: [
    {
      icon: iconBinoculars,
      title: "문항 의도 파악",
      desc: "문항이 묻는 핵심과 의도를 짚어줍니다.",
    },
    {
      icon: iconSisyphus,
      title: "답변 방향 설정",
      desc: "무엇을 중심으로 써야 할지 방향을 잡아줍니다.",
    },
    {
      icon: iconLightbulb,
      title: "핵심 키워드 도출",
      desc: "답변에 담아야 할 핵심 키워드를 정리합니다.",
    },
  ],
  내용정리: [
    {
      icon: stageOrganizeLaptop,
      title: "활동・경험 정리",
      desc: "학생이 입력한 활동과 경험을 체계적으로 정리합니다.",
    },
    {
      icon: stageOrganizeWeight,
      title: "내용 우선순위",
      desc: "어떤 경험을 앞세울지 우선순위를 잡아줍니다.",
    },
    {
      icon: stageOrganizeTablet,
      title: "불필요한 내용 정리",
      desc: "중복・군더더기를 덜어내는 방향을 안내합니다.",
    },
  ],
  강점추출: [
    {
      icon: stageStrengthRain,
      title: "강점 발굴",
      desc: "경험 속 나만의 강점을 함께 찾습니다.",
    },
    {
      icon: stageStrengthWinner,
      title: "차별화 포인트",
      desc: "남과 다른 차별화 포인트를 짚어줍니다.",
    },
    {
      icon: stageStrengthKnot,
      title: "강점–근거 연결",
      desc: "강점을 뒷받침할 근거와 연결합니다.",
    }, // – = U+2013(스펙 §0-6)
  ],
  구조설계: [
    {
      icon: stageStructWriting,
      title: "논리 흐름 설계",
      desc: "도입–전개–마무리의 논리 흐름을 설계합니다.",
    }, // – ×2 = U+2013
    {
      icon: stageStructWand,
      title: "문단 구성 제안",
      desc: "문단별 구성과 배치를 제안합니다.",
    },
    {
      icon: stageStructWarrior,
      title: "일관성 점검",
      desc: "전체 흐름의 일관성을 점검합니다.",
    },
  ],
  피드백: [
    {
      icon: stageFeedbackMessage,
      title: "표현 피드백",
      desc: "학생 초안의 문장・표현을 점검하고 피드백합니다.",
    },
    {
      icon: stageFeedbackShield,
      title: "문항 적합성 점검",
      desc: "문항 의도에 맞게 답했는지 확인합니다.",
    },
    {
      icon: stageFeedbackStrength,
      title: "완성도 점검",
      desc: "제출 전 완성도 체크리스트를 제공합니다.",
    },
  ],
};

const AUDIENCE_CARDS = [
  {
    image: studentCardWriting,
    title: "작성이 막막한 학생",
    desc: "어디서부터 시작할지 모르겠는 학생",
  },
  {
    image: studentCardOrganizing,
    title: "정리가 어려운 학생",
    desc: "경험은 있는데 어떻게 풀지 막막한 학생",
  },
  {
    image: studentCardStructuring,
    title: "구성이 어려운 학생",
    desc: "설득력 있는 흐름과 구성이 어려운 학생",
  },
  {
    image: studentCardPolishing,
    title: "완성도를 높이고 싶은 학생",
    desc: "초안은 있으나 더 다듬고 싶은 학생",
  },
];

// 시안(1907:20945)은 상위 4단계 프로세스(ProcessSection)의 "핵심 내용 정리" 단계가
// "활동 정리 + 강점 추출"로 세분화된 5단계 상세 버전이다(스펙 §5, 숫자 불일치 아님).
const FIVE_STEPS = [
  {
    title: "문항 해석",
    desc: "문항의 의도와 핵심을 짚어 답변 방향을 잡습니다.",
  },
  { title: "활동 정리", desc: "입력한 활동・경험을 체계적으로 정리합니다." },
  { title: "강점 추출", desc: "나만의 강점과 차별화 포인트를 함께 찾습니다." },
  { title: "구조 설계", desc: "논리적 구성과 흐름을 설계합니다." },
  { title: "피드백", desc: "학생 초안의 표현・완성도를 점검하고 보완합니다." },
];

const OUTCOME_ITEMS = [
  { icon: outcomeSettings, label: "구조 설계안" },
  { icon: iconWallet, label: "핵심 내용 요약본" },
  { icon: outcomeFolder, label: "강점・차별화 포인트" },
  { icon: outcomeCalendar, label: "피드백 리포트" }, // 시안(1907:21009)은 Settings/Folder 중복 placeholder — 코드가 정상(스펙 §11-2 D3)
];

// 후기 작성자명 — 시안 원본은 "고3 김□□/이△△/박○○"처럼 마스킹 기호가 그대로 노출된
// placeholder였다(스펙 §11-2 D2). 목표관리・수행평가 선례의 "고N 김OO" 마스킹 표기로 교체했다.
const TESTIMONIALS = [
  {
    emoji: "😉",
    quote:
      "문항 해석부터 구조까지 단계별로 도와주셔서 수월하게 작성할 수 있었어요.",
    name: "고3 이OO",
  },
  {
    emoji: "☺️",
    quote: "제가 가진 강점을 잘 정리해줘서 자소서 설득력이 높아졌어요.",
    name: "고3 박OO",
  },
  {
    emoji: "😊",
    quote: "피드백이 정말 구체적이라 부족했던 부분을 스스로 고칠 수 있었어요.",
    name: "고3 김OO",
  },
];

// FAQ 답변 — 시안 펼침 상태 변형(2181:8233)에 답변 5개 전문이 있어(스펙 §8-0) 그 정본으로
// 교체했다. 단 5번(이용 요금)만 예외: 시안 정본은 "서비스 요금 안내 페이지에서 확인하실 수
// 있습니다"이지만, 자기평가는 products 테이블에 상품이 없어 요금 안내 페이지가 실질적으로
// 비어 있다 — 정본을 그대로 넣으면 링크 없는 허위 안내가 된다. 나머지 4개만 교체하고 5번은
// 현행 문구를 유지한다(사용자 결정, 스펙 §12 Q1 (b)).
const FAQ_ITEMS = [
  {
    q: "어떤 자료를 입력해야 하나요?",
    a: "문항과 본인의 활동・경험 자료를 입력하면 됩니다. 입력한 내용을 바탕으로 방향과 구성을 안내합니다.",
  },
  {
    q: "AI가 대신 작성해 주나요?",
    a: "아니요. 위닝 자기평가서는 문항 해석・구조 설계・피드백을 돕는 코칭 서비스이며, 실제 작성은 학생 본인이 수행합니다. 제공되는 설계안・피드백을 그대로 옮겨 제출하는 것은 학문적 정직성에 어긋날 수 있어 권장하지 않습니다.",
  },
  {
    q: "피드백은 어떤 기준으로 제공되나요?",
    a: "문항 적합성, 논리 구성, 표현의 명료성 등을 기준으로 제공합니다.",
  },
  {
    q: "제공되는 결과물은 어떻게 활용하나요?",
    a: "구조 설계안・요약・피드백은 학생 본인이 서류를 직접 작성・검토하는 데 참고하는 자료입니다. 제출용 서류는 학생이 스스로 완성해야 합니다.",
  },
  {
    q: "이용 요금은 어떻게 되나요?",
    a: "정확한 이용 요금은 상담을 통해 안내드립니다.",
  },
];

function HeroSection() {
  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다 — 서비스 랜딩 4종 + LearningDiagnosisLanding
  // 공통 useInView 훅 구조(PerformanceAssessment.jsx HeroSection 선례).
  const [auraRef, auraInView] = useInView() as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];
  const navigate = useNavigate();

  // 히어로 CTA, 실제 서비스 앱(/app/selfeval)으로 이동만 한다. 비로그인은 /login, 이용권이
  // 없으면 /pricing 으로 보내는 일은 앱 라우트의 RequireEntitlement 가 맡는다.
  function handleHeroCta() {
    navigate("/app/selfeval");
  }

  return (
    // 섹션 패딩(md:pb-0 md:pt-[2.25rem])은 목표관리・수행평가 히어로와 동일 규격으로
    // 통일했다(3페이지 공통 규격, 사용자 지시).
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-9">
      {/* 오라 애니메이션 — hero-aura.svg(노드 3248:2343 정본, 회전 4프레임 2716:3011→3076→
          3082→3088을 단일 rotate(0→360deg) 루프로 무손실 대체)를 위치/회전 레이어 2단 구조로
          렌더한다(PerformanceAssessment.jsx HeroSection 선례 그대로 이식 — 같은 요소에 위치용
          translate와 회전용 rotate를 같이 걸면 rotate가 translate를 덮어써 이미지가 밀려난다).
          바깥 div(auraRef) = 위치 전담(1600×1200 = 4:3). 안쪽 .sa-aura-spin = 회전 전담이자
          실제 정사각(1600×1600) SVG 배치 — hero-aura.svg의 viewBox("0 -220 1600 1600")가 이미
          뷰박스 중심을 회전 피벗(800,580)과 일치시켜 뒀으므로 transform-origin은 기본값
          50% 50% 그대로 둔다. top-[-16.6667%]는 4:3 위치 래퍼(높이 0.75w) 안에 정사각(높이 w)
          SVG를 세로 중앙 정렬하는 상수로, 비율 자체에서 나오는 값이라 수행평가와 동일하다
          (임의로 바꾸지 말 것).

          위치 래퍼 자체의 top은 -14.375rem(230px 상향) — 시안 히어로 프레임(2181:10043,
          1920×875) 실측상 Eclipse 중심이 섹션 상단 기준 y=370에 있다. main의 pt-16(64px)을
          더한 목표 페이지 y = 64+370 = 434인데, top-0 기준으로는 Eclipse 중심이 페이지
          y≈664(래퍼 top 0 + 회전 캔버스 중심 664)에 놓여 브라우저 목업(상단 y≈410)에 시안
          조각이 완전히 가려진다. 회전 피벗(안쪽 .sa-aura-spin)은 그대로 두고 위치 래퍼만
          230px 끌어올려 정합시킨다. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 -top-57.5 aspect-4/3 w-[100rem] max-w-none -translate-x-1/2 select-none"
      >
        <style>{`
          @keyframes sa-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .sa-aura-spin[data-float='on'] {
              animation: sa-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <div
          className="sa-aura-spin absolute left-0 top-[-16.6667%] aspect-square w-full"
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
      {/* 그레인 — 회전 래퍼의 형제(밖)에 둔다. transform이 걸린 요소는 새 stacking context를
          만들어 mix-blend-overlay가 섹션 배경(bg-white)을 backdrop으로 못 잡고 그레인이 전면
          노출되는 회귀가 실제로 있었다(수행평가・학습진단 선례). */}
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-size-[8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        {/* eyebrow/H1/서브 문단/CTA/목업 폭 — 목표관리・수행평가와 통일한 3페이지 공통 규격으로
            교체했다(스펙 §1-2, 사용자 지시). 카피 자체는 자기평가 고유 문구 그대로 유지. */}
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          서류 작성 지원 프로그램
        </p>

        <h1 className="mt-6 break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          문항 해석부터 구조 설계까지, 자기평가서를 더 설득력 있게
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-ink sm:text-[1.25rem] md:text-[1.5rem]">
          문항 핵심을 파악하고 나만의 강점을 구조화해, 학생이 스스로 완성하도록
          돕습니다
        </p>

        <button
          type="button"
          onClick={handleHeroCta}
          className="mt-6 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] bg-primary px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:h-17 sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        {/* 브라우저 목업 — 시안(2181:10054)은 크롬 UI만 있고 실제 서비스 화면 자식 노드
            자체가 없다(빈 흰 화면, 스펙 §11-1 M1). 크롬 프레임 지오메트리(폭/그림자/상단
            마진+하단 음수 마진)는 목표관리・수행평가 공통 규격을 이식하고 본문은 계속 빈
            배경으로 둔다(실 캡처 자산 없음, 디자인 재량). */}
        <ServiceHeroBrowserFrame>
          <div
            className="aspect-1280/553 w-full bg-[#FAFAFA] md:aspect-auto md:min-h-0 md:flex-1"
            aria-hidden="true"
          />
        </ServiceHeroBrowserFrame>
      </div>
    </section>
  );
}

export default function SelfAssessment() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />

      {/* 프로세스 — 타이틀 시안 원문은 "위닝 목표관리의 4단계 핵심 프로세스"로 다른 서비스
          카피가 그대로 복사돼 있었다(스펙 §11-2 D1). 자기평가서 문맥에 맞게 정정했다.
          2행 "4단계 핵심 프로세스"만 네이비 강조(시안 상태 변형 노드 2181:1533/1574/8233
          실측, 스펙 §2-2 신규). */}
      <ServiceSection
        className="lg:pt-20"
        heading={
          <>
            위닝 자기평가서의
            <br />
            <span className="text-primary">4단계 핵심 프로세스</span>
          </>
        }
      >
        <ServiceProcessCards items={PROCESS_STEPS} />
      </ServiceSection>

      {/* 단계 탭 — 타이틀은 시안 5프레임 전부 "단계별로, 목표를 관리합니다"로 목표관리 카피가
          복붙돼 있던 것을 이 섹션 콘텐츠에 맞게 정정한 값이다(스펙 §11-2 D1, 3-1).
          panelHeightClass(16.1875rem=259px) — 실측(1500px 뷰포트) 탭별 패널 높이가 문항분석/
          강점추출/구조설계 234px, 내용정리・피드백 259px로 갈린다(각 1번 카드 설명이 2줄로
          감겨 25px 더 높음). 최소값으로 고정하면 2줄 설명이 잘리므로 최대값을 채택해 탭 전환
          시 아래 섹션이 밀렸다 당겨지는 레이아웃 점프를 막는다. */}
      <ServiceSection
        className="lg:pt-33.5"
        heading="단계별로, 자기평가서를 완성합니다"
      >
        <ServiceTabsPanel
          tabs={STAGE_TABS}
          content={STAGE_CONTENT}
          ariaLabel="자기평가서 작성 단계"
          idPrefix="stage"
          panelHeightClass="lg:h-64.75"
        />
      </ServiceSection>

      {/* 추천 대상 — 강조 런은 시안 characterStyleOverrides 그대로 "자기 평가 서비스를
          추천해요" 전체를 네이비(#013262)로(accent #0B84FD 아님, 스펙 §12 Q3 (a)).
          카드 이미지는 일러스트가 아니라 학생 사진 JPG라 imageFit="cover". */}
      <ServiceSection
        className="lg:pt-33.5"
        heading={
          <>
            이런 학생에게{" "}
            <span className="text-primary">자기 평가 서비스를 추천해요</span>
          </>
        }
      >
        <ServiceAudienceCards items={AUDIENCE_CARDS} imageFit="cover" />
      </ServiceSection>

      <ServiceSection className="lg:pt-33.5" heading="다섯 단계로 차근차근">
        <ServiceStepCards items={FIVE_STEPS} splitLastRow />
      </ServiceSection>

      {/* 성과 — 아이콘 매핑은 시안 절대배치 x좌표로 재계산해 확정했다(자식 배열 순서로 읽으면
          1↔2가 뒤바뀐다, 스펙 §11-4). */}
      <ServiceSection className="lg:pt-33.5" heading="자기평가로 정리되는 것들">
        <ServiceOutcomesPanel items={OUTCOME_ITEMS} />
      </ServiceSection>

      {/* 후기 — 타이틀 시안 원문은 "목표관리 서비스를 받아본 학생들의 후기"로 다른 서비스
          카피가 복사돼 있던 것을 정정했다(스펙 §11-2 D1). */}
      <ServiceSection
        className="lg:pt-33.5"
        heading="자기평가 서비스를 받아본 학생들의 후기"
      >
        <ServiceTestimonials items={TESTIMONIALS} />
      </ServiceSection>

      <ServiceSection
        className="pb-20 sm:pb-24 lg:pb-28.25 lg:pt-33.5"
        heading="자주 묻는 질문"
      >
        <ServiceFaq items={FAQ_ITEMS} />
      </ServiceSection>
    </main>
  );
}
