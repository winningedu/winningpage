import { Input } from "@/components/ui/input";
import type {
  GradeInputSemester,
  GradeSystem,
  SemesterKey,
} from "@/lib/growth/api";
import { CollectSection, NoticeBox } from "./CollectSection";
import { gradeSystemInfo, semesterTitle } from "./collectLogic";

const GOAL_SOURCE_TEXT = "목표관리에 기록된 값을 가져왔어요. 고칠 수 있어요.";

/** 성적 카드(No.46, 73, 75, 153, 154). 입력 칸은 분석 범위 학기마다 하나씩이다. */
export function GradesCard({
  system,
  admissionYear,
  note,
  keys,
  serverSemesters,
  values,
  errors,
  onChange,
  onBlur,
}: {
  system: GradeSystem | null;
  admissionYear: number | null;
  note: string | null;
  keys: SemesterKey[];
  serverSemesters: GradeInputSemester[];
  /** 칸에 보여 줄 문자열(사용자가 고친 값 또는 서버 평균). */
  values: Partial<Record<SemesterKey, string>>;
  errors: Partial<Record<SemesterKey, string>>;
  onChange: (key: SemesterKey, text: string) => void;
  onBlur: (key: SemesterKey) => void;
}) {
  const info = gradeSystemInfo(system, admissionYear);
  const fromGoal = serverSemesters.some((s) => s.source === "goal");

  return (
    <CollectSection
      title="성적"
      description="학기별 평균 등급을 적어 주세요. 비워 두면 성적 진단은 자료 없음으로 두고 리포트는 그대로 만들어요."
    >
      <div className="flex items-center justify-between">
        <span className="text-app-label text-ink-sub">등급 체계</span>
        {info.label && (
          <span className="flex items-center gap-2">
            <span className="text-app-body font-semibold text-ink-strong">
              {info.label}
            </span>
            {info.basis && (
              <span className="rounded-full bg-surface-03 px-2 py-0.5 text-app-badge font-medium text-ink-strong">
                {info.basis}
              </span>
            )}
          </span>
        )}
      </div>

      {info.notice && (
        <div className="mt-3">
          <NoticeBox role="status">{info.notice}</NoticeBox>
        </div>
      )}

      {system !== null && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {keys.map((key) => {
              const id = `grade-${key}`;
              const error = errors[key];
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <label
                    htmlFor={id}
                    className="text-app-label font-semibold text-ink-strong"
                  >
                    {semesterTitle(key)}
                  </label>
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={values[key] ?? ""}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(e) => onChange(key, e.target.value)}
                    onBlur={() => onBlur(key)}
                    className="h-10"
                  />
                  {error && (
                    <p
                      id={`${id}-error`}
                      className="text-app-caption text-error"
                    >
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {fromGoal && (
            <p className="mt-3 text-app-caption text-ink-sub">
              {GOAL_SOURCE_TEXT}
            </p>
          )}
          {note && (
            <div className="mt-3">
              <NoticeBox>{note}</NoticeBox>
            </div>
          )}
        </>
      )}
    </CollectSection>
  );
}
