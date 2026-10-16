import { CARD } from "./cardStyles";

type StudentCardProps = {
  studentName: string | null;
  summaryLine: string | null;
  /** 잔여 회차. 모르면 null 이고 배지를 그리지 않는다. */
  quotaRemaining: number | null;
};

export default function StudentCard({
  studentName,
  summaryLine,
  quotaRemaining,
}: StudentCardProps) {
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
          이용권 {quotaRemaining}회
        </span>
      )}
    </section>
  );
}
