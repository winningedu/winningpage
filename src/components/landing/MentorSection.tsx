import type { ReactNode } from "react";
import { useInfiniteMarquee } from "@/hooks/useInfiniteMarquee";
import MentorCard from "./MentorCard";
import { LANDING_MARQUEE_SPEED } from "./marqueeConfig";

/**
 * 멘토 섹션 (명세 3.4, 0729 시안 2207:13029 리뉴얼)
 * - 순수 화이트 배경(기존 그라데이션 밴드 제거) + 무한 마퀴 사진 스트립 (카드 기본 210×360, 김무경 230×360)
 * - 카드 렌더는 MentorCard 프레젠테이션 컴포넌트에 위임 (신규 합성/crop 처리, 필수 항목 미비 row는 null 반환)
 * - useInfiniteMarquee 훅 사용 (화살표 없음, hover pause + 드래그/터치 스크롤 가드)
 *
 */
type MentorSectionProps = {
  /** home_mentor_strategies 활성 rows (sort_order asc). row 필드 상세는 MentorCard jsdoc 참조. */
  mentors?: Array<{ id: string | number; [key: string]: unknown }>;
  /** 콜멘토 랜딩(섹션 5)은 카드 마크업은 동일하되 헤딩 색상·섹션 배경/패딩만 다르다 — 신규
   * 컴포넌트 대신 이 variant로 흡수한다(재합성 0). premium(대입컨설팅 A 프로그램 랜딩 섹션 9)도
   * 같은 이유로 흡수 — 카드 마크업은 100% 동일(156×267 rounded 14.8px 시안 치수가 기존
   * RENDER_SCALE 산출값과 이미 일치해 MentorCard는 무수정), 헤딩만 완전히 다른 마크업(중앙정렬
   * 32px)으로 교체하고 배경색을 커스터마이즈한다. */
  variant?: "default" | "callmentor" | "premium";
  /** premium 전용: 기본 헤딩 블록(멘토스 소개 + 좌측정렬 2톤 타이틀) 자리에 그대로 렌더할
   * 노드. 프리미엄 토큰/헤딩 컴포넌트는 호출하는 페이지가 소유한다 — landing 이 premium
   * 도메인을 import 하지 않도록 슬롯으로 받는다. default/callmentor에는 영향 없음. */
  headingSlot?: ReactNode;
  /** premium 전용 섹션 클래스(배경·세로 패딩). 기본/콜멘토는 고정 클래스라 무시된다. */
  className?: string;
  /** default variant 헤딩(DB). 없으면 라벨과 h2를 렌더하지 않는다. callmentor는 무시하고 고정 문구를 쓴다. */
  eyebrow?: string;
  titleMain?: string;
  titleSub?: string;
};

const CALLMENTOR_COPY = {
  eyebrow: "멘토스 소개",
  titleMain: "위닝과 함께 합격한 선배에게",
  titleSub: "멘토 상담을 받아보세요",
};

export default function MentorSection({
  mentors = [],
  variant = "default",
  headingSlot,
  className = "",
  eyebrow,
  titleMain,
  titleSub,
}: MentorSectionProps) {
  const isCallMentor = variant === "callmentor";
  const copy = isCallMentor
    ? CALLMENTOR_COPY
    : { eyebrow, titleMain, titleSub };
  const isPremium = variant === "premium";
  // QA 행221: 메인랜딩(default variant) 마퀴만 좌→우로 천천히 흐르도록 조정.
  // callmentor/premium은 기존 방향·속도(훅 기본값) 유지.
  const isDefaultLanding = variant === "default";
  const { scrollRef, repeatIndices, containerHandlers } = useInfiniteMarquee({
    itemCount: mentors.length,
    ...(isDefaultLanding && {
      speed: LANDING_MARQUEE_SPEED,
      direction: "right" as const,
    }),
  });

  if (mentors.length === 0) return null;

  // 2개 이상일 때만 N배 반복 마퀴(기본 3배, 훅이 폭에 맞춰 자동 증가), 1개면 원본만 정적 렌더
  const isMarquee = mentors.length > 1;
  const renderIndices = isMarquee
    ? repeatIndices
    : mentors.map((_, index) => index);

  return (
    <section
      aria-label="위닝 멘토"
      className={
        isPremium
          ? `mx-auto w-full max-w-[120rem] ${className}`
          : isCallMentor
            ? "mx-auto w-full max-w-[120rem] bg-[#F4F4F6] pt-10 pb-16 sm:pt-12 sm:pb-20 lg:pt-10 lg:pb-30"
            : "mx-auto w-full max-w-[120rem] bg-white pt-7 pb-0 lg:pt-20"
      }
    >
      <div className="flex w-full flex-col gap-7">
        {isPremium ? (
          headingSlot
        ) : (
          <div className="mx-auto w-full max-w-content px-5 sm:px-8">
            {copy.eyebrow && (
              <p
                className={`text-[1.25rem] font-normal leading-[1.3] ${isCallMentor ? "text-gold" : "text-accent"}`}
              >
                {copy.eyebrow}
              </p>
            )}
            {copy.titleMain && (
              <h2 className="mt-2 break-keep text-left text-[2rem] font-semibold leading-[1.4] tracking-[-0.05rem]">
                <span className={isCallMentor ? "text-gold" : "text-primary"}>
                  {copy.titleMain}
                </span>
                {copy.titleSub && (
                  <>
                    {" "}
                    <span
                      className={
                        isCallMentor ? "text-[#0F172A]" : "text-[#808080]"
                      }
                    >
                      {copy.titleSub}
                    </span>
                  </>
                )}
              </h2>
            )}
          </div>
        )}

        {/* 컨텐츠 폭 캡 무한 마퀴 스트립 — AcceptanceSection과 동일 구조(스크롤 컨테이너 +
            내부 w-max 리스트)로 공용 landing-marquee-mask를 사용해 콘텐츠 폭 1100px 경계
            기준 좌우 페이드(데스크톱 9rem)를 동일하게 적용한다. */}
        <div className="mx-auto w-full max-w-[120rem]" {...containerHandlers}>
          <div
            // useInfiniteMarquee의 scrollRef는 여러 엘리먼트 종류에 공용으로 쓰이도록
            // HTMLElement로 넓게 잡혀 있다 — 이 자리는 div이므로 타입만 좁혀 붙인다.
            ref={scrollRef as React.RefObject<HTMLDivElement>}
            className="landing-marquee-mask w-full cursor-grab overflow-x-auto [-ms-overflow-style:none] scrollbar-none active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
          >
            <ul
              className={`flex w-max min-w-full items-center gap-6.25 px-5 sm:px-8 ${
                isMarquee ? "" : "justify-center"
              }`}
            >
              {renderIndices.map((mentorIndex, position) => {
                const mentor = mentors[mentorIndex];
                if (!mentor) return null;

                // N배 반복 중 사이클 1(초기 표시 사이클)만 스크린리더에 노출
                // — AcceptanceSection과 동일한 cycle 계산식 (repeatCount 동적 증가에도 유효)
                const cycle = Math.floor(position / mentors.length);
                const isClone = isMarquee && cycle !== 1;

                return (
                  <MentorCard
                    // biome-ignore lint/suspicious/noArrayIndexKey: 무한 마퀴 클론이라 같은 mentor.id가 여러 번 반복된다 — position으로 각 클론 사본을 구분한다.
                    key={`${mentor.id}-${position}`}
                    mentor={mentor}
                    isClone={isClone}
                  />
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
