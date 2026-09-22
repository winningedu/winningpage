import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_HEADING_DARK_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
  PremiumConcernSection,
  PremiumCtaBanner,
  PremiumHero,
  PremiumMentorReviews,
  PremiumNumberedCards,
  PremiumSectionHeading,
} from "@/components/premium";
import { buildPhoneSecondaryCta } from "@/lib/premiumContact";

// 해외명문대 진학컨설팅(프리미엄) 랜딩 — /page/premium/global-university.
// 대입컨설팅 A/S·대학원입학과 같은 컴포넌트 조합 방식의 코드 페이지(구 CMS DynamicPage 대체).
// 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함). 탭바(PremiumProgramTabs) 없음,
// 대학 마퀴·비교표 없음 — 시안에 없다.

const HERO_BG = "/images/premium/hero-overseas-bg.webp";

// 히어로 라이트 — 다른 프리미엄 히어로(A/S/대학원입학)는 전부 중앙정렬+타원 라이트지만,
// 이 시안은 좌측정렬 텍스트라 PremiumHero align="left"가 이 클래스를 absolute inset-0 배경
// 오버레이로 얹는다. 좌→우로 어두워지는 그라디언트라 텍스트가 앉는 왼쪽은 진하게 가려주고
// 오른쪽(건물 파사드)은 그대로 보인다. Tailwind는 완성된 리터럴 클래스만 스캔하므로
// 런타임 조합 금지 — 문자열을 통째로 보관한다.
const HERO_GLOW_CLASS =
  "bg-gradient-to-r from-black/75 via-black/45 to-transparent";
const HERO_TITLE_CLASS =
  "break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[2rem]";
const HERO_DESCRIPTION_CLASS =
  "mt-4 break-keep text-[1rem] font-medium leading-[1.6] text-white/90 sm:text-[1.125rem] lg:text-[1.25rem]";
// 시안 실측: 흰 배경 사각 버튼 + 네이비(--primary, #013262) 텍스트 — 다른 히어로의
// ink-strong pill과 다른 전용 스타일이라 ctaClassName으로 전체 override한다.
const HERO_CTA_CLASS =
  "mt-8 inline-flex items-center justify-center rounded-sm bg-white px-[3rem] py-[1.25rem] text-[1.125rem] font-semibold text-primary transition-colors hover:bg-white/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none";

const CONCERN_CARDS = [
  {
    label: "🤔 고민 포인트 01",
    description: "수행평가에 과제까지, 뭐부터 챙겨줘야 할지 모르겠어요.",
  },
  {
    label: "🤔 고민 포인트 02",
    description: "AP·IB 수업도 벅차 보이는데, 어떻게 도와줘야 할까요?",
  },
  {
    label: "🤔 고민 포인트 03",
    description: "진로에 맞는 비교과 활동, 뭘 시켜야 할지 감이 안 와요.",
  },
  {
    label: "🤔 고민 포인트 04",
    description: "국제학교 입시는 물어볼 데도 없고 정보도 너무 부족해요.",
  },
];

const CONCERN_STEPS: [
  { number: string; text: string },
  { number: string; text: string },
] = [
  {
    number: "01",
    text: "학교 생활부터 진학 전략까지, 멘토링으로 서포트합니다.",
  },
  {
    number: "02",
    text: "1:1 맞춤형 솔루션과 다년간의 노하우를 모두 담았습니다.",
  },
];

const MANAGEMENT_CARDS = [
  {
    number: "01",
    title: "수행평가 & 과제 지도",
    description:
      "학교 커리큘럼과 학생 수준을 분석해 수행평가·과제를 관리하고, 학습 시간을 확보하는 전략 수립",
  },
  {
    number: "02",
    title: "AP · IB · SAT 학습 전략 설계",
    description:
      "수업을 따라가는 수준을 넘어, 지원 전공·목표 대학 기준에 맞춘 과목 조합과 응시 시점 설계",
  },
  {
    number: "03",
    title: "Common App 에세이 첨삭",
    description:
      "지원서 에세이의 주제 선정부터 구조 설계·문장 첨삭까지 밀착 지도",
  },
  {
    number: "04",
    title: "진로 기반 교과 · 비교과 활동 가이드",
    description:
      "진로 방향에 맞춘 교내외 대회·프로젝트·봉사 등 Extracurricular 활동 설계·관리",
  },
  {
    number: "05",
    title: "미국 명문대 입시 맞춤 컨설팅",
    description:
      "지원 리스트 확정·ED/EA/RD 전략·원서 제출까지, 입학 시점 기준 역산 관리",
  },
];

const MANAGEMENT_FOOTNOTE =
  "에세이는 주제 선정·구조 설계·첨삭을 지도하며, 작성은 전적으로 학생 본인이 진행합니다. 비교과 활동은 설계와 연계를 코칭하며, 활동 수행은 전적으로 학생의 몫입니다.";

const STEP_CARDS = [
  {
    number: "01",
    title: "프로그램 제작",
    description: "학생 수준·커리큘럼 진단 후 개인 프로그램 제작",
  },
  {
    number: "02",
    title: "전략 수립",
    description: "수행평가·과제 서포팅으로 학습 시간 확보 전략 수립",
  },
  {
    number: "03",
    title: "비교과 서포트",
    description: "교외 대회·프로젝트 등 Extracurricular 활동 설계",
  },
  {
    number: "04",
    title: "모의평가",
    description: "실전처럼 진행하는 모의 평가 피드백",
  },
  {
    number: "05",
    title: "멘토스",
    description: "미 명문대 재학·졸업 멘토가 직접 관리",
  },
  {
    number: "06",
    title: "대입 에세이",
    description: "에세이 첨삭 및 원서 준비",
  },
];

// 3명 모두 "위닝 14기 졸업생 OOO 멘토" 인용 라벨은 시안 원문 그대로다(실명이 아닌
// 자리표시자 "OOO"도 시안 그대로 유지 — 확정 카피가 아니라는 신호로 보이지만 임의로
// 채우지 않는다).
const MENTOR_REVIEWS = [
  {
    name: "박민정",
    photo: "/images/premium/mentor-overseas-park-minjeong.webp",
    quote:
      "위닝에듀의 체계적인 지원을 통해 이룬 제주국제학교에서의 빠른 적응과 안정적인 성적은 제게 미국 유학으로의 자신감을 가지게 해주었고, 원장님과의 지속적인 소통을 바탕으로 정의와 공공 서비스에 대한 저의 열정을 세계적인 로펌 Dentons에서의 인턴십으로 연결해낼 수 있었습니다.",
    attribution: "- 위닝 14기 졸업생 OOO 멘토",
    tags: [
      "제주국제학교 졸업",
      "Lake Forest Academy 졸업",
      "Syracuse University Pre-Law 합격",
      "Dentons (글로벌 로펌) 인턴",
    ],
  },
  {
    name: "박서정",
    photo: "/images/premium/mentor-overseas-park-seojeong.webp",
    quote:
      "뉴욕대학교 입시를 준비하면서 '전공 선택', '지원 전략', '나만의 강점을 어떻게 드러낼지'에 대한 고민의 끝에는 늘 진심을 다해 저를 생각하고 방향을 제시해주셨던 위닝에듀 원장님이 계셨습니다. 흔들릴 때마다 상담을 통해 진로에 대한 확신을 얻었고, 지원서 작성부터 학업 설계까지 필요했던 모든 도움을 얻을 수 있었습니다.",
    attribution: "- 위닝 14기 졸업생 OOO 멘토",
    tags: [
      "뉴욕대(NYU) 경제학과",
      "조기(3년) 졸업",
      "서울대 경제학과 석박사과정",
    ],
  },
  {
    name: "한정원",
    photo: "/images/premium/mentor-overseas-han-jeongwon.webp",
    quote:
      "카네기 멜런 대학교(CMU)에서 전기 및 컴퓨터 공학을 전공하며 프로그래밍과 머신러닝 과목 조교(TA)로 5학기 동안 활동했습니다. 4학기 연속 Dean's List에 오르며 증명한 학업 역량과 아마존 SDE 인턴 등의 실무 준비 과정을 통해 활용되는 배우고 성장하는 공부를 익혀 왔습니다. 단순한 지식 전달을 넘어 학생 스스로 사고하는 힘을 통해 성장의 발판을 마련할 수 있도록 든든한 선배로서 함께 하겠습니다.",
    attribution: "- 위닝 14기 졸업생 OOO 멘토",
    // 시안 그대로 넣지만, CMU/전기·컴퓨터공학 멘토에 NYU 경제학과 태그는 앞선 박서정
    // 카드와 동일해 복붙 흔적으로 보인다 — 보고 시 플래그.
    tags: [
      "뉴욕대(NYU) 경제학과",
      "조기(3년) 졸업",
      "서울대 경제학과 석박사과정",
    ],
  },
];

export default function GlobalUniversityConsulting() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumHero
        align="left"
        title="국제학교 학생을 위한 미국 명문대 진학 컨설팅"
        description={
          <>
            제주 국제학교 출신의 미 명문대 재학·졸업 멘토와 함께,
            <br />
            수행평가부터 진로 설계까지 - 국제학교 학생에게 꼭 맞춘 컨설팅을
            시작하세요
          </>
        }
        cta={{ label: "상담 신청하기", to: "/premium-apply" }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
        titleClassName={HERO_TITLE_CLASS}
        descriptionClassName={HERO_DESCRIPTION_CLASS}
        ctaClassName={HERO_CTA_CLASS}
      />

      <PremiumConcernSection
        heading="국제학교 학부모님의 깊어져만 가는 고민"
        cards={CONCERN_CARDS}
        pillText="국제학교는 다릅니다. 정확한 방향과 실전 전략이 필요합니다."
        goldPhrase="정확한 방향과 실전 전략"
        steps={CONCERN_STEPS}
      />

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <PremiumSectionHeading
            heading="합격까지, 이 5가지로 관리합니다"
            sub="학생의 현재 수준부터 원서 제출까지, 전 과정을 설계합니다"
          />
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={MANAGEMENT_CARDS} />
          </div>
          <p
            className={`mt-6 break-keep text-right text-[0.75rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
          >
            {MANAGEMENT_FOOTNOTE}
          </p>
        </div>
      </section>

      <section
        className={`${PREMIUM_DARK_SECTION_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
      >
        <div className={PREMIUM_CONTAINER_CLASS}>
          <h2 className={PREMIUM_SECTION_HEADING_DARK_CLASS}>
            6단계로 컨설팅이 진행됩니다
          </h2>
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={STEP_CARDS} tone="dark" />
          </div>
        </div>
      </section>

      <PremiumMentorReviews
        heading="같은 길을 먼저 걸어간 멘토가 이끕니다"
        mentors={MENTOR_REVIEWS}
      />

      <PremiumCtaBanner
        title={<>&quot;The next chapter is yours — are you ready?&quot;</>}
        sub="1:1 상담을 통해, 목표에 맞는 진학 전략을 체계적으로 설계해 드립니다. 학생의 현재 상황 진단에서 부담 없이 시작하세요."
        cta={{ label: "이용 신청하기", to: "/premium-apply" }}
        secondaryCta={buildPhoneSecondaryCta()}
        variant="light"
      />
    </main>
  );
}
