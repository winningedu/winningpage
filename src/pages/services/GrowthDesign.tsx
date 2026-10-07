import type { MouseEvent, MutableRefObject } from "react";
import { useNavigate } from "react-router";
import heroGrain from "@/assets/renewal/landing/hero-grain.png";
import iconShield from "@/assets/renewal/landing/icon-shield-v2.png";
import heroAura from "@/assets/services/goal/hero-aura.png";
import iconBinoculars from "@/assets/services/goal/icon-binoculars.png";
import iconStrength from "@/assets/services/goal/icon-strength.png";
import iconTablet from "@/assets/services/goal/icon-tablet.png";
import iconWarrior from "@/assets/services/goal/icon-warrior.png";
import iconWriting from "@/assets/services/goal/icon-writing.png";
import outcomeCalendar from "@/assets/services/goal/outcome-calendar.png";
import outcomeFolder from "@/assets/services/goal/outcome-folder.png";
import outcomeSettings from "@/assets/services/goal/outcome-settings.png";
import heroReport from "@/assets/services/growth/hero-report.png";
import iconLightbulb from "@/assets/services/performance/icon-lightbulb-sketch.png";
import iconSisyphus from "@/assets/services/performance/icon-sisyphus.png";
import audienceData from "@/assets/services/research/audience-data.png";
import audienceDesign from "@/assets/services/research/audience-design.png";
import audienceReview from "@/assets/services/research/audience-review.png";
import audienceTopic from "@/assets/services/research/audience-topic.png";
import ServiceAudienceCards from "@/components/services/ServiceAudienceCards";
import ServiceFaq from "@/components/services/ServiceFaq";
import ServiceHeroBrowserFrame from "@/components/services/ServiceHeroBrowserFrame";
import ServiceProcessCards from "@/components/services/ServiceProcessCards";
import ServiceSection from "@/components/services/ServiceSection";
import { useInView } from "@/hooks/useInView";
import { getDemoAccessState } from "@/lib/demoAccess";
import GrowthFeatureCards from "./growthLanding/GrowthFeatureCards";
import GrowthOutcomesPanel from "./growthLanding/GrowthOutcomesPanel";
import GrowthPrincipleCards from "./growthLanding/GrowthPrincipleCards";
import GrowthStepTabs, {
  type GrowthTabCard,
} from "./growthLanding/GrowthStepTabs";

// 성장설계 서비스 랜딩 /services/growth
// Figma 시안 754:71623(기본 프레임), 변형 754:71642~71646(StepTabs 탭 2~5, FAQ 펼침).
// 공용 조각(components/services/*)은 병렬 세션 충돌을 피하려고 고치지 않았다. 시안이 요구하는
// 4곳(예시 행 탭, 2단 타이틀 카드, 2행 성과 라벨, 3열 원칙 카드)은 growthLanding/ 아래에
// 로컬 컴포넌트로 두고, 나머지는 공용 조각을 그대로 쓴다.

const GROWTH_APP_ROUTE = "/app/growth";

// 카피 정본은 docs/growth-landing-figma/copy.json 이다. 금지 문자는 치환했고 가운뎃점은
// U+30FB 로 통일했다.
// 설명은 시안의 강제 줄바꿈을 옮기지 않는다. 카드 폭이 시안과 달라 한 글자 고아 줄이 생긴다.
// 첫 문장(소요 시간)만 줄을 나누고 나머지는 break-keep 자연 줄바꿈에 맡긴다.
const PROCESS_STEPS = [
  {
    title: "학생 조사",
    desc: [
      "26문항, 약 10분.",
      "진로・관심・경험과 희망 대학 두 곳을 학생이 직접 답합니다.",
    ],
  },
  {
    title: "활동 자료 모으기",
    desc: "위닝에서 만든 활동 기록을 모읍니다. 빈 학기는 자기평가서로 채웁니다.",
  },
  {
    title: "리포트 생성",
    desc: ["약 3분.", "방향 일관성과 A~E 5축 진단을 담아 PDF로 제공합니다."],
  },
  {
    title: "실행계획",
    desc: "제안된 활동을 시기별로 정리하고, 하나씩 체크하며 진행합니다.",
  },
];

const STAGE_TABS = [
  "활동 방향",
  "5축 진단",
  "대학 대조",
  "남은 기간 설계",
  "실행계획",
];

const STAGE_CONTENT: Record<string, GrowthTabCard[]> = {
  "활동 방향": [
    {
      title: "대주제와 학년별 소주제",
      desc: "진로・탐구 성향・기록에서 대주제 한 문장을 뽑고, 1학년 씨앗・2학년 꽃・3학년 만개로 나눕니다.",
      icon: iconLightbulb,
      example: "2학년 꽃 ・ 내가 만든 숫자가 믿을 만한지 따지기",
    },
    {
      title: "방향 일관성",
      desc: "과목 간・학년 간 연계와 대주제 낱말 일치로 활동을 연결하고, 연결 비율로 판정합니다.",
      icon: iconWarrior,
      example: "연결 활동 7건 ÷ 전체 14건 = 50% ・ 갈리는 중",
    },
    {
      title: "반복된 문제의식",
      desc: "학년과 과목을 넘어 되풀이된 질문을 찾고, 흐름이 끊긴 학기를 표시합니다.",
      icon: iconSisyphus,
      example: null,
    },
  ],
  "5축 진단": [
    {
      title: "A~E 5축 판정",
      desc: "학년별 기준에 비춰 축마다 확인됨・주의・아직 없음으로 근거와 함께 판정합니다.",
      icon: iconTablet,
      example: "고2 기준 ・ D 공동체역량은 학급・학년 단위 기여 기록 1건 이상",
    },
    {
      title: "교과별 역할 분석",
      desc: "교과・자율・동아리・진로활동을 영역별로 보고, 과목마다 어떤 축을 맡는지 봅니다.",
      icon: iconBinoculars,
      example: null,
    },
    {
      title: "독서와 후속 질문",
      desc: "읽은 것이 다음 탐구로 이어졌는지 확인합니다.",
      icon: iconWriting,
      example: null,
    },
  ],
  "대학 대조": [
    {
      title: "희망 대학 인재상 대조",
      desc: "대학이 공식 발표한 인재상・평가요소에 활동을 대조해 드러남・부족함・없음으로 나눕니다.",
      icon: iconBinoculars,
      example: "두 대학 공통 ・ 문제를 분석하고 대안까지 제시하는 경험(부족함)",
    },
    {
      title: "권장과목과 과목 선택",
      desc: "모집단위별 반영・권장과목을 역산해 학기별 이수 계획을 만듭니다.",
      icon: iconWriting,
      example: "미적분Ⅰ을 2학년에 놓치면 3학년 미적분Ⅱ를 들을 수 없습니다",
    },
    {
      title: "성적 추이와 입결 대비 위치",
      desc: "5등급제・9등급제를 구분하고, 학기별 추이와 전년도 입결 대비 위치를 봅니다.",
      icon: iconTablet,
      example: "위닝 내부 기준의 참고 위치이며 합격 가능성 예측이 아닙니다",
    },
  ],
  "남은 기간 설계": [
    {
      title: "과목별 빌드업 지도",
      desc: "과목마다 지금 상태와 다음 단계를 잇고 학년별 목표 등급을 정리합니다.",
      icon: iconStrength,
      example: null,
    },
    {
      title: "반드시 필요한 다음 활동",
      desc: "반드시 필요한 활동과 있으면 좋은 활동을 우선순위대로 나눕니다.",
      icon: iconWarrior,
      example:
        "정보 ・ 예제 구현을 배차 자료를 직접 처리하는 코드로 바꾸면 축 안으로 들어옵니다",
    },
    {
      title: "피해야 할 반복",
      desc: "같은 주제를 같은 방법으로 다시 하는 활동, 분석에서 멈추는 탐구를 짚습니다.",
      icon: iconSisyphus,
      example: null,
    },
  ],
  실행계획: [
    {
      title: "시기별 할 일",
      desc: "제안된 활동을 언제 할지 학기・월 단위로 정리합니다.",
      icon: iconWriting,
      example: "2026년 11~12월 ・ 학급 단위 기여 활동 1건 만들기",
    },
    {
      title: "축・대학 기준 표시",
      desc: "활동마다 어떤 축과 어떤 대학 기준을 채우는지 함께 보여줍니다.",
      icon: iconLightbulb,
      example: "D 공동체역량 ・ 건국대 공동체역량 ・ 서울시립대 사회역량",
    },
    {
      title: "완료하면 달라지는 것",
      desc: "하나씩 체크할 때마다 진행률과 달라지는 항목을 보여줍니다.",
      icon: iconStrength,
      example: "D 공동체역량 ・ 아직 없음에서 기준 충족으로",
    },
  ],
};

const AUDIENCE_CARDS = [
  {
    image: audienceData,
    title: "활동이 흩어진 학생",
    desc: "한 건 한 건은 했는데 하나로 이어지지 않는 학생",
  },
  {
    image: audienceTopic,
    title: "빈 역량이 궁금한 학생",
    desc: "무엇이 채워졌고 무엇이 비었는지 알고 싶은 학생",
  },
  {
    image: audienceDesign,
    title: "과목 선택이 고민인 학생",
    desc: "희망 계열에 맞는 과목을 언제 들어야 할지 막막한 학생",
  },
  {
    image: audienceReview,
    title: "고등학교를 준비하는 중3",
    desc: "고교학점제와 3년 설계를 미리 그려 보고 싶은 학생",
  },
];

const FEATURE_CARDS = [
  {
    title: "중3",
    subtitle: "고등학교 3년을 미리 설계",
    desc: "설문과 성적으로 만듭니다. 고교학점제와 과목 선택, 입학 전 준비를 정합니다.",
  },
  {
    title: "고1",
    subtitle: "방향 제시에 비중",
    desc: "자료가 적은 만큼 대주제와 2학년 과목 선택 방향에 무게를 둡니다.",
  },
  {
    title: "고2",
    subtitle: "1학년 평가, 2학년 보완, 3학년 방향",
    desc: "비어 있는 축을 3학년 전에 채우는 시점입니다.",
  },
  {
    title: "고3",
    subtitle: "월 단위 실행계획",
    desc: "남은 기간이 짧아 실행계획을 월 단위로 나눕니다.",
  },
  {
    title: "졸업・N수",
    subtitle: "진단 중심",
    desc: "A~E 진단, 방향 일관성, 인재상 대조, 입결 대비 위치를 제공합니다.",
  },
];

const OUTCOME_ITEMS = [
  {
    icon: outcomeFolder,
    label: "대주제・학년별 로드맵",
    sub: "씨앗・꽃・만개",
  },
  {
    icon: outcomeSettings,
    label: "A~E 5축 진단표",
    sub: "근거 활동・판정 기준 포함",
  },
  {
    icon: iconShield,
    label: "대학 인재상・권장과목 대조",
    sub: "공식 발표 자료 기준",
  },
  {
    icon: outcomeCalendar,
    label: "학기별 실행계획",
    sub: "체크하며 진행률 확인",
  },
];

const PRINCIPLES = [
  {
    title: "근거 활동 연결",
    desc: "모든 진단에 근거 활동을 연결합니다. 어떤 활동을 보고 그렇게 판단했는지 항목마다 표시합니다.",
  },
  {
    title: "계산식・기준 공개",
    desc: "방향 일관성, 성적 곡선, 추정 등급 모두 계산식과 판정 기준을 함께 적습니다.",
  },
  {
    title: "공식 자료만 사용",
    desc: "대학의 인재상・평가요소・반영과목은 공식 발표 자료만 쓰고, 출처와 확인 연도를 표시합니다.",
  },
];

const FAQ_ITEMS = [
  {
    q: "어떤 자료를 분석하나요?",
    a: "학생이 위닝에서 직접 만든 활동 기록과 학생 조사(26문항) 응답을 분석합니다. 기록이 비어 있는 학기는 자기평가서를 올려 채울 수 있으며, 이때 주제・개념・결과・한계 네 항목만 추출하고 원문은 저장하지 않습니다.",
  },
  {
    q: "AI가 활동이나 글을 대신 만들어 주나요?",
    a: "아닙니다. 성장설계는 활동의 방향과 시기별 계획을 제안합니다. 실제 활동과 기록은 학생이 직접 수행하고 작성합니다.",
  },
  {
    q: "진단은 어떤 기준으로 하나요?",
    a: "위닝 A~E 5축(학업역량・진로・전공적합성・탐구・자기주도성・공동체역량・발전가능성)을 학년별 기준에 비춰 확인됨・주의・아직 없음으로 판정합니다. 모든 진단은 위닝 내부 기준이며, 대학의 평가 결과나 합격 가능성 예측이 아닙니다.",
  },
  {
    q: "결과물은 어떻게 활용하나요?",
    a: "리포트는 PDF로 내려받아 보관할 수 있습니다. 판정마다 근거 활동과 계산식이 붙어 있어 학부모님과 같은 근거를 보며 다음 학기를 이야기할 수 있고, 실행계획은 체크하며 진행률을 확인할 수 있습니다.",
  },
  {
    q: "이용 요금은 어떻게 되나요?",
    a: "이용권 1회로 리포트와 실행계획을 함께 받습니다. 생성이 실패하면 이용권은 그대로 남아 다시 시도할 수 있습니다.",
  },
];

const NOTE_LINES = [
  "모든 진단은 위닝 내부 기준이며 대학의 평가 결과나 합격 가능성이 아닙니다.",
  "화면의 예시는 가상 학생의 데모 데이터이며 실제 학생의 이름・소속은 포함되어 있지 않습니다.",
];

const ANIMATION_IN_VIEW_MARGIN = "0px 0px 200px 0px";

const HERO_REPORT_ALT =
  "성장설계 리포트 화면. 좌측 진행단계 메뉴, 이 학생의 대주제와 학년별 씨앗, 꽃, 만개 소주제, 한눈에 지표 카드를 보여준다";

function HeroSection() {
  const [auraRef, auraInView] = useInView(ANIMATION_IN_VIEW_MARGIN) as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];
  const navigate = useNavigate();

  // 비로그인은 /login 으로 보내 복귀지를 앱 경로로 남긴다. 이용권 판정은 앱 라우트가 맡는다.
  async function handleHeroCta(event?: MouseEvent<HTMLButtonElement>) {
    const access = await getDemoAccessState();
    event?.preventDefault?.();

    if (access === "guest") {
      navigate(`/login?redirect=${encodeURIComponent(GROWTH_APP_ROUTE)}`);
      return;
    }

    navigate(GROWTH_APP_ROUTE);
  }

  return (
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-9">
      {/* 오라: 래스터 이미지를 30초 등속 회전한다. 위치 래퍼와 회전 img 를 분리한다. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 -top-40 w-[100rem] max-w-none -translate-x-1/2 select-none opacity-90"
      >
        <style>{`
          @keyframes growth-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .growth-aura-spin[data-float='on'] {
              animation: growth-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <img
          src={heroAura}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="growth-aura-spin block w-full"
          data-float={auraInView ? "on" : "off"}
        />
      </div>
      {/* 그레인은 회전 래퍼 밖에 둔다. transform 래퍼 안에 두면 overlay 블렌드가 깨진다. */}
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-size-[8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          진로・활동 설계 프로그램
        </p>

        <h1 className="mt-6 break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          지금까지의 활동을, 하나의 방향으로 설계하게
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-ink sm:text-[1.25rem] md:text-[1.5rem]">
          활동 기록과 학생 조사를 함께 읽고, 대주제와 남은 학기의 실행계획을
          학생과 함께 세웁니다
        </p>

        <button
          type="button"
          onClick={handleHeroCta}
          className="mt-6 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] bg-primary px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:h-17 sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        <ServiceHeroBrowserFrame>
          <img
            src={heroReport}
            alt={HERO_REPORT_ALT}
            className="w-full md:min-h-0 md:flex-1 md:object-cover md:object-top"
          />
        </ServiceHeroBrowserFrame>
      </div>
    </section>
  );
}

export default function GrowthDesign() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />

      <ServiceSection
        className="lg:pt-20"
        heading={
          <>
            위닝 성장설계의
            <br />
            <span className="text-primary">4단계 핵심 프로세스</span>
          </>
        }
      >
        <ServiceProcessCards items={PROCESS_STEPS} />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-33.5"
        heading="단계별로, 성장 방향을 설계합니다"
      >
        <GrowthStepTabs
          tabs={STAGE_TABS}
          content={STAGE_CONTENT}
          ariaLabel="성장설계 단계"
          idPrefix="growth-stage"
        />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-33.5"
        heading={
          <>
            이런 학생에게{" "}
            <span className="text-primary">성장설계를 추천해요</span>
          </>
        }
      >
        <ServiceAudienceCards items={AUDIENCE_CARDS} />
      </ServiceSection>

      <ServiceSection className="lg:pt-33.5" heading="학년에 맞춰 다섯 갈래로">
        <GrowthFeatureCards items={FEATURE_CARDS} />
      </ServiceSection>

      <ServiceSection className="lg:pt-33.5" heading="성장설계로 정리되는 것들">
        <GrowthOutcomesPanel items={OUTCOME_ITEMS} />
      </ServiceSection>

      <ServiceSection
        className="lg:pt-33.5"
        heading="근거 없이 판정하지 않습니다"
      >
        <GrowthPrincipleCards items={PRINCIPLES} />
      </ServiceSection>

      <ServiceSection className="lg:pt-33.5" heading="자주 묻는 질문">
        <ServiceFaq items={FAQ_ITEMS} />
      </ServiceSection>

      {/* 고지문 2줄. 하단 여백은 이 섹션이 가진다. */}
      <ServiceSection className="pb-20 pt-10 sm:pb-24 sm:pt-12 lg:pb-28.25 lg:pt-16">
        <p className="text-[0.875rem] leading-[1.6] text-[#767676]">
          {NOTE_LINES[0]}
          <br />
          {NOTE_LINES[1]}
        </p>
      </ServiceSection>
    </main>
  );
}
