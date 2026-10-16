import { tooShortMessage } from "./writeLogic";

// 300자 미만 제출(No.77). 평가를 실행하지 않았고 이용 횟수는 차감되지 않는다.
export default function TooShortCard({ total }: { total: number | null }) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-line/60 bg-white px-6 py-5"
    >
      <p className="text-app-card-title font-bold text-ink-strong">
        {tooShortMessage()}
      </p>
      {total !== null && (
        <p className="mt-1 text-app-label text-ink-sub">{`지금 합계 ${total}자`}</p>
      )}
    </section>
  );
}
