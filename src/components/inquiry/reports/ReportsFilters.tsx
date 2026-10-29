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
  "h-10 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-app-label text-ink-strong md:w-auto md:min-w-[10rem]";

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
    <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
        <label
          htmlFor={subjectId}
          className="whitespace-nowrap text-app-label font-semibold text-ink-sub"
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
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
        <label
          htmlFor={statusId}
          className="whitespace-nowrap text-app-label font-semibold text-ink-sub"
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
