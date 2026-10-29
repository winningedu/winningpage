import MentorSection from "@/components/landing/MentorSection";
import {
  PREMIUM_ADMISSION_A_PATH,
  PREMIUM_APPLY_FORM_ANCHOR_ID,
  PREMIUM_APPLY_PATH,
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_DARK_SECTION_BG_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
  PremiumAreaCards,
  PremiumCtaBanner,
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

// 대입컨설팅 S 프로그램(프리미엄) 랜딩 — /page/premium/admission-consulting/s.
// A 페이지와 같은 골격이되 섹션 4·6·7·8이 다크 배경(bg-ink-strong)이다(variant="dark").
// 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함).
// 에셋은 전부 public/images/premium/ 배치 완료(A 페이지와 동일 step-1~4 재사용) —
// import 없이 절대 경로 문자열로 참조.

// S 히어로는 A 와 달리 상담 사진(시안 image 416 = cta-s-program-bg 와 동일 원본)을 쓴다.
const HERO_BG = "/images/premium/cta-s-program-bg.webp";
// 파이널 CTA 배경 — S 시안 4061:3584 image 369(QA 행 260).
const FINAL_CTA_BG = "/images/premium/cta-a-program-bg.jpg";

// S 히어로 방사형 라이트 — Tailwind는 소스의 완성된 리터럴 클래스만 스캔하므로
// `bg-[${...}]` 런타임 조합은 컴파일되지 않는다. 클래스 문자열을 통째로 보관할 것.
const HERO_GLOW_CLASS =
  "bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,1)_5%,rgba(255,255,255,0.85)_10%,rgba(255,255,255,0.5)_25%,rgba(255,255,255,0.16)_45%,rgba(255,255,255,0.08)_66%,rgba(255,255,255,0)_88%)]";

const ISSUE_CARDS = [
  {
    title: "대표원장 비정기 대면상담",
    description:
      "산출물 검수를 넘어, 대표원장이 비정기적으로 직접 만나 학생에게 피드백을 전달합니다.",
  },
  {
    title: "연간 탐구 로드맵",
    description: "학기 단위가 아니라 3년 전체를 설계합니다.",
  },
  {
    title: "환산내신 산출관리",
    description:
      "기출분석·교재지정에 더해 학기중 내신을 환산내신으로 관리합니다.",
  },
  {
    title: "대입 실전 지원",
    description:
      "면접·수시지원·자소서(과기원·사관학교 대상)·미술활동보고서까지 대입의 마지막 단계를 함께합니다.",
  },
];

const PROGRAM_STRUCTURE_ITEMS = [
  {
    number: "01",
    title: "대표멘토 일일 학습관리",
    desc: "매일학습에 대한 조언과 피드백(학습방향성, 교내활동설계 의견 외)을 전달합니다.",
  },
  {
    number: "02",
    title: "연간 탐구 로드맵",
    desc: "학기 단위가 아니라 3년 전체를 설계합니다.",
  },
  {
    number: "03",
    title: "환산내신 산출관리",
    desc: "기출분석·교재지정에 더해 학기중 내신을 환산내신으로 관리합니다.",
  },
  {
    number: "04",
    title: "대입 실전 지원",
    desc: "면접·수시지원·자소서(과기원·사관학교 대상)·미술활동보고서까지 대입의 마지막 단계를 함께합니다.",
  },
];

const AREA_CARDS = [
  {
    number: "01",
    title: "책임 관리",
    bullets: ["전공선배 멘토 + 대표원장 비정기 대면상담"],
  },
  {
    number: "02",
    title: "커뮤니케이션",
    bullets: ["카톡 · 전화 · 줌 · 대표원장 비정기 대면상담"],
  },
  {
    number: "03",
    title: "탐구활동 설계",
    bullets: [
      "연간 탐구활동 로드맵 맞춤 설계",
      "수행평가·탐구활동 준비 코칭",
      "자기주도 탐구 심화 지원",
    ],
  },
  {
    number: "04",
    title: "학습 코칭",
    bullets: [
      "내신 가이드(기출분석·교재지정)",
      "데일리 학습 점검",
      "환산내신 산출관리",
    ],
  },
  {
    number: "05",
    title: "대입 실전 지원",
    bullets: [
      "대입 면접 지도",
      "수시지원 분석",
      "자소서(과기원·사관학교 대상)",
      "미술활동보고서(미술전공자 대상)",
    ],
  },
];

const PHOTO_STEPS = [
  { image: "/images/premium/step-1-consult.webp", label: "대입 면접 지도" },
  { image: "/images/premium/step-2-analysis.webp", label: "자소서 작성 지도" },
  {
    image: "/images/premium/step-3-matching.webp",
    label: "대학 수시지원 분석",
  },
  {
    image: "/images/premium/step-4-review.webp",
    label: "활동보고서 구성 지도",
  },
];

const GRADE_MANAGEMENT_ITEMS = [
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

export default function AdmissionConsultingS() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumProgramTabs active="s" />

      <PremiumHero
        title={
          <>
            대표원장과 대표멘토가
            <br />
            학생에게 직접 피드백을 건넵니다
          </>
        }
        description="대표원장이 비정기 대면상담으로 학생과 직접 소통하며 대입 실전의 마지막 관문까지 함께합니다"
        cta={{
          label: "VIP 사전 인터뷰 신청",
          to: `${PREMIUM_APPLY_PATH}#${PREMIUM_APPLY_FORM_ANCHOR_ID}`,
        }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
      />

      <PremiumStatsPills
        variant="dark"
        heading={
          <>
            실적으로 증명하는 실력,
            <br />
            합격생 선배들의 추천
          </>
        }
        items={PREMIUM_ACHIEVEMENTS}
      />

      <PremiumIssueCards
        heading="혼자 감당하기엔, 내신과 수행 모두 시간이 부족합니다"
        sub="학생부종합전형을 준비하는 재학생은 학교에서 제공되는 탐구 활동과 보고서 과제를 모두 소화해야 합니다."
        items={ISSUE_CARDS}
        variant="dark"
        columns={2}
      />

      <PremiumNumberedList
        heading="S 프로그램의 구성"
        sub="학습 관리를 넘어, 대입 실전의 마지막 관문까지 대표원장이 직접 함께합니다."
        items={PROGRAM_STRUCTURE_ITEMS}
        variant="dark"
      />

      <PremiumAreaCards
        heading="S 프로그램이 관리하는 5가지 영역"
        sub={
          <>
            감이 아니라 데이터로 설계합니다.{" "}
            <span className="text-gold">대표원장과 대표멘토가 직접 함께</span>
            하는 관리 범위입니다.
          </>
        }
        items={AREA_CARDS}
        variant="dark"
      />

      <PremiumPhotoSteps
        heading="독립 프로젝트 입시지원 프로그램"
        sub="S 프로그램 이용 학생에게는 모든 프로그램이 포함됩니다"
        items={PHOTO_STEPS}
        variant="dark"
      />

      <PremiumNumberedList
        heading="고교 3년 내신을 끝까지 함께 관리합니다"
        sub="목표가 명확해야 공부 방향도 정확해집니다. 명문대 선배의 학습 루틴을 매일 곁에서 배웁니다."
        items={GRADE_MANAGEMENT_ITEMS}
        variant="dark"
      />

      {PREMIUM_MENTORS.length > 0 && (
        <MentorSection
          mentors={PREMIUM_MENTORS}
          variant="premium"
          className={`${PREMIUM_DARK_SECTION_BG_CLASS} ${PREMIUM_SECTION_PADDING_CLASS}`}
          headingSlot={
            <PremiumSectionHeading
              className={PREMIUM_CONTAINER_CLASS}
              tone="dark"
              heading="함께하는 전공선배 멘토"
              sub="위닝에듀를 거쳐 합격한 선배들이 멘토로 함께합니다."
            />
          }
        />
      )}

      {/* 파이널 CTA — S 시안(4061:3115) 하단(4061:3584, 1920×493)은 A 페이지와 같은 풀폭
          사진 배너(image 369 = 플래너에 필기하는 손 사진, 어두운 오버레이 + 흰 텍스트 + 텍스트
          링크) 하나뿐이다. 이전 구현(4238:2698 = A 시안 기준)의 "S 프로그램 안내받기" 자기
          안내 배너 + 베이지 light 배너 2장은 S 시안에 없어 QA 시트 행 260(2026-09-02)으로
          정리했다. 사진은 시안 image 369 원본(1748×1161)을 jpg로 저장. */}
      <PremiumCtaBanner
        title="학습·탐구 관리부터 시작하고 싶다면"
        cta={{ label: "A 프로그램 안내받기 →", to: PREMIUM_ADMISSION_A_PATH }}
        bgSrc={FINAL_CTA_BG}
      />
    </main>
  );
}
