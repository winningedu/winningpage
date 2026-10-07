import type { MouseEvent, MutableRefObject } from "react";
import { useNavigate } from "react-router";
import heroGrain from "@/assets/renewal/landing/hero-grain.png";
import heroAura from "@/assets/services/in-depth-research/hero-aura.svg";
import audienceData from "@/assets/services/research/audience-data.png";
import audienceDesign from "@/assets/services/research/audience-design.png";
import audienceReview from "@/assets/services/research/audience-review.png";
import audienceTopic from "@/assets/services/research/audience-topic.png";
import heroTopics from "@/assets/services/research/hero-topics.png";
import outcomeCalendar from "@/assets/services/research/outcome-calendar.png";
import outcomeFolder from "@/assets/services/research/outcome-folder.png";
import outcomeSkill from "@/assets/services/research/outcome-skill.png";
import outcomeWallet from "@/assets/services/research/outcome-wallet.png";
import ServiceAudienceCards from "@/components/services/ServiceAudienceCards";
import ServiceFaq from "@/components/services/ServiceFaq";
import ServiceHeroBrowserFrame from "@/components/services/ServiceHeroBrowserFrame";
import ServiceOutcomesPanel from "@/components/services/ServiceOutcomesPanel";
import ServiceProcessCards from "@/components/services/ServiceProcessCards";
import ServiceSection from "@/components/services/ServiceSection";
import ServiceStepCards from "@/components/services/ServiceStepCards";
import ServiceTestimonials from "@/components/services/ServiceTestimonials";
import { useInView } from "@/hooks/useInView";
import { getDemoAccessState } from "@/lib/demoAccess";
import InDepthResearchScreenPreview from "./InDepthResearchScreenPreview";

// 심화탐구 서비스 랜딩. 경로는 /services/research 이고 구 경로는 /page/services-in-depth-research 다.
// Figma 754:72264 (capture_W6_research__desktop, 1920 x 5624) + FAQ 펼침 754:72637 + 화면 미리보기
// 변형 754:72638, 754:72651. 2026-10-07 리디자인. 새 시안은 종전 구현을 1920 폭으로 캡처한
// 프레임이라 섹션 여백과 카피는 그대로이고, 히어로 캡처와 화면 미리보기 섹션이 추가됐다.
// 목표관리(GoalManagement.jsx), 수행평가(PerformanceAssessment.jsx), 자기평가(SelfAssessment.jsx)와
// 같은 방식으로 components/services/ServiceLandingPage 공용 스켈레톤을 벗어나 bespoke로 구현했다.
// 심화탐구는 상세 페이지(PAID_SERVICE_CONFIGS 미등록)가 없어, 히어로 CTA는 심화탐구 앱
// (/app/inquiry)으로 직접 이동한다(handleHeroCta 참고).

const INQUIRY_APP_ROUTE = "/app/inquiry";

// 컨테이너 폭: 전 섹션을 max-w-content(안쪽 실폭 1100px) 컨테이너로 통일했다.
//
// 섹션 간 상단 여백: 시안 섹션 스택의 형제 갭은 전 경계 0이고, 리듬은 각 섹션 내부 상하
// 패딩이 만든다. 경계 실효 갭 값을 뒤 섹션 pt에 몰아주고 pb는 마지막 FAQ만 갖는다.
// 수치는 시안 실측값 그대로다(환산 없음).
//   Hero 다음 Process        80  lg:pt-20
//   Process 다음 Audience   160  lg:pt-40
//   Audience 다음 FiveSteps 202  lg:pt-50.5
//   FiveSteps 다음 Preview   80  lg:pt-20 (화면 미리보기 인스턴스 754:72387 상하 패딩 80/80)
//   Preview 다음 Outcomes   172  미리보기 pb 80 + Outcomes lg:pt-43
//   Outcomes 다음 Testi     160  lg:pt-40
//   Testi 다음 Faq          180  lg:pt-45
//   Faq 다음 Footer         217  lg:pb-54.25 (유일한 배경 전환 경계)
//
// 섹션 마크업은 전부 components/services/ 공통 컴포넌트로 수렴했다(2026-08-05). 이 페이지가
// 기준(canonical)이지만 로컬 구현을 유지하면 공통 컴포넌트를 고쳐도 기준에 반영되지 않는
// 역전 상태가 되므로, 나머지 3종과 동일하게 전 섹션이 컴포넌트를 통해서만 렌더된다.
// SECTION_HEADING_CLASS 도 serviceTokens.js 단일 정본이며 ServiceSection 이 소유한다.

// 가운뎃점 표기: 시안 원문은 U+00B7과 U+30FB `・`를 혼용한다(같은 프레임 안에서도 타이틀은
// U+30FB, 설명은 U+00B7). 페이지 전역과 3종 선례 페이지가 전부 U+30FB로 통일돼 있어 코드 정본을
// 따라 아래 전 카피를 U+30FB로 맞췄다.

// STEP 라벨은 데이터에 두지 않는다, ServiceProcessCards 가 index 로 생성한다.
const PROCESS_STEPS = [
  {
    title: "주제 선택",
    desc: "관심 분야에서 탐구 주제를 함께 정합니다.",
  },
  {
    title: "탐구 설계",
    desc: "주제・가설・방법・계획을 설계합니다.",
  },
  {
    title: "자료・수행",
    desc: "학생이 자료를 수집하고 탐구를 수행합니다.",
  },
  {
    title: "완성・피드백",
    desc: "학생이 완성한 결과물을 평가하고 피드백합니다.",
  },
];

const AUDIENCE_CARDS = [
  {
    image: audienceTopic,
    title: "주제가 막막한 학생",
    desc: "관심사에서 탐구 주제를 잡기 어려운 학생",
  },
  {
    image: audienceDesign,
    title: "설계가 어려운 학생",
    desc: "가설・방법・계획을 세우기 어려운 학생",
  },
  {
    image: audienceData,
    title: "자료 정리가 필요한 학생",
    desc: "자료를 모으고 해석하는 데 어려움을 겪는 학생",
  },
  {
    // 시안(1907:21486)은 카드1과 같은 일러스트를 재사용했지만 QA 시트 행 43(2026-09-02)이
    // "1번과 4번 동일, 하나는 새 이미지로" 지적. 이후 고객사 신규 에셋이 시안(Figma 1907:21465)에
    // 반영돼 audience-review.png로 교체했다(기존엔 audience-quality-v2 임시 대체 jpg였다).
    image: audienceReview,
    title: "완성도를 높이고 싶은 학생",
    desc: "초안은 있으나 더 다듬고 싶은 학생",
  },
];

const FIVE_STEPS = [
  {
    title: "주제 추천",
    desc: "관심 분야・진로 기반으로 탐구 주제를 제안합니다.",
  },
  { title: "탐구 질문", desc: "탐구 가치가 있는 핵심 질문을 함께 다듬습니다." },
  { title: "자료 정리", desc: "자료 수집・정리・출처 관리 방향을 안내합니다." },
  {
    title: "설계서 작성",
    // 시안 원문은 네 낱말을 화살표로 잇지만 금지 문자라 쉼표로 쓴다.
    desc: "가설, 검증, 해석, 한계의 설계서를 함께 구성합니다.",
  },
  {
    title: "완성본 평가",
    desc: "학생이 완성한 보고서・발표 자료를 평가・피드백합니다.",
  },
];

// 아이콘 매핑, 시안(1907:21536) 4열의 x좌표 순서(Settings 슬라이더, Wallet, Folder,
// Calendar)와 라벨이 1:1 대응함을 재확인했다. 아이콘은 전부 VECTOR(imageRef 0건)이지만 기존
// 200×200 PNG가 투명 배경으로 이미 잘 뽑혀 있고, 시안 프레임에 fill #FFBFBF(분홍) 아트보드
// 배경 잔재가 붙어 있어 재추출하면 분홍 배경이 딸려온다. 그래서 기존 에셋을 재사용한다.
const OUTCOME_ITEMS = [
  { icon: outcomeSkill, label: "탐구 역량 향상" },
  { icon: outcomeWallet, label: "자료 해석력 강화" },
  { icon: outcomeFolder, label: "완성도 높은 결과물" },
  { icon: outcomeCalendar, label: "자기주도 탐구 경험" },
];

// 후기 작성자명, 시안 원본은 "고1 김민△ / 고2 이△은 / 고2 박○석"처럼 마스킹 기호와 마스킹
// 글자 수가 일관되지 않은 placeholder였다. 선례(목표관리・수행평가・자기평가)의 "고N 김OO"
// 표기로 통일했다(신규 카피 아님, 표기만 정정). 카드 노출 순서는 시안 DOM 순서(우, 좌, 중)가
// 아니라 실제 x좌표 기준 좌우 순서다. 인용문 3건은 시안 원문과 문자열 완전 일치.
const TESTIMONIALS = [
  {
    emoji: "😉",
    quote:
      "주제 선정부터 설계, 피드백까지 단계별로 도와주셔서 탐구를 끝까지 마칠 수 있었어요.",
    name: "고1 김OO",
  },
  {
    emoji: "☺️",
    quote:
      "자료 정리와 분석 방법을 안내해줘서 보고서의 논리성이 크게 좋아졌어요.",
    name: "고2 이OO",
  },
  {
    emoji: "😊",
    quote:
      "평가 리포트가 정말 구체적이라 스스로 부족한 부분을 보완할 수 있었어요.",
    name: "고2 박OO",
  },
];

// FAQ, 이전 구현은 "시안(2181:9284)에 답변 레이어가 없다"고 판단해 구 serviceLandingContent.js의
// 답변을 끌어다 썼다. 재실측 결과 답변 정본이 펼침 상태 변형 노드 2181:9318(2181:9332/9339/9346/
// 9353)에 전문으로 존재해 4건 모두 시안 정본으로 교체했다. 시안 답변은 "수행・작성・수집은 학생
// 본인이 한다"는 책임 한계 문구가 4건 중 3건에 들어 있어 카드사 심사/과장광고 관점에서도 구
// 답변보다 안전하다. 질문 4개는 두 노드가 문자열과 순서 모두 동일 = 기존 코드와 일치(변경 없음).
const FAQ_ITEMS = [
  {
    q: "심화탐구 프로그램은 어떤 학생에게 적합한가요?",
    a: "탐구 주제 선정・설계・완성 중 어느 단계에서든 도움이 필요한 학생에게 적합합니다.",
  },
  {
    q: "탐구 설계는 얼마나 자세하게 도와주나요?",
    a: "주제・가설・연구 방법・일정까지 설계서를 함께 구성하며, 실제 탐구 수행과 작성은 학생 본인이 진행합니다.",
  },
  {
    q: "자료 수집은 어디까지 지원되나요?",
    a: "신뢰할 수 있는 자료의 방향과 정리・출처 관리 방법을 안내하며, 수집・해석은 학생이 수행합니다.",
  },
  {
    q: "완성본 평가는 어떤 내용을 확인하나요?",
    a: "탐구 논리, 자료 활용, 구성・표현의 완성도를 기준으로 점검하고 피드백합니다. 제출용 결과물은 학생이 직접 완성합니다.",
  },
];

function HeroSection() {
  // 히어로를 벗어나 스크롤하면 30초 회전을 멈춘다, 서비스 랜딩 4종 + LearningDiagnosisLanding
  // 공통 useInView 훅 구조.
  const [auraRef, auraInView] = useInView() as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];
  const navigate = useNavigate();

  // 히어로 CTA는 인앱 서비스(/app/inquiry)로 직접 이동한다(수행평가 소개 페이지의 HERO_SERVICE
  // 와 같은 방식). 비로그인은 /login 으로 보내 복귀지를 앱 경로로 남긴다. 인앱 서비스라
  // openPaidServiceOrAlert(티켓 발급)는 쓰지 않는다. 실제 접근 통제는 앱 라우트가 맡는다.
  async function handleHeroCta(event?: MouseEvent<HTMLButtonElement>) {
    const access = await getDemoAccessState();
    event?.preventDefault?.();

    if (access === "guest") {
      navigate(`/login?redirect=${encodeURIComponent(INQUIRY_APP_ROUTE)}`);
      return;
    }

    navigate(INQUIRY_APP_ROUTE);
  }

  return (
    // 섹션 패딩(md:pb-0 md:pt-[2.25rem])은 목표관리・수행평가・자기평가 히어로와 동일 규격
    // (4페이지 공통 규격). 이전 구현의 pb-14 pt-10 sm:pb-16 sm:pt-14 단독 조합은 md 이상에서
    // 목업 음수 마진과 충돌해 다음 섹션 pt 계산이 어긋난다.
    <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 md:pb-0 md:pt-9">
      {/* 오라 애니메이션, 이전 구현의 CSS 방사형 그라디언트 2겹(마젠타 0.32를 강하게 섞은 것)을
          폐기하고 시안 정본 벡터(hero-aura.svg = 3248:2356 Eclipse + 3248:2357 Rectangle 29)로
          교체했다. 회전 4프레임(2716:3097/3162/3168/3174)이 0°/90°/180°/270° 등간격 Smart
          Animate라 단일 rotate(0deg 부터 360deg) 루프로 무손실 붕괴된다.

          ⚠ 자기평가 값을 복사하지 말 것 2건:
          (1) 회전 피벗이 Eclipse 중심(800,541)이 아니라 Texture 사각형 중심 (800,600)이다.
              180° 프레임의 중점 역산으로 두 도형이 같은 점에 수렴함을 확인했고, 90°/−90° 8개
              좌표로 교차검증했다. 그래서 SVG viewBox가 "-40 -240 1680 1680"이며(1600 정사각은
              Rect 29 하단 블러 808.69px > 반변 800으로 잘린다) transform-origin은 뷰박스 중심이
              곧 피벗이므로 기본값 50% 50% 그대로 둔다.
          (2) 히어로 합성 프레임(2181:9089)에서 Texture의 상대 y = 0 이다(자기평가는 −230).
              따라서 위치 래퍼는 top-0, 자기평가의 top-[-14.375rem]을 복사하면 오라가 화면
              위로 사라진다.

          바깥 div(auraRef) = 위치 전담(Texture 박스 1600×1200 = 4:3, 1600px = 100rem).
          안쪽 .idr-aura-spin = 회전 전담(viewBox 1680 정사각을 1600×1200 좌표계에 맞춤:
          폭 1680/1600 = 105%, left −40/1600 = −2.5%, top −240/1200 = −20%).
          같은 요소에 위치용 translate와 회전용 rotate를 같이 걸면 rotate가 translate를 덮어써
          가운데 정렬이 깨진다, 반드시 2단으로 분리한다. */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute left-1/2 top-0 aspect-4/3 w-[100rem] max-w-none -translate-x-1/2 select-none"
      >
        <style>{`
          @keyframes idr-aura-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .idr-aura-spin[data-float='on'] {
              animation: idr-aura-spin 30s linear infinite;
              will-change: transform;
            }
          }
        `}</style>
        <div
          className="idr-aura-spin absolute left-[-2.5%] top-[-20%] aspect-square w-[105%]"
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
      {/* 그레인, 회전 래퍼의 형제(밖)에 둔다. transform이 걸린 요소는 새 stacking context를
          만들어 mix-blend-overlay가 섹션 배경(bg-white)을 backdrop으로 못 잡고 그레인이 전면
          노출되는 회귀가 실제로 있었다(수행평가・학습진단 선례). 타일 8.375rem은 시안 Texture의
          imageRef(bcfa0f2e…, 220×220) × scalingFactor 0.609091 = 134px 실측값이며, opacity-40은
          시안(opacity 1 + OVERLAY)보다 옅다, 4페이지 통일값을 우선했다. */}
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${heroGrain})` }}
        className="pointer-events-none absolute inset-0 select-none bg-size-[8.375rem_8.375rem] bg-repeat opacity-40 mix-blend-overlay"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-content flex-col items-center px-5 text-center sm:px-8">
        {/* eyebrow/H1/서브 문단/CTA/목업 폭, 목표관리・수행평가・자기평가와 통일한 4페이지 공통
            규격. 카피 자체는 시안 원문(3163:4724~4728) 그대로다.
            시안 실측 eyebrow 색 #0B84FD는 dev 정본 accent 토큰과 정확히 일치.
            시안 weight는 500이지만 선례 3종이 전부 font-normal이라 선례를 따랐다. */}
        <p className="text-[1.25rem] font-normal leading-[1.6] text-accent sm:text-[1.375rem] md:text-[1.5rem]">
          탐구 설계 프로그램
        </p>

        {/* max-w-160 제거, 시안 H1은 1443px 폭에 강제 개행 없는 1줄인데 40rem(640px)로
            묶으면 데스크톱에서도 억지로 2줄이 된다. */}
        <h1 className="mt-6 break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
          주제 추천부터 탐구 설계까지, 심화탐구를 끝까지
        </h1>

        <p className="mt-6 break-keep text-[1.125rem] font-medium leading-[1.6] text-ink sm:text-[1.25rem] md:text-[1.5rem]">
          탐구의 방향이 막막한 순간, 위닝 심화탐구가 구체적인 길을 제시해 학생이
          스스로 완성하도록 돕습니다
        </p>

        {/* CTA, 시안(3163:4727)은 280×68 / cornerRadius 50(높이 68이라 실효 pill) / 그림자
            visible:false 이지만, 4페이지 CTA 통일을 우선해 선례 규격(max-w-[18.75rem],
            rounded-[1.875rem], 네이비 그림자)을 그대로 쓴다. 클릭 시 심화탐구 앱으로 이동한다
            (handleHeroCta 참고). */}
        <button
          type="button"
          onClick={handleHeroCta}
          className="mt-6 inline-flex h-14 w-full max-w-75 items-center justify-center rounded-[1.875rem] bg-primary px-8 text-base font-semibold text-white shadow-[0_0.625rem_1.5625rem_rgba(1,50,98,0.4)] transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:h-17 sm:text-[1.25rem]"
        >
          지금 시작하기
        </button>

        {/* 브라우저 목업: 새 시안(754:72290)은 목업 안에 주제 추천 화면 캡처를 넣는다.
            프레임 값은 선례 3종과 같은 규격이다. */}
        <ServiceHeroBrowserFrame>
          <img
            src={heroTopics}
            alt="심화탐구 주제 추천 화면"
            className="w-full md:min-h-0 md:flex-1 md:object-cover md:object-top"
            draggable={false}
          />
        </ServiceHeroBrowserFrame>
      </div>
    </section>
  );
}

export default function InDepthResearch() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection />

      {/* 프로세스, 시안 원문은 쉼표 뒤 스페이스 2개(U+0020 ×2)지만 HTML은 연속 공백을
          접으므로 렌더 결과가 같다. 1스페이스를 유지한다(디자인 파일 오타로 판단).
          4열 폭 검산: (1100 − 30×3) / 4 = 252.5px, 시안 331×0.766 = 253.5px ✓ */}
      <ServiceSection className="lg:pt-20" heading="심화탐구, 이렇게 완성돼요">
        <ServiceProcessCards items={PROCESS_STEPS} />
      </ServiceSection>

      {/* 추천 대상, 시안(1907:21472)은 characterStyleOverrides로 "이런 학생에게 "(#525252) +
          "심화 탐구 서비스를 추천해요"(#013262) 2-tone 좌측 정렬이다. 강조 런만 네이비로
          넣는다(자기평가 선례와 동일, accent #0B84FD가 아니라 #013262). 카드 이미지는
          일러스트 PNG라 잘림 없는 imageFit 기본값(contain)을 쓴다. */}
      <ServiceSection
        className="lg:pt-40"
        heading={
          <>
            이런 학생에게{" "}
            <span className="text-primary">심화 탐구 서비스를 추천해요</span>
          </>
        }
      >
        <ServiceAudienceCards items={AUDIENCE_CARDS} />
      </ServiceSection>

      {/* 다섯 단계, 3장 + 2장(중앙 정렬) 배치는 splitLastRow 가 담당한다.
          3열 폭 검산: (1100 − 30×2) / 3 = 346.7px, 시안 453×0.7644 = 346.3px ✓
          (섹션 C의 실 콘텐츠 박스는 프레임 1520이 아니라 카드 행 1439 = 453×3 + 40×2 이다.
           1520은 1920 안에서 좌240/우160 비대칭이라 오토레이아웃 잔재로 판정) */}
      <ServiceSection className="lg:pt-50.5" heading="다섯 단계로 차근차근">
        <ServiceStepCards items={FIVE_STEPS} splitLastRow />
      </ServiceSection>

      {/* 화면 미리보기: 시안 ScreenPreview 인스턴스 754:72387 의 상하 패딩이 80/80 이고 앞
          섹션(다섯 단계)은 하단 패딩 0 이라 pt 80 이다. 뒤 섹션(성과) 상단 172 는 기존
          lg:pt-43 을 그대로 두고 이 섹션이 pb 80 을 가진다. 헤딩 2톤은 시안
          characterStyleOverrides 로 "확인하세요"만 네이비(#013262 = text-primary)다. */}
      <ServiceSection
        className="lg:pt-20 lg:pb-20"
        heading={
          <>
            직접 보고 <span className="text-primary">확인하세요</span>
          </>
        }
      >
        <InDepthResearchScreenPreview />
      </ServiceSection>

      {/* 성과, 시안은 헤더 좌단(x=82823)이 카드 좌단(x=82972.5)보다 149.5px 왼쪽에 매달려
          있으나, 바로 앞 섹션은 헤더/카드 좌단이 정확히 일치하므로 시안 결함으로 판단하고
          헤더 = 카드 = max-w-content 좌단 일치 + 패널 full-width 로 정규화했다. */}
      <ServiceSection className="lg:pt-43" heading="심화탐구로 달라지는 것들">
        <ServiceOutcomesPanel items={OUTCOME_ITEMS} />
      </ServiceSection>

      {/* 후기, 시안 헤딩 색은 #525252지만 페이지 전 섹션이 공유하는 헤딩 정본(#0F172A)을
          유지한다. 3열 폭 검산: (1100 − 46×2) / 3 = 336px, 시안 440×0.766 = 337px ✓ */}
      <ServiceSection
        className="lg:pt-40"
        heading="심화탐구 서비스를 받아본 학생들의 후기"
      >
        <ServiceTestimonials items={TESTIMONIALS} />
      </ServiceSection>

      {/* FAQ, 헤딩 크기는 펼침 보드(2181:9318)만 44px이고 페이지 안 섹션 헤딩은 전부 32px라
          헤딩 정본(32px)을 그대로 쓴다. FAQ 와 푸터 사이는 페이지에서 유일한 배경 전환 경계라 시안
          하단 여백 217px를 ×0.67 축소 없이 그대로 쓴다(lg:pb-[13.5625rem]). */}
      <ServiceSection
        className="pb-20 sm:pb-24 lg:pb-54.25 lg:pt-45"
        heading="자주 묻는 질문"
      >
        <ServiceFaq items={FAQ_ITEMS} />
      </ServiceSection>
    </main>
  );
}
