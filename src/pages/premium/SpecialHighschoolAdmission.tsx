import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_NATURAL_TEXT_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
  PremiumAreaCards,
  PremiumCtaBanner,
  PremiumHero,
  PremiumNumberedCards,
  PremiumRoadmapSection,
  PremiumSuccessStories,
} from "@/components/premium";
import { COMPANY } from "@/data/company";
import { buildPhoneSecondaryCta } from "@/lib/premiumContact";

// 특목고입학 프로그램(프리미엄) 랜딩 — /page/premium/special-highschool.
// 대입컨설팅 A/S·대학원입학·해외명문대와 같은 컴포넌트 조합 방식의 코드 페이지
// (구 CMS DynamicPage 대체). 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함).
// 탭바(PremiumProgramTabs) 없음, 대학 마퀴·비교표 없음 — 시안에 없다.

const HERO_BG = "/images/premium/hero-teukmok-bg.webp";
// 이 히어로는 A/S와 마찬가지로 밝은 사진 위 어두운 텍스트다(다른 프리미엄 페이지 좌측정렬
// 히어로들과 달리 다크 오버레이가 아니라 흰 라이트) — 그래서 titleClassName/
// descriptionClassName/ctaClassName은 전부 생략(PremiumHero 기본값이 이미 정확히 일치:
// text-ink-strong 텍스트 + bg-ink-strong pill 버튼). glowClassName만 좌측정렬에 맞춰
// 좌→우로 옅어지는 흰 그라디언트로 재정의한다.
const HERO_GLOW_CLASS =
  "bg-gradient-to-r from-white/55 via-white/35 to-transparent";

// 학교 유형별 5카드 — §2("학교 유형별로 다른 전형방식...")와 §6("15년간 쌓아온 고입
// 컨설팅의 기록...") 두 섹션에서 완전히 동일한 카드 세트를 그대로 재사용한다. 시안 원문이
// 실제로 두 섹션 모두 이 카드를 쓰고 있고(헤딩·sub만 다름), §2 헤딩과는 내용이 어긋나며
// (대입컨설팅 A 프로그램 AREA_CARDS와 문항까지 거의 동일 — placeholder 복붙 의심) §6과는
// 헤딩·sub까지 겹쳐 카드 자체가 두 섹션 모두에서 헤딩과 무관해 보인다. 시안 미완성으로
// 보이지만 "카피 시안 원문 그대로" 원칙에 따라 그대로 구현한다.
const SCHOOL_TYPE_CARDS = [
  { number: "01", title: "자사고", bullets: ["자기주도학습전형"] },
  {
    number: "02",
    title: "커뮤니케이션",
    bullets: ["카톡 · 전화 · 줌", "대면상담"],
  },
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
    title: "학습 코칭",
    bullets: [
      "모든 결과물(탐구가이드· 수행평가 코칭안 등)은 대표원장이 최종 검수 후 전달됩니다",
    ],
    staticDark: true,
  },
];

const SELF_INTRO_CARDS = [
  {
    number: "01",
    title: "문항 구조 설계",
    description: "학교별 문항에 맞춘 나만의 스토리라인을 1:1로 설계합니다.",
  },
  {
    number: "02",
    title: "문장 단위 대면 첨삭",
    description: "초안을 함께 보며 논리·진정성·표현을 문장 단위로 다듬습니다.",
  },
  {
    number: "03",
    title: "전형 규정 준수 지도",
    description: "기재 금지항목을 확인해 감점 리스크를 사전에 차단합니다.",
  },
  {
    number: "04",
    title: "합격 사례 기반 방향",
    description: "유형화된 인사이트로 글의 방향을 함께 설정합니다.",
  },
];

const INTERVIEW_IMG = "/images/premium/teukmok-interview.webp";
const INTERVIEW_ITEMS = [
  {
    number: "01",
    title: "학교별 실전 모의면접",
    desc: "전형 방식에 맞춘 1:1 대면 모의면접을 반복 진행합니다.",
  },
  {
    number: "02",
    title: "질문 및 답변 개별 피드백",
    desc: "답변의 논리·태도·표현을 개별적으로 모두 피드백합니다.",
  },
  {
    number: "03",
    title: "실전 감각 트레이닝",
    desc: "압박 질문부터 꼬리 질문까지 꼼꼼하게 대비합니다.",
  },
];

const ROADMAP_ITEMS = [
  {
    number: "01",
    title: "내신 성적 향상 공부법 지도",
    desc: "목표 학교별 내신 관리 전략",
  },
  {
    number: "02",
    title: "중간·기말 대비 학습법 · 수행평가 가이드",
    desc: "시험 대비 학습법과 발표 가이드·첨삭",
  },
  {
    number: "03",
    title: "개인 연구보고서·교내대회 가이드 및 첨삭",
    desc: "방향 설정부터 산출물 첨삭까지",
  },
  {
    number: "04",
    title: "월간 학습계획표 작성 · 일일 학습 피드백",
    desc: "계획과 피드백으로 학습 루틴 관리",
  },
];

// 원형 다이어그램 pill 6개 — 12시 방향부터 시계방향(시안 실측 배치 그대로).
const ROADMAP_PILLS: [string, string, string, string, string, string] = [
  "내신 공부법",
  "중간·기말 대비",
  "수행평가 가이드",
  "연구 보고서",
  "교내대회 첨삭",
  "일일 학습 피드백",
];

// 합격 수기 4장. "학부모 J님" 보조문이 "OO중 K군" 보조문과 완전히 동일 — 시안 원문의
// 복붙 흔적으로 보이지만 그대로 유지한다.
const SUCCESS_STORIES = [
  {
    label: "2025년도 OO고등학교 합격생",
    name: "OO중 K군",
    badge: "자사고 합격",
    quote:
      "“ 문항마다 제 이야기를 어떻게 풀지 함께 잡아주셔서, 처음으로 제 글이라는 확신이 들었습니다. ”",
    note: "답을 외우는 게 아니라 제 생각을 말하는 법을 배웠어요. 면접이 오히려 기회가 됐습니다.",
  },
  {
    label: "2025년도 OO고등학교 합격생",
    name: "OO중 L양",
    badge: "외고 합격",
    quote:
      "“ 모의면접을 반복하면서 꼬리질문이 더 이상 두렵지 않았어요. 실제 면접장에서 그대로 나왔습니다. ”",
    note: "생기부 진단부터 내신 관리까지 로드맵대로 움직이니 준비 과정이 흔들리지 않았습니다.",
  },
  {
    label: "2025년도 OO고등학교 합격생",
    name: "학부모 J님",
    badge: "과학고 합격생 학부모",
    quote:
      "“ 부모인 저도 매달 리포트로 진행 상황을 확인할 수 있어 믿고 맡길 수 있었습니다. ”",
    note: "답을 외우는 게 아니라 제 생각을 말하는 법을 배웠어요. 면접이 오히려 기회가 됐습니다.",
  },
  {
    label: "2025년도 OO고등학교 합격생",
    name: "학부모 P님",
    badge: "자사고 합격생 학부모",
    quote:
      "“ 막막했던 입시 방향을 명확히 잡아주셔서, 아이도 저도 불안감 없이 준비에만 집중할 수 있었습니다. ”",
    note: "자소서 작성부터 실전 면접 대비까지 세심하게 케어해 주셨습니다. 자신감을 가지고 면접장에 들어가는 아이를 보며 확신이 들었습니다.",
  },
];

export default function SpecialHighschoolAdmission() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumHero
        align="left"
        title="감이 아니라 데이터로 설계하는 전문가의 코칭"
        description="전문가 1:1 자기소개서·면접 코칭과 장기 로드맵 설계 기반의 학습·활동 지원 관리 목표 학교의 전형 방식에 맞춰 처음부터 끝까지 함께 준비합니다"
        cta={{ label: "상담 신청하기", to: "/premium-apply" }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
      />

      <PremiumAreaCards
        heading="학교 유형별로 다른 전형방식, 목표 학교에 맞춘 1:1 컨설팅을 제공합니다"
        sub="지원할 학교의 선발 구조를 기준으로 준비 전략을 설계합니다."
        items={SCHOOL_TYPE_CARDS}
      />

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
            <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[1.75rem] lg:shrink-0 lg:text-[2rem]">
              대입에서 사라진 자기소개서,
              <br />
              고입에서는 여전히 합격을 가릅니다
            </h2>
            <span
              aria-hidden="true"
              className="hidden h-auto w-px self-stretch bg-line sm:block"
            />
            <p
              className={`break-keep text-[0.9375rem] leading-[1.6] ${PREMIUM_NATURAL_TEXT_CLASS} sm:text-[1rem]`}
            >
              자사고·외고·국제고 자기주도학습전형에서 자기소개서는 학생이 직접
              작성해 제출하는 핵심 서류입니다. 위닝에듀는 대신 써 주는 것이
              아니라, 학생이 &apos;직접 쓰도록&apos; 구조와 논리를 잡아주는
              코칭에 강점이 있습니다.
            </p>
          </div>
          <div className={PREMIUM_HEADING_GAP_CLASS}>
            <PremiumNumberedCards items={SELF_INTRO_CARDS} />
          </div>
          {/* 시안(Figma 4205:6488) 38px Bold / lh 1.3 / letter-spacing -0.02em, 상단 간격
              100px — QA 시트 행130으로 기존 24px보다 크게 키웠다. */}
          <p className="mt-16 break-keep text-center text-[1.75rem] font-bold leading-[1.3] tracking-[-0.02em] text-ink-strong sm:text-[2.375rem] lg:mt-25">
            직접 쓰되,{" "}
            <span className={PREMIUM_GOLD_TEXT_CLASS}>혼자 두지 않습니다.</span>
          </p>
        </div>
      </section>

      <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
        <div className={PREMIUM_CONTAINER_CLASS}>
          <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-strong sm:text-[1.75rem] lg:text-[2rem]">
            면접은 결국 사람 앞에서
            <br />
            나의 가능성을 증명하는 과정입니다
          </h2>
          <div
            className={`grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12 ${PREMIUM_HEADING_GAP_CLASS}`}
          >
            <img
              src={INTERVIEW_IMG}
              alt="위닝에듀 인터뷰 워크숍 — 대표원장과 학생의 1:1 모의면접 코칭 장면"
              loading="lazy"
              className="aspect-[548/334] w-full rounded-lg object-cover"
            />
            <ul className="flex flex-col gap-8">
              {INTERVIEW_ITEMS.map((item) => (
                <li key={item.number} className="flex gap-4">
                  <span
                    className={`shrink-0 text-[1.25rem] font-semibold leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
                  >
                    {item.number}
                  </span>
                  <div>
                    <p className="break-keep text-[1rem] font-semibold leading-[1.4] text-ink-strong">
                      {item.title}
                    </p>
                    <p className="mt-1 break-keep text-[0.875rem] leading-[1.5] text-ink">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <PremiumRoadmapSection
        heading="장기 로드맵으로 내신부터 활동까지 관리합니다"
        sub="단기 컨설팅이 아닌 장기적인 로드맵 설계 기반으로, 학습과 활동을 꾸준히 지원·관리합니다."
        items={ROADMAP_ITEMS}
        pills={ROADMAP_PILLS}
      />

      <PremiumAreaCards
        heading="15년간 쌓아온 고입 컨설팅의 기록"
        sub="지원할 학교의 선발 구조를 기준으로 준비 전략을 설계합니다."
        items={SCHOOL_TYPE_CARDS}
      />

      <PremiumSuccessStories
        heading="실제 합격생들의 합격 수기"
        stories={SUCCESS_STORIES}
        footnote="실제 게재 동의를 받은 내용만 소개합니다"
      />

      <PremiumCtaBanner
        title="1:1 상담을 통해, 목표에 맞는 입시 전략을 체계적으로 설계해 드립니다"
        sub="학생의 현재 상황 진단부터 부담 없이 시작하세요"
        cta={{ label: "카카오톡 상담", href: COMPANY.kakaoChannelUrl }}
        secondaryCta={buildPhoneSecondaryCta()}
        variant="light"
        primaryTone="navy"
      />
    </main>
  );
}
