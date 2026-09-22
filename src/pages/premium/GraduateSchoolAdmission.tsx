import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
  PremiumAcceptanceMarquee,
  PremiumCompareTable,
  PremiumCtaBanner,
  PremiumFocusColumns,
  PremiumHero,
  PremiumNumberedCards,
  PremiumSectionHeading,
} from "@/components/premium";
import { PREMIUM_GRADUATE_ACCEPTANCES } from "@/components/premium/premiumStaticData";
import { buildPhoneSecondaryCta } from "@/lib/premiumContact";

// 대학원입학 프로그램(프리미엄) 랜딩 — /page/premium/graduate-school.
// 대입컨설팅 A/S와 같은 컴포넌트 조합 방식의 코드 페이지(구 CMS DynamicPage 대체).
// 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함). 탭바(PremiumProgramTabs) 없음 —
// 시안에 A/S 같은 프로그램 탭이 없다.

const HERO_BG = "/images/premium/hero-graduate-bg.webp";

// 히어로 방사형 라이트 — 배경이 진초록 3D 타일이라 A/S(밝은 사진 위 흰 라이트)와 반대로
// 어두운 오버레이를 얹어 흰 텍스트 대비를 확보한다(모바일은 object-cover 크롭에 따라 밝은
// 타일 위에 텍스트가 올라갈 수 있어 오버레이가 필수). Tailwind는 완성된 리터럴 클래스만
// 스캔하므로 런타임 조합 금지 — 문자열을 통째로 보관한다.
const HERO_GLOW_CLASS =
  "bg-[radial-gradient(ellipse_at_center,rgba(8,18,14,0.55)_0%,rgba(8,18,14,0.38)_35%,rgba(8,18,14,0.16)_60%,rgba(8,18,14,0)_85%)]";
const HERO_TITLE_CLASS =
  "break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[2rem]";
const HERO_DESCRIPTION_CLASS =
  "mt-4 break-keep text-[1rem] font-medium leading-[1.6] text-white/90 sm:text-[1.25rem] lg:text-[1.5rem]";

const COMPARE_COLUMNS = ["서울대학교", "고려대학교", "연세대학교"];

const COMPARE_ROWS = [
  {
    label: "서류명",
    cells: [
      {
        primary: "자기소개서 및 수학계획서",
        secondary: "전 모집단위 공통 필수",
      },
      {
        primary: "자기소개서 및 수학계획서",
        secondary: "전 모집단위 공통 필수",
      },
      { primary: "학업 및 연구계획서", secondary: "전 과정 필수・최대 3만자" },
    ],
  },
  {
    label: "평가내용",
    cells: [
      { primary: "서류 심사 + 면접·구술고사", secondary: "대다수 모집단위" },
      { primary: "서류전형 + 구술시험", secondary: "전 모집단위 필수" },
      { primary: "서류평가 + 구술시험", secondary: "전 모집단위 필수" },
    ],
  },
  {
    label: "추천서",
    cells: [
      { primary: "일부 단과대학" },
      { primary: "경영·의학 등 일부 학과" },
      { primary: "박사 및 통합과정 필수" },
    ],
  },
];

const COMPARE_FOOTNOTE =
  "・서울대·고려대·연세대는 대표 사례이며, 이 구조는 지방거점국립대·사립대를 포함한 국내 대다수 대학원 입시에 공통적으로 적용됩니다.";

const FOCUS_COLUMNS = [
  {
    title: "자기소개서·학업계획서",
    bullets: [
      "학업동기·연구방향 서술 컨설팅",
      "포트폴리오·연구실적물을 자소서 서사에 반영",
      "연구계획서(리서치 프로포절) 설계 지원",
      "연구주제·논문구성 방향성 및 구조 가이드",
      "지도교수 사전컨택 이메일·타이밍 코칭",
    ],
  },
  {
    title: "면접·구술고사",
    badge: "특허출원 기반 독자 프로그램",
    bullets: [
      "암기가 아닌 답변 설계 프레임워크 학습",
      "포트폴리오·연구실적물 기반 질의응답 준비",
      "전공 지식을 스스로 재구성해 답하는 훈련",
    ],
    note: "일반 학원처럼 답을 외우게 하지 않습니다. 특허출원 10-2024-0048889 학습코칭 시스템에 기반한 답변 설계 프레임워크를 학생이 직접 익히고, 자기 언어로 자연스럽게 답하도록 훈련합니다.",
  },
];

const FOCUS_FOOTNOTES = [
  "・ 포트폴리오·연구실적물 자체는 만들어드리지 않습니다. 그 결과물을 만드는 건 전적으로 학생의 몫입니다.",
  "・ 연구주제·논문구성 가이드는 지원 서류(연구계획서·프로포절) 단계에 한정됩니다. 실제 학위논문이나 학술지 투고 원고를 대신 작성해드리지 않습니다.",
  "・ 지도교수 사전컨택 코칭은 이메일 작성법과 타이밍 전략에 한정됩니다. 교수님과의 관계를 대신 만들어드리거나 중개하지 않습니다.",
];

const SERVICE_CARDS = [
  {
    number: "01",
    title: "자기소개서·학업계획서·연구계획서",
    description:
      "학업동기부터 연구 방향까지, 서류의 논리와 서사를 함께 설계합니다.",
  },
  {
    number: "02",
    title: "특허출원 기반 면접 프레임워크",
    description:
      "암기가 아닌 답변 설계 훈련으로 어떤 질문에도 자기 언어로 답합니다.",
  },
  {
    number: "03",
    title: "포트폴리오·연구실적물 활용",
    description:
      "학생이 만든 결과물을 서류와 면접의 가장 강한 재료로 녹여냅니다.",
  },
];

const SIMULTANEOUS_CARDS = [
  {
    number: "01",
    title: "강점 진단",
    description:
      "학부 시절 흩어져 있던 연구 경험을 분석해 하나로 관통하는 연구 정체성으로 재정리",
  },
  {
    number: "02",
    title: "학교별 차별화 전략",
    description:
      "지원 대학 각각의 교육 목표·강점에 맞춰 지원동기 문단을 다르게 설계",
  },
  {
    number: "03",
    title: "연구계획서 방법론 구체화",
    description:
      "계량기법(사건사분석·로짓/프로빗·DID·IV)을 관심 주제에 맞춰 구체화 코칭",
  },
  {
    number: "04",
    title: "다회차 첨삭·요강별 검증",
    description:
      "초안부터 최종본까지 반복 첨삭, 학교별 글자수·서식 요건 개별 조정",
  },
];

export default function GraduateSchoolAdmission() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumHero
        title={
          <>
            서울대든 연세대든 고려대든,
            <br />
            결국 갈리는 건 자소서·계획서·면접입니다
          </>
        }
        description="서울대·연세대·고려대뿐 아니라, 국내 대학원 어디든 마찬가지입니다. 위닝에듀는 자기소개서·학업계획서(연구계획서 포함)·면접, 이 영역에 집중합니다."
        cta={{ label: "상담 신청하기", to: "/premium-apply" }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
        titleClassName={HERO_TITLE_CLASS}
        descriptionClassName={HERO_DESCRIPTION_CLASS}
      />

      <section className={PREMIUM_SECTION_PADDING_CLASS}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <PremiumSectionHeading
            heading="3개 대학 요강을 비교하면, 공통점이 보입니다"
            sub="서류명과 요건은 다르지만, 평가 구조는 같습니다."
          />
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumCompareTable
              columns={COMPARE_COLUMNS}
              rows={COMPARE_ROWS}
              footnote={COMPARE_FOOTNOTE}
            />
          </div>
          <p className="mt-10 break-keep text-center text-[1rem] font-semibold leading-[1.6] text-ink-strong sm:text-[1.125rem]">
            서류명과 세부요건은 학교·학과마다 다르지만, ① 학업·연구계획서로
            방향성을 증명하고 ② 구술고사로 이를 실제 검증받는다는 2단계 구조는
            3개교 모두 동일합니다.
          </p>
        </div>
      </section>

      <PremiumFocusColumns
        heading="위닝에듀는 이 2가지에만 집중합니다"
        sub="모든 것을 다 해준다고 말하지 않습니다. 학생이 이미 가지고 있는 포트폴리오·연구실적물을 재료 삼아, 어느 대학원을 가든 반드시 거치는 서류와 면접에 녹여냅니다."
        columns={FOCUS_COLUMNS}
        footnotes={FOCUS_FOOTNOTES}
      />

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <PremiumSectionHeading
            heading="위닝에듀만의 서비스"
            sub="지원할 학교의 선발 구조를 기준으로 준비 전략을 설계합니다."
          />
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={SERVICE_CARDS} />
          </div>
        </div>
      </section>

      <PremiumAcceptanceMarquee
        heading="2026년 지원자 전원합격"
        universities={PREMIUM_GRADUATE_ACCEPTANCES}
      />

      <section className={PREMIUM_SECTION_PADDING_CLASS}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
            <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[1.75rem] lg:shrink-0 lg:text-[2rem]">
              동시 합격 사례
            </h2>
            <span
              aria-hidden="true"
              className="hidden h-auto w-px self-stretch bg-line sm:block"
            />
            <p
              className={`break-keep text-[0.9375rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS} sm:text-[1rem]`}
            >
              경제학 전공으로 서울대·고려대·연세대·성균관대 경제학과에 동시
              합격한 실제 사례입니다. 위닝에듀가 어떤 과정으로 지도했는지를
              그대로 보여드립니다.
            </p>
          </div>
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={SIMULTANEOUS_CARDS} />
          </div>
        </div>
      </section>

      <PremiumCtaBanner
        title={
          <>
            대학원 입시의 승부처,
            <br />
            자소서·계획서·면접부터 준비하세요
          </>
        }
        sub="평일·주말 10:00~22:00 (주말 상담 가능)"
        cta={{ label: "이용 신청하기", to: "/premium-apply" }}
        secondaryCta={buildPhoneSecondaryCta()}
        variant="light"
        primaryTone="brand"
      />
    </main>
  );
}
