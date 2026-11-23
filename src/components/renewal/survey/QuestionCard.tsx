/**
 * QuestionCard
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 ("설문조사 선택한 상태")
 *
 * 번호 배지 + 카테고리 라벨 + 질문 타이틀 + 보조문구를 감싸는 카드 셸.
 * 실제 선택 UI(OptionGroup 등)는 children으로 전달한다.
 *
 * 시안 실측 (1889:10745 외):
 *   카드 radius 40 (2.5rem) / padding 상하 40 (2.5rem) 좌우 60 (3.75rem)
 *   번호 배지 40×40 (2.5rem) radius 8 (0.5rem) bg #D7D7D7, 숫자 #808080
 *   배지 ↔ 카테고리 라벨 gap 20 (1.25rem) / 배지행 ↔ 질문 gap 12 (0.75rem)
 *   질문 ↔ 보조문구 gap 0 (1889:8804 h40 → 1889:8805 y40) / 질문블록 ↔ 입력영역 gap 20 (1.25rem)
 *   질문 24px Medium — 시안 line-height 20px는 아티팩트라 정상 행간 1.4를 적용한다.
 *
 * maxSelect가 있는 복수선택 문항은 헤더 우측에 `2 / 3` 카운터를 노출한다
 * (SPEC-fd-ver3-v2 §9-A3 — disabled 만으로는 이유가 전달되지 않는다).
 *
 * title에 `\n`이 있으면 whitespace-pre-line으로 그대로 줄바꿈한다(QA 행350 — q10·q12처럼
 * 길게 이어지는 한 문장을 본문/보조 지시 두 줄로 나눠 보여줄 때만 쓴다. 나머지 문항 title은
 * `\n`을 담지 않으므로 렌더 결과는 그대로다).
 *
 * `questionId`가 있으면 `id={`q-${questionId}`}` 앵커를 달아 하단 CTA의 "미완료" 클릭이
 * 이 카드로 스크롤할 수 있게 한다. 고정 헤더(64px)에 가리지 않도록 scroll-mt를 둔다.
 * `highlighted`면 일시적으로 링을 켜서 "여기를 봐달라"는 안내를 준다(오류색이 아니라
 * 기존 선택 상태 #013262/#E9F4FF와 겹치지 않는 앰버 톤 — useUnansweredNavigation이 3초
 * 내외로 또는 응답 시 꺼준다).
 */
import type { ReactNode } from "react";

type QuestionCardProps = {
  // exactOptionalPropertyTypes 대응 — 호출부(QuestionCardList)가 옵셔널 필드를 그대로 넘긴다.
  number?: number | string | undefined;
  category?: string | undefined;
  title?: ReactNode | undefined;
  helper?: string | undefined;
  maxSelect?: number | undefined;
  selectedCount?: number;
  questionId?: string | number;
  highlighted?: boolean;
  children?: ReactNode;
};

export default function QuestionCard({
  number,
  category,
  title,
  helper,
  maxSelect,
  selectedCount = 0,
  questionId,
  highlighted = false,
  children,
}: QuestionCardProps) {
  const showCounter = Number.isFinite(maxSelect);
  // showCounter가 true면 Number.isFinite(maxSelect)로 maxSelect가 정의됨이 런타임상 보장됨.
  const counterReached = showCounter && selectedCount >= maxSelect!;

  return (
    // 좌우 padding 60(3.75rem)은 시안 전제(컨테이너 1164 / 카드 콘텐츠 992)가 실제로 확보되는
    // wide(1184) 부터만 켠다. lg(1024) 에 걸어 두면 1024~1183 에서 콘텐츠 폭을 40px 더 갉아
    // 리커트 척도 컬럼이 77.0px 까지 눌린다(→ 80.7px). ≥1184 는 60 그대로라 시안 정합 불변.
    <div
      id={questionId != null ? `q-${questionId}` : undefined}
      className={`flex w-full scroll-mt-20 flex-col items-start gap-3 rounded-[1.75rem] bg-white px-6 py-8 ring-4 ring-offset-4 transition-shadow duration-700 sm:rounded-[2.5rem] sm:px-10 sm:py-10 wide:px-perf-inset ${
        highlighted
          ? "ring-[#FDB022] ring-offset-[#FBFAFA]"
          : "ring-transparent ring-offset-transparent"
      }`}
    >
      <div className="flex w-full flex-col gap-5">
        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full items-center justify-between gap-5">
            <div className="flex items-center gap-5">
              {number != null && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-line text-xl font-medium leading-5 text-[#808080]">
                  {number}
                </span>
              )}
              {category && (
                <p className="text-base font-medium leading-5 text-line">
                  {category}
                </p>
              )}
            </div>

            {showCounter && (
              <p
                aria-live="polite"
                className={`shrink-0 text-sm font-medium leading-5 ${
                  counterReached ? "text-primary" : "text-[#808080]"
                }`}
              >
                {selectedCount} / {maxSelect}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-0">
            <h3 className="break-keep whitespace-pre-line text-xl font-medium leading-[1.4] text-ink sm:text-2xl">
              {title}
            </h3>
            {helper && (
              <p className="break-keep text-base font-medium leading-5 text-line">
                {helper}
              </p>
            )}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
