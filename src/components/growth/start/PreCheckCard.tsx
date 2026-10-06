import type { ActivityOverview } from "@/lib/growth/api";
import { CARD, CARD_HINT, CARD_TITLE, SUB_TILE } from "./cardStyles";

function Stat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
}) {
  return (
    <div className={`${SUB_TILE} flex-1`}>
      <p className="text-app-caption text-ink-sub">{label}</p>
      <p className="mt-1 text-app-stat font-bold text-ink-strong">
        {value}
        {unit && (
          <span className="ml-1 text-app-label font-normal text-ink-sub">
            {unit}
          </span>
        )}
      </p>
      <p className="mt-1 text-app-caption text-ink-sub">{note}</p>
    </div>
  );
}

export default function PreCheckCard({
  overview,
  questionCount,
}: {
  overview: ActivityOverview;
  questionCount: number;
}) {
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>시작 전 확인</h2>
      <p className={CARD_HINT}>아래가 갖춰질수록 진단이 구체적으로 나와요.</p>
      <div className="mt-4 flex gap-3">
        <Stat
          label="위닝에 저장된 활동"
          value={String(overview.total)}
          unit="건"
          note={`교과 ${overview.byGroup.curricular}건, 창체 ${overview.byGroup.extracurricular}건`}
        />
        <Stat
          label="1학년 자료 충분도"
          value={overview.firstYear.label}
          note={`1학년 활동 ${overview.firstYear.count}건이에요`}
        />
        <Stat
          label="학생 조사"
          value={String(questionCount)}
          unit="문항"
          note="약 10분 걸려요"
        />
      </div>
    </section>
  );
}
