import { CARD } from "@/components/growth/start/cardStyles";
import type { HighGrade, SourceCounts } from "@/lib/selfeval/types";
import type { CandidateFilter } from "./activitiesLogic";

// "불러온 곳" 카드(시안 14, 20, 명세 No.26, 27). 출처 칩은 개수를 보여 주고 누르면 그 출처만 거른다.
// 학년도, 학년, 학기, 과목 필터는 후보 20건 안에서 클라이언트가 거른다.

type Props = {
  counts: SourceCounts;
  filter: CandidateFilter;
  onFilter: (next: CandidateFilter) => void;
  academicYears: number[];
  grades: HighGrade[];
  subjects: string[];
  /** 지금 골라 둔 활동 건수. */
  selectedCount: number;
};

const SELECT =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-app-caption text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const SOURCES = [
  { key: "performance", label: "위닝 수행평가" },
  { key: "deep", label: "위닝 심화탐구" },
  { key: "manual", label: "직접 입력" },
] as const;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 rounded-full border px-3 text-app-caption font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-white text-ink hover:bg-surface-04"
      }`}
    >
      {children}
    </button>
  );
}

export default function SourceFilterCard({
  counts,
  filter,
  onFilter,
  academicYears,
  grades,
  subjects,
  selectedCount,
}: Props) {
  return (
    <section className={CARD} aria-label="불러온 곳">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-app-card-title font-bold text-ink-strong">
          불러온 곳
        </h2>
        {selectedCount > 0 && (
          <span className="rounded-full bg-surface-badge px-3 py-1 text-app-caption font-semibold text-ink-strong">
            {selectedCount}건 선택됨
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SOURCES.map(({ key, label }) => (
          <Chip
            key={key}
            active={filter.source === key}
            onClick={() =>
              onFilter({
                ...filter,
                source: filter.source === key ? undefined : key,
              })
            }
          >
            {label} {counts[key]}
          </Chip>
        ))}
        <Chip
          active={filter.source === undefined}
          onClick={() => onFilter({ ...filter, source: undefined })}
        >
          전체 {counts.total}
        </Chip>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          aria-label="학년도 필터"
          className={SELECT}
          value={filter.academicYear ?? ""}
          onChange={(e) =>
            onFilter({
              ...filter,
              academicYear: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        >
          <option value="">학년도 전체</option>
          {academicYears.map((y) => (
            <option key={y} value={y}>
              {y}학년도
            </option>
          ))}
        </select>
        <select
          aria-label="학년 필터"
          className={SELECT}
          value={filter.gradeLabel ?? ""}
          onChange={(e) =>
            onFilter({
              ...filter,
              gradeLabel: (e.target.value || undefined) as
                | HighGrade
                | undefined,
            })
          }
        >
          <option value="">학년 전체</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          aria-label="학기 필터"
          className={SELECT}
          value={filter.semester ?? ""}
          onChange={(e) =>
            onFilter({
              ...filter,
              semester: e.target.value
                ? (Number(e.target.value) as 1 | 2)
                : undefined,
            })
          }
        >
          <option value="">학기 전체</option>
          <option value="1">1학기</option>
          <option value="2">2학기</option>
        </select>
        <select
          aria-label="과목 필터"
          className={SELECT}
          value={filter.subject ?? ""}
          onChange={(e) =>
            onFilter({ ...filter, subject: e.target.value || undefined })
          }
        >
          <option value="">과목 전체</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
