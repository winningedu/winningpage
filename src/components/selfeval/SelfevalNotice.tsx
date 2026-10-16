// 자기평가서 전 화면 하단 고지 "꼭 알아 두세요" 4줄(명세 고지 문구). SelfevalAppLayout 이
// 모든 화면 하단에 한 번 그린다. 페이지가 따로 그리지 않는다.
export const SELFEVAL_NOTICE_LINES = [
  "자기평가서는 학생이 제출하는 문서예요. 세부능력 및 특기사항은 선생님이 기재해요",
  "점수와 판정은 위닝 내부 기준이에요. 학교 채점 결과나 학생부 평가 예측이 아니에요",
  "생활기록부 원문은 받지 않아요",
  "생성에 실패하면 차감된 이용 횟수는 자동으로 복구돼요",
] as const;

export default function SelfevalNotice() {
  return (
    <section
      aria-labelledby="selfeval-notice-heading"
      className="rounded-xl bg-surface-04 px-5 py-4"
    >
      <h2
        id="selfeval-notice-heading"
        className="text-app-label font-semibold text-ink-strong"
      >
        꼭 알아 두세요
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-app-caption text-ink-sub">
        {SELFEVAL_NOTICE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
