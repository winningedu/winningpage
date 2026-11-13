// W14e 선생님 삭제하기. "선택 삭제"는 체크한 선생님, "일괄 삭제"는 학년그룹과 그룹 조건에 맞는 선생님을 한 번에 지운다(교 #211).
// 활성 학교 전체 관리자가 한 명도 남지 않게 되면 막는다(blocked). 서버도 같은 규칙으로 거절한다.

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GradeLabeler } from "../classLabel";
import FilterSelect from "../FilterSelect";
import Notice from "../Notice";
import { useGradeLabel } from "../useConsoleMe";
import { GRADES } from "./ClassRowFields";
import { deleteTeachers } from "./DeleteDialog";
import { classText, type TeacherSummary } from "./roster";
import TeacherDialog, {
  CancelButton,
  ConfirmButton,
  DialogFooter,
} from "./TeacherDialog";

const BLOCKED_MESSAGE =
  "활성 학교 전체 관리자가 한 명도 남지 않아 삭제할 수 없어요. 다른 관리자를 먼저 지정해 주세요";
const ALL = { value: "", label: "전체" };

type Mode = "select" | "condition";

interface BulkDeleteDialogProps {
  teachers: TeacherSummary[];
  onDeleted: () => void;
  onClose: () => void;
}

const classesLabel = (t: TeacherSummary, gradeLabel: GradeLabeler) =>
  t.classes.length > 0
    ? t.classes.map((c) => classText(c, gradeLabel)).join(", ")
    : "-";

export default function BulkDeleteDialog({
  teachers,
  onDeleted,
  onClose,
}: BulkDeleteDialogProps) {
  const gradeLabel = useGradeLabel();
  const [mode, setMode] = useState<Mode>("select");
  const [picked, setPicked] = useState<string[]>([]);
  const [grade, setGrade] = useState("");
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gradesInUse = new Set(
    teachers.flatMap((t) => t.classes.map((c) => c.grade)),
  );
  const grades = GRADES.filter((g) => gradesInUse.has(g));
  const groups = new Map(
    teachers.flatMap((t) =>
      t.classes
        .filter(
          (c) => c.groupId && c.groupName && (!grade || c.grade === grade),
        )
        .map((c) => [c.groupId as string, c.groupName as string] as const),
    ),
  );

  const targets =
    mode === "select"
      ? teachers.filter((t) => picked.includes(t.id))
      : grade === ""
        ? []
        : teachers.filter((t) =>
            t.classes.some(
              (c) => c.grade === grade && (!groupId || c.groupId === groupId),
            ),
          );
  const targetIds = new Set(targets.map((t) => t.id));
  const adminsLeft = teachers.filter(
    (t) =>
      t.role === "school_admin" &&
      t.status === "active" &&
      !targetIds.has(t.id),
  ).length;
  const blocked =
    targets.some((t) => t.role === "school_admin") && adminsLeft === 0;
  const students = targets.reduce((sum, t) => sum + t.activeStudents, 0);

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const failure = await deleteTeachers(targets.map((t) => t.id));
    setBusy(false);
    if (failure) setError(failure);
    else onDeleted();
  };

  const tabClass = (active: boolean) =>
    cn(
      "-mb-px border-b-2 pb-2 text-app-body",
      active
        ? "border-primary font-semibold text-primary"
        : "border-transparent text-ink",
    );

  return (
    <TeacherDialog title="선생님 삭제하기" onClose={onClose} wide>
      <div role="tablist" className="flex gap-6 border-b border-line">
        {(
          [
            ["select", "선택 삭제"],
            ["condition", "일괄 삭제"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={tabClass(mode === key)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "select" ? (
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {teachers.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-line py-2 text-app-label text-ink"
            >
              <input
                type="checkbox"
                aria-label={`${t.name} 선택`}
                checked={picked.includes(t.id)}
                onChange={() => toggle(t.id)}
              />
              <span className="w-20 font-semibold text-ink-strong">
                {t.name}
              </span>
              <span className="flex-1 text-ink-sub">
                {classesLabel(t, gradeLabel)}
              </span>
              <span>{`재학생 ${t.activeStudents}명`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <FilterSelect
              variant="stacked"
              label="학년그룹"
              value={grade}
              options={[
                ALL,
                ...grades.map((g) => ({ value: g, label: gradeLabel(g) })),
              ]}
              onChange={(value) => {
                setGrade(value);
                setGroupId("");
              }}
            />
            <FilterSelect
              variant="stacked"
              label="그룹"
              value={groupId}
              options={[
                ALL,
                ...[...groups].map(([value, label]) => ({ value, label })),
              ]}
              onChange={setGroupId}
            />
          </div>
          <ul
            aria-label="삭제 대상"
            className="flex max-h-60 flex-col overflow-y-auto"
          >
            {targets.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 border-b border-line py-2 text-app-label text-ink"
              >
                <span className="w-20 font-semibold text-ink-strong">
                  {t.name}
                </span>
                <span className="flex-1 text-ink-sub">
                  {classesLabel(t, gradeLabel)}
                </span>
                <span>{`재학생 ${t.activeStudents}명`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-app-label font-semibold text-ink-strong">
          {`대상 ${targets.length}명, 재학생 ${students}명`}
        </p>
        <p className="text-app-label text-ink-sub">
          연결 계정도 함께 삭제돼요. 학생 정보는 그대로 남아요
        </p>
        {blocked && <Notice tone="Danger">{BLOCKED_MESSAGE}</Notice>}
        {error && <Notice tone="Danger">{error}</Notice>}
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose} />
        <ConfirmButton
          tone="danger"
          disabled={targets.length === 0 || blocked || busy}
          onClick={() => void confirm()}
        >
          삭제
        </ConfirmButton>
      </DialogFooter>
    </TeacherDialog>
  );
}
