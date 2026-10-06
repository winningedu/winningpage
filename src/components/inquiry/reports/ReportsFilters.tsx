import { useId } from "react";
import { STATUS_FILTER_OPTIONS, type StatusFilter } from "./reportsLogic";

type Props = {
  subjects: string[];
  subject: string;
  status: StatusFilter;
  onSubjectChange: (subject: string) => void;
  onStatusChange: (status: StatusFilter) => void;
};

const SELECT =
  "h-10 min-w-[10rem] rounded-lg border border-border bg-white px-3 text-app-label text-ink-strong";

export default function ReportsFilters({
  subjects,
  subject,
  status,
  onSubjectChange,
  onStatusChange,
}: Props) {
  const subjectId = useId();
  const statusId = useId();
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <label
          htmlFor={subjectId}
          className="text-app-label font-semibold text-ink-sub"
        >
          과목
        </label>
        <select
          id={subjectId}
          className={SELECT}
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
        >
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor={statusId}
          className="text-app-label font-semibold text-ink-sub"
        >
          상태
        </label>
        <select
          id={statusId}
          className={SELECT}
          value={status}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
