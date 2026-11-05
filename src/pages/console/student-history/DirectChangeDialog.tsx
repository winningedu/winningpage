// W13b 학생 정보 직접 변경 창(관리자). 학년, 그룹, 반, 번호를 고치고 이력 사유를 남긴다.
// 그룹은 반 선택지를 거르는 용도이고 서버에는 반(classId)만 보낸다. 바뀐 것이 없으면 저장을 막는다.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { consoleRequest, errorCode, errorMessage } from "../api";
import { gradeLabel } from "../classLabel";
import FilterSelect from "../FilterSelect";
import Notice from "../Notice";
import { SAVE_FAILED_MESSAGE } from "../passwordRule";
import TextField from "../TextField";
import { useToast } from "../Toast";
import type { StudentItem } from "./StudentListTab";
import { gradesOf, useClasses } from "./useClasses";

const REASONS = [
  ["auto", "자동"],
  ["promotion", "진급"],
  ["class_change", "반 변경"],
  ["number_change", "번호 변경"],
  ["transfer", "전입과 전학"],
  ["correction", "정정"],
] as const;

const CONFLICT_MESSAGE = "다른 분이 먼저 바꿨어요. 새로 고침해 주세요";
const NUMBER_INVALID_MESSAGE = "번호는 1부터 99까지 숫자로 적어 주세요";
const NONE = { value: "", label: "선택" };

interface DirectChangeDialogProps {
  student: StudentItem;
  onSaved: () => void;
  /** 다른 분이 먼저 바꿨을 때. 목록을 다시 불러와 student 의 version 이 새로 오게 한다. */
  onConflict: () => void;
  onClose: () => void;
}

// 비우면 번호를 지우는 것(null)이고, 적었으면 1부터 99까지 정수(끝의 "번"은 뗀다)만 받는다. 그 밖은 undefined.
function parseNumber(input: string): number | null | undefined {
  const text = input.trim().replace(/번$/, "").trim();
  if (text === "") return null;
  if (!/^\d{1,2}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= 1 ? value : undefined;
}

function numberTakenMessage(body: unknown): string {
  const { occupant } = body as {
    occupant?: {
      grade: string;
      className: string;
      number: number;
      displayName: string | null;
    };
  };
  if (!occupant) return errorMessage(body) ?? SAVE_FAILED_MESSAGE;
  const place = `${gradeLabel(occupant.grade)} ${occupant.className}반 ${occupant.number}번`;
  const holder = occupant.displayName ? `, ${occupant.displayName}` : "";
  return `이미 사용 중인 번호예요(${place}${holder}). 다른 번호를 골라 주세요`;
}

export default function DirectChangeDialog({
  student,
  onSaved,
  onConflict,
  onClose,
}: DirectChangeDialogProps) {
  const toast = useToast();
  const { enrollment } = student;
  // 처음 열 때의 값. 목록이 다시 불러와져도 입력값과 비교할 기준은 그대로다.
  const [initial] = useState({
    grade: enrollment.grade ?? "",
    groupId: enrollment.groupId ?? "",
    classId: enrollment.classId ?? "",
    number: enrollment.number === null ? "" : String(enrollment.number),
  });
  const [grade, setGrade] = useState(initial.grade);
  const [groupId, setGroupId] = useState(initial.groupId);
  const [classId, setClassId] = useState(initial.classId);
  const [number, setNumber] = useState(initial.number);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const schoolYear = useQuery({
    queryKey: ["console", "school-year"],
    queryFn: async () => {
      const res = await consoleRequest("/api/console/school-year");
      if (res.status !== 200) throw new Error(`school-year ${res.status}`);
      return (res.body as { schoolYear: number }).schoolYear;
    },
    retry: false,
  });
  const currentYear = schoolYear.data;
  const applyYear = pickedYear ?? currentYear;
  const classes = useClasses(applyYear === currentYear ? undefined : applyYear);
  const ready =
    currentYear !== undefined && applyYear !== undefined && classes.data;

  const changeYear = (year: number) => {
    setPickedYear(year);
    setClassId("");
  };
  const changeGrade = (next: string) => {
    setGrade(next);
    setGroupId("");
    setClassId("");
  };

  const options = classes.data ?? [];
  const groups = new Map<string, string>();
  for (const c of options) {
    if (c.grade === grade && c.groupId && c.groupName)
      groups.set(c.groupId, c.groupName);
  }
  const classOptions = options.filter(
    (c) => c.grade === grade && (c.groupId ?? "") === groupId,
  );

  const changed =
    grade !== initial.grade ||
    classId !== initial.classId ||
    number.trim() !== initial.number ||
    applyYear !== currentYear;

  const save = async () => {
    const parsedNumber = parseNumber(number);
    if (parsedNumber === undefined) {
      setNumberError(NUMBER_INVALID_MESSAGE);
      return;
    }
    setSaving(true);
    setNumberError(null);
    setNotice(null);
    try {
      const res = await consoleRequest("/api/console/students/enrollment", {
        method: "PATCH",
        body: {
          studentId: student.studentId,
          expectedVersion: enrollment.version,
          grade: grade || null,
          classId: classId || null,
          number: parsedNumber,
          reason: reason || null,
          applyYear,
        },
      });
      const code = errorCode(res.body);
      if (res.status === 200) {
        toast.show({
          tone: "Success",
          message: `${student.name} 학생 정보를 바꿨어요`,
        });
        onSaved();
        return;
      }
      if (code === "NUMBER_TAKEN") setNumberError(numberTakenMessage(res.body));
      else if (code === "VERSION_CONFLICT") {
        setNotice(CONFLICT_MESSAGE);
        onConflict();
      } else setNotice(errorMessage(res.body) ?? SAVE_FAILED_MESSAGE);
    } catch {
      setNotice(SAVE_FAILED_MESSAGE);
    }
    setSaving(false);
  };

  const current = [
    `${enrollment.grade ? gradeLabel(enrollment.grade) : ""} ${enrollment.className ? `${enrollment.className}반` : ""} ${enrollment.number === null ? "" : `${enrollment.number}번`}`
      .replace(/\s+/g, " ")
      .trim(),
    student.groupName ?? "그룹 없음",
  ].join(", ");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[32.5rem]"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          학생 정보 직접 변경
        </DialogTitle>
        <div className="flex flex-col gap-1">
          <p className="text-app-label text-ink-strong">{`대상 학생: ${student.name}`}</p>
          <p className="text-app-caption text-ink-sub">{`지금 ${current}`}</p>
        </div>
        {ready && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FilterSelect
                variant="stacked"
                label="새 학년그룹"
                value={grade}
                options={gradesOf(options).map((g) => ({
                  value: g,
                  label: gradeLabel(g),
                }))}
                onChange={changeGrade}
              />
              <FilterSelect
                variant="stacked"
                label="새 그룹(레벨이 구분되어 있으면 입력, 없으면 빈칸)"
                value={groupId}
                options={[
                  { value: "", label: "그룹 없음" },
                  ...[...groups].map(([value, label]) => ({ value, label })),
                ]}
                onChange={(next) => {
                  setGroupId(next);
                  setClassId("");
                }}
              />
              <FilterSelect
                variant="stacked"
                label="새 반"
                value={classId}
                options={[
                  NONE,
                  ...classOptions.map((c) => ({
                    value: c.id,
                    label: `${c.name}반`,
                  })),
                ]}
                onChange={setClassId}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="새 번호"
                inputMode="numeric"
                value={number}
                error={numberError}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setNumberError(null);
                }}
              />
              <FilterSelect
                variant="stacked"
                label="적용 학년도"
                value={String(applyYear)}
                options={[currentYear, currentYear + 1].map((y) => ({
                  value: String(y),
                  label: String(y),
                }))}
                onChange={(y) => changeYear(Number(y))}
              />
            </div>
            <FilterSelect
              variant="stacked"
              label="사유"
              value={reason}
              options={[
                NONE,
                ...REASONS.map(([value, label]) => ({ value, label })),
              ]}
              onChange={setReason}
            />
            <p className="text-app-caption text-ink-sub">
              사유: 자동, 진급, 반 변경, 번호 변경, 전입과 전학, 정정 중 선택
            </p>
          </div>
        )}
        <p className="text-app-caption text-ink-sub">
          옮길 반에 담임이 없으면 안내만 하고 바로 반영해요
        </p>
        {notice && <Notice tone="Danger">{notice}</Notice>}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!ready || !changed || classId === "" || saving}
            onClick={() => void save()}
            className="h-10 rounded-lg px-5 text-app-label font-semibold disabled:opacity-40"
          >
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
