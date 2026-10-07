import type { MutableRefObject } from "react";
import { useNavigate } from "react-router";
import heroGrain from "@/assets/renewal/landing/hero-grain.png";
import iconBinoculars from "@/assets/services/goal/icon-binoculars.png";
import iconStrength from "@/assets/services/goal/icon-strength.png";
import iconTablet from "@/assets/services/goal/icon-tablet.png";
import iconWarrior from "@/assets/services/goal/icon-warrior.png";
import iconWriting from "@/assets/services/goal/icon-writing.png";
import outcomeCalendar from "@/assets/services/goal/outcome-calendar.png";
import outcomeFolder from "@/assets/services/goal/outcome-folder.png";
import outcomeSettings from "@/assets/services/goal/outcome-settings.png";
import coachLightbulb from "@/assets/services/performance/coach-lightbulb.png";
import iconLightbulb from "@/assets/services/performance/icon-lightbulb-sketch.png";
import iconSisyphus from "@/assets/services/performance/icon-sisyphus.png";
import heroAura from "@/assets/services/self-assessment/hero-aura.svg";
import heroResult from "@/assets/services/self-assessment/hero-result.png";
import iconWallet from "@/assets/services/self-assessment/icon-wallet.png";
import preview01 from "@/assets/services/self-assessment/preview-01-activities.png";
import preview02 from "@/assets/services/self-assessment/preview-02-analysis.png";
import preview03 from "@/assets/services/self-assessment/preview-03-verify.png";
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
import SelfevalCtaBanner from "./selfevalLanding/SelfevalCtaBanner";
import SelfevalScreenPreview from "./selfevalLanding/SelfevalScreenPreview";

// 자기평가서 소개 랜딩(/services/self-assessment).
// 섹션 간격은 히어로 다음만 lg:pt-20, 나머지는 lg:pt-33.5, FAQ만 하단 여백을 따로 둔다.
// CTA 는 /app/selfeval 로 이동만 하고, 게스트와 이용권 미보유 처리는 앱 라우트가 맡는다.

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
      icon: iconWriting,
      title: "활동・경험 정리",
      desc: "학생이 입력한 활동과 경험을 체계적으로 정리합니다.",
    },
    {
      icon: iconTablet,
      title: "내용 우선순위",
      desc: "어떤 경험을 앞세울지 우선순위를 잡아줍니다.",
    },
    {
      icon: iconWarrior,
      title: "불필요한 내용 정리",
      desc: "중복・군더더기를 덜어내는 방향을 안내합니다.",
    },
  ],
  강점추출: [
    {
      icon: iconStrength,
      title: "강점 발굴",
      desc: "경험 속 나만의 강점을 함께 찾습니다.",
    },
    {
      icon: coachLightbulb,
      title: "차별화 포인트",
      desc: "남과 다른 차별화 포인트를 짚어줍니다.",
    },
    {
      icon: iconBinoculars,
      title: "강점과 근거 연결",
      desc: "강점을 뒷받침할 근거와 연결합니다.",
    },
  ],
  구조설계: [
    {
      icon: iconWarrior,
      title: "논리 흐름 설계",
      desc: "도입, 전개, 마무리의 논리 흐름을 설계합니다.",
    },
    {
      icon: iconWriting,
      title: "문단 구성 제안",
      desc: "문단별 구성과 배치를 제안합니다.",
    },
    {
      icon: iconTablet,
      title: "일관성 점검",
      desc: "전체 흐름의 일관성을 점검합니다.",
    },
  ],
  피드백: [
    {
      icon: iconWriting,
      title: "표현 피드백",
      desc: "학생 초안의 문장・표현을 점검하고 피드백합니다.",
    },
    {
      icon: iconBinoculars,
      title: "문항 적합성 점검",
      desc: "문항 의도에 맞게 답했는지 확인합니다.",
    },
    {
      icon: iconStrength,
      title: "완성도 점검",
      desc: "제출 전 완성도 체크리스트를 제공합니다.",
    },
  ],
};

const AUDIENCE_CARDS = [
  {
    image: studentCardWriting,
    title: "작성이 막막한 학생",
    desc: "어디서부터 시작할지 모르겠는 학생.",
  },
  {
    image: studentCardOrganizing,
    title: "정리가 어려운 학생",
    desc: "경험은 있는데 어떻게 풀지 막막한 학생.",
  },
  {
    image: studentCardStructuring,
    title: "구성이 어려운 학생",
    desc: "설득력 있는 흐름과 구성이 어려운 학생.",
  },
  {
    image: studentCardPolishing,
    title: "완성도를 높이고 싶은 학생",
    desc: "초안은 있으나 더 다듬고 싶은 학생.",
  },
];

const FIVE_STEPS = [
  {
    title: "문항 해석",
    desc: "문항 의도와 핵심을 짚어 답변 방향을 잡아줍니다.",
  },
  { title: "활동 정리", desc: "입력한 활동・경험을 체계적으로 정리합니다." },
  { title: "강점 추출", desc: "나만의 강점과 차별화 포인트를 함께 찾습니다." },
  { title: "구조 설계", desc: "논리적 구성과 흐름을 설계합니다." },
  {
    title: "피드백",
    desc: "학생 초안의 표현・완성도를 점검하고 피드백합니다.",
  },
];

const PREVIEW_SLIDES = [
  {
    src: preview01,
    alt: "활동 선택 화면. 방향에 맞는 활동을 추천하고 학생이 최종 선택한다",
  },
  {
    src: preview02,
    alt: "분석 확인 화면. 선택한 활동을 계기, 교과 개념, 한 일, 방법, 결과와 근거 등 항목으로 정리해 학생이 고친다",
  },
  {
    src: preview03,
    alt: "검증 결과 화면. 판단, 한계, 연계와 발전 등 항목별 점검과 검증 요약 점수",
  },
];

const OUTCOME_ITEMS = [
  { icon: outcomeSettings, label: "구조 설계안" },
  { icon: iconWallet, label: "핵심 내용 요약본" },
  { icon: outcomeFolder, label: "강점・차별화 포인트" },
  { icon: outcomeCalendar, label: "피드백 리포트" },
];

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
    a: "서비스 요금 안내 페이지에서 확인하실 수 있습니다.",
  },
];

const CTA_BUTTON_CLASS =
  "mt-6 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] bg-primary px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:h-17 sm:text-[1.25rem]";

function HeroSection({ onCta }: { onCta: () => void }) {
  // 히어로를 벗어나면 30초 회전을 멈춘다.
  const [auraRef, auraInView] = useInView() as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];

  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-9">
      {/* 오라: 바깥 div 는 위치, 안쪽 .sa-aura-spin 은 회전만 맡는다. 한 요소에 translate 와
          rotate 를 같이 걸면 rotate 가 translate 를 덮어쓴다. top 값은 4:3 래퍼 안에서
          정사각 SVG 를 세로 중앙에 맞추는 비율 상수다. */}
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
      {/* 그레인은 회전 래퍼의 형제로 둔다. transform 안에 있으면 mix-blend-overlay 가 배경을
          잡지 못한다. */}
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-size-[8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
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

        <button type="button" onClick={onCta} className={CTA_BUTTON_CLASS}>
          지금 시작하기
        </button>

        <ServiceHeroBrowserFrame>
          <img
            src={heroResult}
            alt="자기평가서 생성 결과 화면. 생성된 자기평가서 본문과 문단별 문장 근거, 검증하기 버튼"
            className="w-full md:min-h-0 md:flex-1 md:object-cover md:object-top"
          />
        </ServiceHeroBrowserFrame>
      </div>
    </section>
  );
}

export default function SelfAssessment() {
  const navigate = useNavigate();

  function handleCta() {
    navigate("/app/selfeval");
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection onCta={handleCta} />

      <ServiceSection
        className="lg:pt-20"
        heading={
          <>
            자기평가서 완성을 위한
            <br />
            <span className="text-primary">4단계 프로세스</span>
          </>
        }
      >
        <ServiceProcessCards items={PROCESS_STEPS} />
      </ServiceSection>

      {/* 패널 높이는 카드 설명이 2줄로 감기는 탭의 최대값에 맞춰 탭 전환 시 레이아웃 점프를 막는다. */}
      <ServiceSection className="lg:pt-33.5" heading="다섯 영역으로 코칭합니다">
        <ServiceTabsPanel
          tabs={STAGE_TABS}
          content={STAGE_CONTENT}
          ariaLabel="자기평가서 코칭 영역"
          idPrefix="stage"
          panelHeightClass="lg:h-64.75"
        />
      </ServiceSection>

      {/* 카드 이미지가 학생 사진이라 imageFit="cover". */}
      <ServiceSection
        className="lg:pt-33.5"
        heading={
          <>
            자기평가서, <span className="text-primary">어디서 막히든</span>
          </>
        }
      >
        <ServiceAudienceCards items={AUDIENCE_CARDS} imageFit="cover" />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-33.5"
        heading={
          <>
            다섯 단계로 <span className="text-primary">차근차근</span>
          </>
        }
      >
        <ServiceStepCards items={FIVE_STEPS} splitLastRow />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-20 lg:pb-20"
        heading={
          <>
            직접 보고 <span className="text-primary">확인하세요</span>
          </>
        }
      >
        <SelfevalScreenPreview slides={PREVIEW_SLIDES} />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-33.5"
        heading={
          <>
            이렇게 <span className="text-primary">정리됩니다</span>
          </>
        }
      >
        <ServiceOutcomesPanel items={OUTCOME_ITEMS} />
      </ServiceSection>

      <ServiceSection className="lg:pt-33.5" heading="위닝 자기평가서">
        <ServiceTestimonials items={TESTIMONIALS} />
      </ServiceSection>

      <ServiceSection
        className="pb-20 sm:pb-24 lg:pb-28.25 lg:pt-33.5"
        heading={
          <>
            궁금한 점을 <span className="text-primary">모았습니다</span>
          </>
        }
      >
        <ServiceFaq items={FAQ_ITEMS} />
      </ServiceSection>

      <SelfevalCtaBanner
        title="나만의 강점을 더 빛나게 설계해보세요."
        ctaLabel="무료 체험 시작"
        onCta={handleCta}
      />
    </main>
  );
}
