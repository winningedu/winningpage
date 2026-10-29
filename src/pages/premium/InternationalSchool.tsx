import {
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
  PremiumHero,
  PremiumMappingPanel,
  PremiumNumberedCards,
  PremiumSectionHeading,
  PremiumVennDuo,
} from "@/components/premium";

// 국제학교 학습관리(프리미엄) 랜딩 - /page/premium/international-school.
// 해외명문대 진학컨설팅과 같은 "PremiumHero 후 섹션 조합" 구조의 코드 페이지다.
// 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함). 탭바와 SEO meta 는 두지 않는다.
// 카피는 고객 제공 원문을 옮기되, 가운뎃점과 화살표는 쉼표와 말로 풀었다.

// 전용 히어로 사진(1415x971). 인물이 가로 중앙에 있어 기본 object-position 으로도
// 모바일 세로 크롭에서 얼굴이 잘리지 않는다.
const HERO_BG = "/images/premium/hero-international-school.webp";
const HERO_GLOW_CLASS =
  "bg-gradient-to-r from-black/75 via-black/45 to-transparent";
const HERO_TITLE_CLASS =
  "break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[2rem]";
const HERO_DESCRIPTION_CLASS =
  "mt-4 break-keep text-[1rem] font-medium leading-[1.6] text-white/90 sm:text-[1.125rem] lg:text-[1.25rem]";
const HERO_EYEBROW_CLASS =
  "mb-2 block text-[1rem] font-semibold tracking-[0.04em] text-gold sm:text-[1.125rem]";
const HERO_CTA_CLASS =
  "mt-8 inline-flex items-center justify-center rounded-sm bg-white px-[3rem] py-[1.25rem] text-[1.125rem] font-semibold text-primary transition-colors hover:bg-white/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none";

const EYEBROW_CLASS =
  "mb-3 break-keep text-center text-[0.875rem] font-semibold uppercase leading-[1.4] tracking-[0.08em] text-gold";
const CHIP_CLASS =
  "rounded-full border border-line bg-white px-4 py-2 text-[0.875rem] font-medium leading-[1.4] text-ink-strong";
const BODY_CLASS = "break-keep text-[1rem] leading-[1.7] text-ink";

const MAP_URL = "https://map.naver.com/v5/entry/place/1834412694";

const INTRO_CHIPS = ["교과 세특", "창의적 체험활동", "학종 면접"];

const MAPPING_ROWS = [
  { from: "수업 프로젝트, 에세이", to: "교과 세부능력 및 특기사항" },
  { from: "클럽, 학생회", to: "동아리활동, 자율활동" },
  { from: "리서치, 탐구 주제", to: "진로활동" },
  { from: "전공 관련 독서", to: "독서활동" },
];

const TARGET_STUDENTS = [
  { number: "01", text: "상위권 대학과 의약학 계열을 목표로 하는 학생" },
  {
    number: "02",
    text: "제주 국제학교 재학 중 국내대학 제출용 생기부를 준비하는 학생",
  },
  {
    number: "03",
    text: "국제학교의 교과와 비교과 활동을 완성도 높은 생기부로 옮겨야 하는 학생",
  },
];

const QNA_CHIPS = ["수업 방식", "수행평가", "비교과 활동"];

const REASON_CARDS = [
  {
    number: "01",
    title: "입시의 방향이 다릅니다",
    description:
      "생기부 양식은 국내 고교와 같지만, 국제학교의 수업 방식과 평가 내용은 한국 입시와 거리가 있습니다. 그 간극은 교사와 학생 모두에게 부담이 됩니다.",
  },
  {
    number: "02",
    title: "세특 기재가 까다롭습니다",
    description:
      "일반고와 다르게 운영되는 수행평가는 세특으로 옮기기 어렵고, 내용을 채우더라도 국내 입시 기준과 어긋날 위험이 있습니다.",
  },
  {
    number: "03",
    title: "활동의 일관성이 흐려지기 쉽습니다",
    description:
      "상위권 대학은 전공적합성을 봅니다. 자율, 동아리, 진로, 독서 활동이 하나의 흐름으로 이어지지 않으면 평가요소를 충족하기 어렵습니다.",
  },
  {
    number: "04",
    title: "비교과 관리에 공백이 생깁니다",
    description:
      "국내대학 전문 입시 카운슬링이 없는 환경에서는 비교과 활동을 체계적으로 기록하고 관리할 방법이 부족합니다.",
  },
];

const PROGRAM_CHIPS = ["SKY", "의약학계열", "국내 상위권 대학"];

const PROGRAM_CARDS = [
  {
    number: "01",
    title: "세특 키워드 설계",
    description: "자율, 진로, 동아리, 독서 활동 설계 및 코칭",
  },
  {
    number: "02",
    title: "수행평가 결과의 진학 중심 재해석",
    description: "수업 평가를 입시와 연결하여 전략적 방향성 제시",
  },
  {
    number: "03",
    title: "1:1 피드백과 작성 가이드",
    description:
      "과목별 수행평가에서 진로 연계, 세특 연결까지 이어지는 플랜 가이드",
  },
  {
    number: "04",
    title: "학종 면접 대비 & 전략 컨설팅",
    description: "커뮤니케이션, 포트폴리오 컨설팅",
  },
];

const VENN_LEFT = {
  eyebrow: "DESIGN",
  title: "설계",
  items: [
    "교과활동 상담 분석 및 세특 키워드 설정",
    "자율, 진로, 동아리, 독서 활동 기획",
    "과목별 수행평가 전략",
  ],
};
const VENN_RIGHT = {
  eyebrow: "COACHING",
  title: "실행",
  items: [
    "개인 피드백 및 작성 가이드",
    "커뮤니케이션 전략 컨설팅",
    "학종 면접 대비",
  ],
};

const CONSULTING_CALLOUT =
  "'위닝'은 수행평가부터 면접까지, 끝까지 완성한다는 뜻입니다.";

const PLAN_STEPS = [
  {
    number: "STEP 01",
    title: "과목별 수행평가",
    description: "과목별 평가 일정과 주제 분석",
  },
  {
    number: "STEP 02",
    title: "진로 연계",
    description: "희망 전공과 탐구 주제 연결",
  },
  {
    number: "STEP 03",
    title: "세특 연결 플랜",
    description: "기재 키워드로 세특 완성",
  },
];

function ChipList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className={CHIP_CLASS}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function InternationalSchool() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumHero
        align="left"
        title={
          <>
            <span className={HERO_EYEBROW_CLASS}>국제학교 학습관리 서비스</span>
            국내대학 진학,
            <br />
            제주에서도 가능합니다
          </>
        }
        description="국제학교의 배움을 국내대학이 읽는 언어로 담아내야 합니다"
        cta={{ label: "상담 신청하기", to: "/premium-apply" }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
        titleClassName={HERO_TITLE_CLASS}
        descriptionClassName={HERO_DESCRIPTION_CLASS}
        ctaClassName={HERO_CTA_CLASS}
      />

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <p className={EYEBROW_CLASS}>International School Care</p>
          <PremiumSectionHeading heading="국제학교의 배움을, 국내대학이 읽는 언어로" />
          <div
            className={`${PREMIUM_HEADING_GAP_CLASS} grid gap-8 lg:grid-cols-2 lg:gap-12`}
          >
            <div>
              <p className="break-keep text-[1.25rem] font-semibold leading-[1.5] text-ink-strong">
                국내 상위권 대학 진학의 핵심은{" "}
                <span className="text-primary">학생부종합전형</span>입니다.
              </p>
              <p className={`mt-4 ${BODY_CLASS}`}>
                학종의 승부는 국제학교에서 쌓은 수업과 활동을 생활기록부에
                얼마나 정확하게 담아내느냐에 달려 있습니다. 교과와 비교과 활동
                설계부터 관리 코칭, 면접까지 진학의 과정을 함께합니다.
              </p>
              <ChipList items={INTRO_CHIPS} />
            </div>
            <PremiumMappingPanel
              title="국내대학 제출용"
              fromLabel="국제학교 활동"
              toLabel="생활기록부 항목"
              rows={MAPPING_ROWS}
              footer={
                <>
                  모든 기록을{" "}
                  <span className="text-primary">하나의 전공 스토리</span>로
                  연결합니다.
                </>
              }
            />
          </div>

          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <h3 className="break-keep text-center text-[1.25rem] font-semibold leading-[1.4] text-ink-strong sm:text-[1.5rem]">
              이런 학생에게 필요합니다
            </h3>
            <ol className="mt-8 grid gap-4 lg:grid-cols-3">
              {TARGET_STUDENTS.map((item) => (
                <li
                  key={item.number}
                  className="flex flex-col border border-line bg-white px-8 py-7"
                >
                  <span className="text-[1.5rem] font-semibold leading-[1.4] text-gold">
                    {item.number}
                  </span>
                  <span
                    className="mt-3 h-[0.09375rem] w-8 bg-gold opacity-60"
                    aria-hidden="true"
                  />
                  <p className={`mt-4 ${BODY_CLASS}`}>{item.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        className={`${PREMIUM_BEIGE_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
      >
        <div className={PREMIUM_CONTAINER_CLASS}>
          <PremiumSectionHeading heading="제주국제학교 학생의 국내대학 진학, 왜 어려운가요?" />
          <div className="mx-auto mt-8 max-w-[46rem] text-center">
            <h3 className="break-keep text-[1.25rem] font-semibold leading-[1.4] text-primary">
              국내 대학 입시와 큰 차이가 있기 때문입니다
            </h3>
            <p className={`mt-3 ${BODY_CLASS}`}>
              국제학교의 커리큘럼과 생활기록부 운영 방식은 국내 대학 입시와 큰
              차이가 있어, 진로 설정과 세특(세부능력 및 특기사항) 작성이 쉽지
              않습니다.
            </p>
            <div className="flex justify-center">
              <ChipList items={QNA_CHIPS} />
            </div>
          </div>
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={REASON_CARDS} />
          </div>
        </div>
      </section>

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <p className={EYEBROW_CLASS}>Program</p>
          <PremiumSectionHeading
            heading="제주 국제학교 학생을 위한 국내대학 맞춤 프로그램"
            sub="의약학계열을 비롯한 국내 상위권 대학 진학을 목표로 하는 학생을 위해 전 과정을 밀착 관리하고 코칭합니다."
          />
          <div className="mt-6 flex justify-center">
            <ul className="flex flex-wrap justify-center gap-2">
              {PROGRAM_CHIPS.map((chip) => (
                <li key={chip} className={CHIP_CLASS}>
                  {chip}
                </li>
              ))}
            </ul>
          </div>
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={PROGRAM_CARDS} />
          </div>
        </div>
      </section>

      <section
        className={`${PREMIUM_BEIGE_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
      >
        <div className={PREMIUM_CONTAINER_CLASS}>
          <p className={EYEBROW_CLASS}>Consulting</p>
          <PremiumSectionHeading heading="국제학교 학생의 국내대학 진학 맞춤 컨설팅" />
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumVennDuo
              left={VENN_LEFT}
              right={VENN_RIGHT}
              center="FROM JEJU TO SKY"
            />
          </div>
          <p className="mt-8 break-keep text-center text-[1.125rem] font-semibold leading-[1.5] text-primary">
            {CONSULTING_CALLOUT}
          </p>

          <div className="mt-12 border border-line bg-white px-6 py-8 sm:px-10">
            <h3 className="break-keep text-center text-[1.25rem] font-semibold leading-[1.4] text-ink-strong">
              과목별 수행평가 PLAN
            </h3>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {PLAN_STEPS.map((step) => (
                <li key={step.number} className="flex flex-col">
                  <span className="text-[0.875rem] font-semibold tracking-[0.08em] text-gold">
                    {step.number}
                  </span>
                  <p className="mt-2 break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong">
                    {step.title}
                  </p>
                  <p
                    className={`mt-2 break-keep text-[0.875rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS}`}
                  >
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={`${PREMIUM_CONTAINER_CLASS} text-center`}>
          <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[2rem]">
            국내대학 진학, 위닝에듀 제주캠퍼스와 함께하세요
          </h2>
          <a
            href={MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-primary px-[3.75rem] py-[1.25rem] text-[1.125rem] font-semibold leading-[1.4] text-white transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            제주캠퍼스 위치 보기
            <span className="sr-only"> (새 창에서 열림)</span>
          </a>
        </div>
      </section>
    </main>
  );
}
