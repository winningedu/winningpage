// W7 반별 카드(768 미만). 제목은 담임, 오른쪽은 학년그룹과 반, 서비스 6칸은 "25명 (83%)" 형식이다.

import { useGradeLabel } from "../useConsoleMe";
import { type ClassRow, gradeGroupLabel, percent, SERVICES } from "./format";

interface Props {
  rows: ClassRow[];
  /** 정원 입력 중이면 정원 칸이 입력 칸이다(값은 입력한 글 그대로). */
  edit?: {
    values: Record<string, string>;
    onChange: (id: string, v: string) => void;
  };
}

export default function ClassCards({ rows, edit }: Props) {
  const gradeLabel = useGradeLabel();
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const title = r.homeroomName ?? "담임 미배정";
        return (
          <article
            key={r.classId}
            aria-label={title}
            className="flex flex-col gap-3 rounded-2xl bg-goal-cardTone-neutral p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-app-body font-semibold text-ink-strong">
                {title}
              </h3>
              <span className="text-app-label text-ink-sub">{`${gradeGroupLabel(r, gradeLabel)} ${r.className}반`}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-app-caption text-ink-sub">총원 / 정원</span>
              {edit ? (
                <span className="inline-flex items-center gap-1 text-app-label text-ink">
                  {`${r.total} /`}
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={`${r.className}반 정원`}
                    value={edit.values[r.classId] ?? ""}
                    onChange={(e) => edit.onChange(r.classId, e.target.value)}
                    className="h-9 w-20 rounded-lg border border-line bg-background px-2 text-right text-app-label"
                  />
                </span>
              ) : (
                <span className="text-app-label font-medium text-ink">
                  {r.capacity === null
                    ? `${r.total}`
                    : `${r.total} / ${r.capacity}`}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-app-caption text-ink-sub">이용 학생</span>
              <span className="text-app-label font-medium text-ink">{`${r.joined} / ${r.total}`}</span>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {SERVICES.map((s) => (
                <div key={s.key} className="flex flex-col gap-0.5">
                  <dt className="text-app-caption text-ink-sub">{s.label}</dt>
                  <dd className="text-app-label text-ink">
                    {`${r.services[s.key]}명 (${percent(r.services[s.key], r.total)}%)`}
                  </dd>
                </div>
              ))}
            </dl>
            {r.goalRateAvg !== null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-app-caption text-ink-sub">
                  목표 실행률 평균
                </span>
                <span className="text-app-label font-medium text-ink">{`${r.goalRateAvg}%`}</span>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
