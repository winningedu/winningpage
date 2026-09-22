import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
  PremiumCtaBanner,
  PremiumDarkTargetSection,
  PremiumEnglishColumns,
  PremiumHero,
  PremiumNumberedCards,
  PremiumNumberedList,
  PremiumSectionHeading,
} from "@/components/premium";
import { buildPhoneSecondaryCta } from "@/lib/premiumContact";

// 국제・해외고 국내대 입학컨설팅(프리미엄) 랜딩 — /page/premium/returning-student.
// 대입컨설팅 A/S·대학원입학·해외명문대·특목고입학과 같은 컴포넌트 조합 방식의 코드 페이지
// (구 CMS DynamicPage 대체). 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함).
// 탭바(PremiumProgramTabs) 없음, 대학 마퀴·비교표 없음 — 시안에 없다.
//
// ⚠️ 플래그: 이 콘텐츠가 담긴 Figma 프레임명은 "국제학교 학습관리"였지만, 내용은 명백히
// 해외고 졸업(예정)자의 국내 대학 수시·특례·편입 컨설팅이다. navigation.ts 실측 결과
// "국제・해외고 국내대 입학컨설팅" 메뉴 항목의 슬러그(returning-student)가 이 콘텐츠와
// 일치해 그 라우트로 구현한다. "국제학교 학습관리"는 별도 메뉴(international-school)로
// 이 페이지와 무관하다 — 프레임명을 그대로 믿고 international-school에 연결하면 안 된다.

const HERO_BG = "/images/premium/hero-returning-student-bg.webp";
// 해외명문대/특목고입학과 같은 방식 — 사진 위 좌→우 다크 그라디언트 + 흰 텍스트.
const HERO_GLOW_CLASS =
  "bg-gradient-to-r from-black/70 via-black/45 to-transparent";
const HERO_TITLE_CLASS =
  "break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[2rem]";
// description은 배경색을 지정하지 않는다 — 아래 페이지 JSX가 gold 강조 줄과 흰 줄을
// 직접 span으로 조합해 넘기므로, 여기서 공통 색을 입히면 gold 줄까지 덮어써 버린다.
const HERO_DESCRIPTION_CLASS =
  "mt-4 break-keep text-[1rem] font-medium leading-[1.6] sm:text-[1.125rem] lg:text-[1.25rem]";
// 시안 실측: 흰 배경 사각 버튼 + 네이비(--primary) 텍스트 — 특목고입학/해외명문대와 동일.
const HERO_CTA_CLASS =
  "mt-8 inline-flex items-center justify-center rounded-sm bg-white px-[3rem] py-[1.25rem] text-[1.125rem] font-semibold text-primary transition-colors hover:bg-white/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none";

// 이 페이지 전용 — 흰 섹션 헤딩이 기본 text-ink-strong 대신 네이비(--color-primary,
// #013262)다(시안 픽셀 실측). 다른 프리미엄 페이지와 다른 위계라 여기서만 override한다.
const NAVY_HEADING_CLASS =
  "break-keep text-center text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-primary sm:text-[1.75rem] lg:text-[2rem]";

const TARGET_ITEMS = [
  {
    number: "01",
    title: "해외 고등학교 졸업(예정)자",
    desc: "수시·특례 지원 자격과 전략을 함께 설계합니다",
  },
  {
    number: "02",
    title: "국내외 고교 이중 이수자",
    desc: "이수 이력에 따라 달라지는 전형 요건을 정리해드립니다",
  },
  {
    number: "03",
    title: "초·중·고 중 3년 이상 해외 이수자",
    desc: "재외국민 특례전형 자격 진단부터 시작합니다",
  },
  {
    number: "04",
    title: "해외대학 재학생으로 한국대학교 편입 희망자",
    desc: "해외 학점·이력을 편입 전형에 맞게 재구성합니다",
  },
  {
    number: "05",
    title: "수시/특례전형 대비가 필요한 모든 해외고 출신",
    desc: "재학생·졸업생 모두 시점에 맞는 로드맵을 제공해드립니다",
  },
];

const DIFFERENCE_CARDS = [
  {
    number: "01",
    title: "국내·해외 동시 설계",
    description: "수시·특례·편입을 한 번에 고려한 해외고 전용 전략",
  },
  {
    number: "02",
    title: "합격 데이터 기반",
    description: "유사한 합격 사례를 분석해 세운 검증된 전략",
  },
  {
    number: "03",
    title: "비교과·서류 관리",
    description: "활동·보고서·이력까지 챙기는 서류 관리 시스템",
  },
  {
    number: "04",
    title: "선배 1:1 멘토링",
    description: "방향을 함께 만들어가는 명문대 선배 멘토링",
  },
  {
    number: "05",
    title: "1:1 맞춤형 시스템",
    description: "학생마다 다르게 설계되는 개인 맞춤형 프로그램",
  },
  {
    number: "06",
    title: "24시간 전 과정 밀착관리",
    description: "시작부터 합격까지 곁을 지키는 전담관리",
  },
];

const ENGLISH_COLUMNS = [
  {
    title: "Comprehensive Admissions Strategy",
    description:
      "학생부종합 + 특례 + 편입 전형까지 아우르는 개인 맞춤 프로그램",
  },
  {
    title: "University Match & Strategy Planning",
    description: "대학별 특성과 학생의 현재 스펙을 함께 고려한 지원 전략",
  },
  {
    title: "Global Alumni Mentorship",
    description: "국제학교·해외고 출신 합격 선배의 1:1 전담 멘토링",
  },
  {
    title: "Early College Prep",
    description: "국제학교·해외고 재학 시점부터 미리 시작하는 대입 준비",
  },
];

const PLAN_STEPS = [
  {
    number: "01",
    title: "입시 진단 및 초기 설계",
    desc: [
      "성적표·이수과목·활동 이력을 종합 분석해 현재 위치 진단",
      "설문·심층 인터뷰로 전공 관심과 진로 방향 도출",
      "지원 가능한 전형을 파악하여 합격까지의 로드맵 설계",
    ],
  },
  {
    number: "02",
    title: "비교과 정리 및 CV(학생이력서)",
    desc: [
      "인턴십·프로젝트·자격증 등 흩어진 활동을 입시 강점으로 재구성",
      "입학사정관이 주목하는 이력서(CV)로 문서화",
    ],
  },
  {
    number: "03",
    title: "목표 대학·학과 설정",
    desc: [
      "전공·성적·자격요건을 분석해 지원 가능 대학 선별",
      "상향·적정·안정으로 나눈 전략적 지원 라인 구성",
      "전형별 마감·면접·서류 요건을 한눈에 정리한 맞춤표 제공",
    ],
  },
  {
    number: "04",
    title: "생기부 대체 서식 및 제출 서류",
    desc: [
      "학생부종합전형에서 통하는 수시 서류 완성",
      "특례·편입 전형에 맞춰 서류를 개별 설계",
    ],
  },
  {
    number: "05",
    title: "1:1 면접 준비",
    desc: [
      "지원 전형별 면접 유형과 핵심 질문 분석",
      "실전처럼 진행하는 1:1 모의면접 진행",
    ],
  },
];

export default function ReturningStudentAdmission() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumHero
        align="left"
        title={
          <>
            해외에서 자란 우리 아이,
            <br />
            국내 대학 진학의 정답을 설계합니다
          </>
        }
        description={
          <>
            <span className="block text-gold">
              해외고 졸업생을 위한 수시·특례·편입 맞춤 프로그램
            </span>
            <span className="mt-2 block text-white/90">
              낯선 국내 입시의 막막함을, 진단부터 서류·면접·합격까지 전담
              컨설턴트가 &apos;확신&apos;으로 바꿔드립니다.
            </span>
          </>
        }
        cta={{ label: "상담 신청하기", to: "/premium-apply" }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
        titleClassName={HERO_TITLE_CLASS}
        descriptionClassName={HERO_DESCRIPTION_CLASS}
        ctaClassName={HERO_CTA_CLASS}
      />

      <PremiumDarkTargetSection
        heading={
          <>
            이런 학생이라면,
            <br />
            <span className="text-gold">지금 시작하세요</span>
          </>
        }
        sub="다섯 가지 유형 중 하나라도 해당된다면, 해외고 전용 전략이 필요한 시점입니다."
        items={TARGET_ITEMS}
      />

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <PremiumSectionHeading
            heading="성적표도, 전형도, 서류도 국내와 전부 다릅니다"
            sub="해외고 학생에게 필요한 건 더 많은 스펙이 아니라, 이미 가진 해외 경험을 입시 서류의 언어로 바꾸는 전략입니다."
            headingClassName={NAVY_HEADING_CLASS}
          />
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={DIFFERENCE_CARDS} />
          </div>
        </div>
      </section>

      <PremiumEnglishColumns
        heading="합격은 기본, 클래스가 다른 컨설팅"
        headingClassName={NAVY_HEADING_CLASS}
        columns={ENGLISH_COLUMNS}
      />

      <PremiumNumberedList
        heading="합격을 향한 가장 정확한 플랜"
        sub="진단에서 모의 면접까지, 다섯 단계로 설계된 입시 지원 프로그램 과정입니다"
        items={PLAN_STEPS}
        headingClassName={NAVY_HEADING_CLASS}
      />

      <PremiumCtaBanner
        eyebrow="Study Abroad, Win Home"
        title="해외에서의 시간이 합격의 근거가 되도록"
        sub="평일·주말 10:00~22:00 (주말 상담 가능)"
        cta={{ label: "이용 신청하기", to: "/premium-apply" }}
        secondaryCta={buildPhoneSecondaryCta()}
        variant="light"
      />
    </main>
  );
}
