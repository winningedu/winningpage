// 성장설계 전 화면 하단 고지 "꼭 알아 두세요" 3줄(계획 §2 9). 문구는 시안(631:177 시작)에서 옮겼다.
// 시안은 4줄이나 네 번째가 세 번째와 중복이라 3줄로 둔다. GrowthAppLayout 이 모든 화면 하단에 한 번 그린다.
export const GROWTH_NOTICE_LINES = [
  "이 진단은 위닝 내부 기준이에요. 합격 가능성이나 학교 평가를 예측하지 않아요.",
  "생활기록부 원문은 받지 않아요(초중등교육법 제25조의2).",
  "리포트 생성에 실패하면 이용권 차감은 자동으로 복구돼요.",
] as const;

export default function GrowthNotice() {
  return (
    <section
      aria-labelledby="growth-notice-heading"
      className="rounded-xl bg-surface-04 px-5 py-4"
    >
      <h2
        id="growth-notice-heading"
        className="text-app-label font-semibold text-ink-strong"
      >
        꼭 알아 두세요
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-app-caption text-ink-sub">
        {GROWTH_NOTICE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
