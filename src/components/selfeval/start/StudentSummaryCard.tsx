import { CARD } from "@/components/growth/start/cardStyles";

type Props = {
  studentName: string | null;
  summaryLine: string | null;
  quotaRemaining: number | null;
};

// 학생 카드(시안 01). 이름과 요약 줄은 값이 있을 때만 그린다.
export default function StudentSummaryCard({
  studentName,
  summaryLine,
  quotaRemaining,
}: Props) {
  return (
    <section className={`${CARD} flex items-center justify-between gap-4`}>
      <div className="min-w-0">
        <p className="text-app-section font-bold text-ink-strong">
          {studentName ? `${studentName}님, 반갑습니다` : "반갑습니다"}
        </p>
        {summaryLine && (
          <p className="mt-1 text-app-label text-ink-sub">{summaryLine}</p>
        )}
      </div>
      {quotaRemaining !== null && (
        <span className="shrink-0 rounded-full bg-surface-03 px-3 py-1 text-app-caption font-semibold text-ink-strong">
          이용 가능 {quotaRemaining}회
        </span>
      )}
    </section>
  );
}
