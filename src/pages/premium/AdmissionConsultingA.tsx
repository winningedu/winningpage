import MentorSection from "@/components/landing/MentorSection";
import {
  PREMIUM_ADMISSION_S_PATH,
  PREMIUM_APPLY_FORM_ANCHOR_ID,
  PREMIUM_APPLY_PATH,
  PREMIUM_BEIGE_BG_CLASS,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
  PremiumAreaCards,
  PremiumAudience,
  PremiumCtaBanner,
  PremiumDarkTrio,
  PremiumHero,
  PremiumIssueCards,
  PremiumNumberedList,
  PremiumPhotoSteps,
  PremiumProgramTabs,
  PremiumSectionHeading,
  PremiumStatsPills,
} from "@/components/premium";
import {
  PREMIUM_ACHIEVEMENTS,
  PREMIUM_MENTORS,
} from "@/components/premium/premiumStaticData";

// 대입컨설팅 A 프로그램(프리미엄) 랜딩 — /page/premium/admission-consulting/a.
// 섹션 1~10 조합 + 카피 상수. 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함).
// 에셋은 전부 public/images/premium/ 배치 완료 — import 없이 절대 경로 문자열로 참조.

const HERO_BG = "/images/premium/hero-bg.webp";
const CTA_BG = "/images/premium/cta-s-program-bg.webp";

// A 히어로 방사형 라이트 — Tailwind는 소스의 완성된 리터럴 클래스만 스캔하므로
// `bg-[${...}]` 런타임 조합은 컴파일되지 않는다. 클래스 문자열을 통째로 보관할 것.
const HERO_GLOW_CLASS =
  "bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,1)_5%,rgba(255,255,255,0.65)_10%,rgba(255,255,255,0.35)_15%,rgba(255,255,255,0.175)_30%,rgba(255,255,255,0)_60%)]";

const AUDIENCE_ITEMS = [
  {
    image: "/images/premium/audience-highschool.webp",
    caption: "대입을 준비하는 고등학교 재학생",
  },
  {
    image: "/images/premium/audience-middleschool.webp",
    caption: "특목·자사고 준비 및 의치한수약 목표 중학생",
  },
];

const ISSUE_CARDS = [
  {
    title: "수행평가가 내신의 절반",
    description:
      "지필 50%, 수행평가 50%. 수행평가가 무너지면 내신 등급을 지킬 수 없습니다.",
  },
  {
    title: "한 학기 보고서 20~30개",
    description: "전 과목 탐구 보고서를 내신 시험 기간에도 제출해야 합니다.",
  },
  {
    title: "설계 없이 쌓인 생기부",
    description:
      "따로따로 쌓인 탐구는 학종에서 힘을 갖기 어렵습니다. 처음부터 설계가 필요합니다.",
  },
];

const PHOTO_STEPS = [
  { image: "/images/premium/step-1-consult.webp", label: "상담 신청" },
  {
    image: "/images/premium/step-2-analysis.webp",
    label: "1:1 면담 · 데이터 분석",
  },
  {
    image: "/images/premium/step-3-matching.webp",
    label: "맞춤 전략 · 멘토 매칭",
  },
  {
    image: "/images/premium/step-4-review.webp",
    label: "대표원장 검수 · 통합 관리",
  },
];

const AREA_CARDS = [
  {
    number: "01",
    title: "책임 관리",
    bullets: ["전공선배 멘토 전담관리 + 대표원장 직접 검수"],
  },
  { number: "02", title: "커뮤니케이션", bullets: ["카톡 · 전화 · 줌"] },
  {
    number: "03",
    title: "탐구활동 설계",
    bullets: [
      "수행평가·탐구활동 구성 가이드",
      "탐구 방향 코칭 및 학습 피드백",
      "자기주도 탐구 설계 지원",
    ],
  },
  {
    number: "04",
    title: "학습 코칭",
    bullets: ["내신 가이드", "데일리 학습 점검", "학기중 내신결과 상담"],
  },
  {
    number: "05",
    title: "실전 코칭",
    bullets: [
      "모든 결과물(탐구가이드·수행평가 코칭안 등)은 대표원장이 최종 검수 후 전달됩니다",
    ],
  },
];

const NUMBERED_ITEMS = [
  {
    number: "01",
    title: "희망계열 최저내신등급 산출",
    desc: "가고 싶은 학과에 맞춰 어느 정도의 내신이 필요한지 구체적으로 산출합니다.",
  },
  {
    number: "02",
    title: "내신결과 분석 · 학습플랜 셋업",
    desc: "중간·기말 성적을 꼼꼼히 분석해 다음 시험에 최적화된 학기별 학습플랜을 함께 설계합니다.",
  },
  {
    number: "03",
    title: "교과목별 맞춤 교재 선정",
    desc: "모두에게 같은 교재는 없습니다. 실력과 목표에 딱 맞는 교재로 필요한 부분만 집중합니다.",
  },
  {
    number: "04",
    title: "일일 진도 설계 · 완성도 점검",
    desc: "할 수 있는 만큼, 꼭 해야 하는 만큼 계획을 세우고 매일 점검해 공부 습관을 만듭니다.",
  },
  {
    number: "05",
    title: "교과목별 학습노하우 코칭",
    desc: "단순히 문제만 푸는 게 아니라 '어떻게 공부해야 하는지'를 배웁니다.",
  },
];

const DARK_TRIO_ITEMS = [
  {
    icon: "/images/premium/icon-topic.svg",
    title: "탐구 주제 선정",
    desc: "지원 계열에 맞는 주제를 단 한 명을 위해 함께 정합니다.",
  },
  {
    icon: "/images/premium/icon-guide.svg",
    title: "가이드 · 자료 제공",
    desc: "심화 탐구 보고서를 실시간으로 함께 완성해 갑니다.",
  },
  {
    icon: "/images/premium/icon-review.svg",
    title: "대표원장 최종 검수",
    desc: "완성도는 대표원장이 마지막까지 책임집니다.",
  },
];

export default function AdmissionConsultingA() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumProgramTabs active="a" />

      <PremiumHero
        title={
          <>
            전공선배 멘토가 곁에 서고
            <br />
            대표원장이 직접 점검합니다
          </>
        }
        description="매일의 내신과 탐구활동, 그 모든 산출물을 대표원장이 마지막까지 직접 검수하는 학습·탐구 관리 프로그램입니다."
        cta={{
          label: "사전 인터뷰 신청",
          to: `${PREMIUM_APPLY_PATH}#${PREMIUM_APPLY_FORM_ANCHOR_ID}`,
        }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
      />

      <PremiumStatsPills
        heading={
          <>
            실적으로 증명하는 실력,
            <br />
            합격생 선배들의 추천
          </>
        }
        items={PREMIUM_ACHIEVEMENTS}
      />

      <PremiumAudience
        heading={
          <>
            이런 학생에게 <span className="text-gold">A 프로그램</span>을
            추천해요
          </>
        }
        sub="Ace Program"
        items={AUDIENCE_ITEMS}
      />

      <PremiumIssueCards
        heading="혼자 감당하기엔, 내신과 수행 모두 시간이 부족합니다"
        sub="학생부종합전형을 준비하는 재학생은 학교에서 제공되는 탐구 활동과 보고서 과제를 모두 소화해야 합니다."
        items={ISSUE_CARDS}
      />

      <PremiumPhotoSteps
        heading="감이 아니라 시스템으로 관리합니다."
        sub="위닝에듀의 학습코칭 방식은 「학습코칭 장치 및 방법」에 기반한 4단계 구조입니다."
        items={PHOTO_STEPS}
      />

      <PremiumAreaCards
        heading="A 프로그램이 관리하는 5가지 영역"
        sub={
          <>
            감이 아니라 데이터로 설계합니다.{" "}
            <span className="text-gold">대표원장의 검수를 거쳐 전달</span>
            되는 관리 범위입니다.
          </>
        }
        items={AREA_CARDS}
      />

      <PremiumNumberedList
        heading="고교 3년 내신을 끝까지 함께 관리합니다"
        sub="목표가 명확해야 공부 방향도 정확해집니다. 명문대 선배의 학습 루틴을 매일 곁에서 배웁니다."
        items={NUMBERED_ITEMS}
      />

      <PremiumDarkTrio
        heading="톡 하나로 시작됩니다"
        sub="주제 선정부터 최종 검수까지, 멘토와 대표원장이 이어서 책임집니다."
        items={DARK_TRIO_ITEMS}
      />

      {PREMIUM_MENTORS.length > 0 && (
        <MentorSection
          mentors={PREMIUM_MENTORS}
          variant="premium"
          className={`${PREMIUM_BEIGE_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
          headingSlot={
            <PremiumSectionHeading
              className={PREMIUM_CONTAINER_CLASS}
              heading="함께하는 전공선배 멘토"
              sub="위닝에듀를 거쳐 합격한 선배들이 멘토로 함께합니다."
            />
          }
        />
      )}

      {/* 학종 전략 섹션 — 디자인 시안 없음(QA 행260, 러프 재량). 헤드라인은 고객 제공
          문구 그대로이고, 아래 파이널 CTA(S 프로그램 안내)와는 목적이 달라 신청 CTA는
          히어로와 동일 목적지(상담 신청 폼)로 보낸다. 신규 컴포넌트를 만들지 않고
          다른 프리미엄 페이지(대입S 등)가 멘토 섹션 뒤 파이널 배너 앞에 두는 중간
          CTA 배너 패턴(PremiumCtaBanner variant="light")을 그대로 재사용했다. */}
      <PremiumCtaBanner
        title="다음 학기가 달라지는 학종 전략, 대표 원장과 함께 시작하세요"
        sub="탐구활동부터 내신까지, 지금 상담을 신청하고 나만의 전략을 확인하세요."
        cta={{
          label: "사전 인터뷰 신청",
          to: `${PREMIUM_APPLY_PATH}#${PREMIUM_APPLY_FORM_ANCHOR_ID}`,
        }}
        variant="light"
      />

      <PremiumCtaBanner
        title="대입 실전(면접·자소서)까지 대표원장의 직접 피드백이 필요하다면"
        cta={{ label: "S 프로그램 안내받기 →", to: PREMIUM_ADMISSION_S_PATH }}
        bgSrc={CTA_BG}
      />
    </main>
  );
}
