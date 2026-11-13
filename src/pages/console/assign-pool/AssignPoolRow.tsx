// W12 미배정 학생 한 줄. 학년그룹, 그룹, 반, 번호를 정해 배치한다. 반은 학년그룹을 고른 뒤에만 열린다(교 #151).
// 배치 실패는 이 줄 이름 아래에만 보이고 다른 줄은 그대로 쓴다. 그룹은 반 선택지를 거르는 용도이고 서버에는 반만 보낸다.

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { consoleRequest, errorCode, errorMessage } from "../api";
import {
  CONFLICT_MESSAGE,
  NUMBER_INVALID_MESSAGE,
  numberTakenMessage,
  parseNumber,
} from "../enrollmentEdit";
import NameCell from "../NameCell";
import { SAVE_FAILED_MESSAGE } from "../passwordRule";
import { useToast } from "../Toast";
import {
  type ClassOption,
  studentClassesOf,
  studentGradesOf,
  studentGroupsOf,
} from "../useClasses";
import { useGradeLabel } from "../useConsoleMe";
import { CONSOLE_LIST_KEY } from "../usePagedList";
import type { PoolStudent } from "./types";

const ALREADY_ASSIGNED_MESSAGE = "이미 학급이 정해져 있어요.";

function CellSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "relative flex h-10 items-center rounded-lg bg-surface-muted px-3",
        disabled && "opacity-40",
      )}
    >
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-app-label font-semibold text-ink-strong outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 size-4 text-ink-sub"
      />
    </div>
  );
}

interface AssignPoolRowProps {
  student: PoolStudent;
  classes: ClassOption[];
  selected: boolean;
  mobile: boolean;
  onSelect: () => void;
}

export default function AssignPoolRow({
  student,
  classes,
  selected,
  mobile,
  onSelect,
}: AssignPoolRowProps) {
  const gradeLabel = useGradeLabel();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [grade, setGrade] = useState(student.grade ?? "");
  const [groupId, setGroupId] = useState("");
  const [classId, setClassId] = useState("");
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [numberInvalid, setNumberInvalid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const target = classes.find((c) => c.id === classId);
  const refetch = () =>
    void queryClient.invalidateQueries({ queryKey: CONSOLE_LIST_KEY });

  const assign = async () => {
    const parsed = parseNumber(number);
    setMessage(null);
    setNumberInvalid(false);
    if (parsed === undefined) {
      setNumberInvalid(true);
      setMessage(NUMBER_INVALID_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const res = await consoleRequest("/api/console/students/enrollment", {
        method: "PATCH",
        body: {
          studentId: student.studentId,
          expectedVersion: student.enrollmentVersion,
          grade,
          classId,
          number: parsed,
        },
      });
      const code = errorCode(res.body);
      if (res.status === 200) {
        toast.show({
          tone: "Success",
          message: `${student.name} 학생을 ${gradeLabel(grade)} ${target?.name}반에 배치했어요`,
        });
        refetch();
        return;
      }
      if (code === "NUMBER_TAKEN") {
        setNumberInvalid(true);
        setMessage(numberTakenMessage(res.body, gradeLabel));
      } else if (code === "VERSION_CONFLICT") {
        setMessage(CONFLICT_MESSAGE);
        refetch();
      } else if (code === "ALREADY_ASSIGNED") {
        setMessage(ALREADY_ASSIGNED_MESSAGE);
        refetch();
      } else setMessage(errorMessage(res.body) ?? SAVE_FAILED_MESSAGE);
    } catch {
      setMessage(SAVE_FAILED_MESSAGE);
    }
    setSaving(false);
  };

  const gradeSelect = (
    <CellSelect
      label="학년그룹 선택"
      value={grade}
      options={[
        { value: "", label: "학년그룹 선택" },
        ...studentGradesOf(classes).map((g) => ({
          value: g,
          label: gradeLabel(g),
        })),
      ]}
      onChange={(next) => {
        setGrade(next);
        setGroupId("");
        setClassId("");
      }}
    />
  );
  const groupSelect = (
    <CellSelect
      label="그룹"
      value={groupId}
      options={[
        { value: "", label: "그룹 없음" },
        ...studentGroupsOf(classes, grade).map((g) => ({
          value: g.id,
          label: g.name,
        })),
      ]}
      onChange={(next) => {
        setGroupId(next);
        setClassId("");
      }}
    />
  );
  const classSelect = (
    <CellSelect
      label="반 선택"
      value={classId}
      disabled={grade === ""}
      options={[
        { value: "", label: "반 선택" },
        ...studentClassesOf(classes, grade, groupId).map((c) => ({
          value: c.id,
          label: `${c.name}반`,
        })),
      ]}
      onChange={setClassId}
    />
  );
  const numberInput = (
    <Input
      inputMode="numeric"
      aria-label="번호 입력"
      aria-invalid={numberInvalid ? true : undefined}
      placeholder="번호 입력"
      value={number}
      onChange={(e) => {
        setNumber(e.target.value);
        setNumberInvalid(false);
      }}
      className="h-8 min-w-0 rounded-lg border-line px-3 text-app-label aria-invalid:border-error aria-invalid:ring-0"
    />
  );
  const assignButton = (
    <Button
      type="button"
      disabled={grade === "" || classId === "" || saving}
      onClick={() => void assign()}
      className={cn(
        "rounded-lg text-app-label font-semibold disabled:opacity-40",
        mobile ? "h-11 w-full" : "h-8 px-3",
      )}
    >
      배치
    </Button>
  );
  const error = message && (
    <span className="text-app-caption font-medium text-ink-danger">
      {message}
    </span>
  );

  if (mobile) {
    const field = (label: string, control: React.ReactNode) => (
      <div className="flex items-center justify-between gap-3">
        <span className="text-app-caption text-ink-sub">{label}</span>
        <div className="w-40">{control}</div>
      </div>
    );
    return (
      <li
        className={cn(
          "flex flex-col gap-3 border-b border-line py-4",
          selected && "bg-surface-info",
        )}
      >
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onSelect}
            className="flex flex-col gap-1 text-left"
          >
            <NameCell name={student.name} />
            <span className="text-app-caption text-ink-sub">{`동명 재학생 ${student.sameNameCount}명`}</span>
          </button>
          {error}
        </div>
        {field("학년그룹", gradeSelect)}
        {field("그룹", groupSelect)}
        {field("반", classSelect)}
        {field("번호", numberInput)}
        {assignButton}
      </li>
    );
  }
  return (
    <TableRow
      onClick={onSelect}
      className={cn("align-top", selected && "bg-surface-info")}
    >
      <TableCell>
        <div className="flex flex-col gap-1">
          <NameCell name={student.name} />
          {error}
        </div>
      </TableCell>
      <TableCell className="text-right">{`${student.sameNameCount}명`}</TableCell>
      <TableCell>{gradeSelect}</TableCell>
      <TableCell>{groupSelect}</TableCell>
      <TableCell>{classSelect}</TableCell>
      <TableCell>{numberInput}</TableCell>
      <TableCell className="text-right">{assignButton}</TableCell>
    </TableRow>
  );
}
