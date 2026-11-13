// W6b 학생 정보 편집 창(담임). 학년, 그룹, 반, 번호를 고친다. 그룹은 반 선택지를 거르는 용도이고
// 서버에는 반(classId)만 보낸다. 담임은 담당 반으로만 옮긴다(결정 28). 새 담임 알림 문장은 뺐다(결정 29).

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { consoleRequest, errorCode, errorMessage } from "../api";
import {
  CONFLICT_MESSAGE,
  NUMBER_INVALID_MESSAGE,
  numberTakenMessage,
  parseNumber,
} from "../enrollmentEdit";
import FilterSelect from "../FilterSelect";
import Notice from "../Notice";
import { SAVE_FAILED_MESSAGE } from "../passwordRule";
import TextField from "../TextField";
import { useToast } from "../Toast";
import {
  type ClassOption,
  studentClassesOf,
  studentGradesOf,
  studentGroupsOf,
} from "../useClasses";
import { useGradeLabel } from "../useConsoleMe";
import { CONSOLE_LIST_KEY } from "../usePagedList";
import type { StudentRow } from "./types";

const GRADE_NOTICE = "학년이 바뀌면 목표관리 D-day와 내신 기준이 바뀌어요";
const NO_HOMEROOM_NOTICE =
  "옮길 반에는 담임이 없어요. 안내만 하고 그대로 반영해요";
const GROUP_LABEL = "그룹(레벨이 구분되어 있으면 입력, 없으면 빈칸)";

interface StudentEditDialogProps {
  student: StudentRow;
  classes: ClassOption[];
  onClose: () => void;
}

export default function StudentEditDialog({
  student,
  classes,
  onClose,
}: StudentEditDialogProps) {
  const gradeLabel = useGradeLabel();
  const toast = useToast();
  const queryClient = useQueryClient();
  // 처음 열 때의 값. 목록이 다시 불러와져도 입력값과 비교할 기준은 그대로다.
  const [initial] = useState({
    grade: student.grade ?? "",
    classId: student.classId ?? "",
    number: student.number === null ? "" : String(student.number),
  });
  const [grade, setGrade] = useState(initial.grade);
  const [groupId, setGroupId] = useState(student.groupId ?? "");
  const [classId, setClassId] = useState(initial.classId);
  const [number, setNumber] = useState(initial.number);
  const [saving, setSaving] = useState(false);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const target = classes.find((c) => c.id === classId);
  const changed =
    grade !== initial.grade ||
    classId !== initial.classId ||
    number.trim() !== initial.number;

  const save = async () => {
    // 번호 칸을 고치지 않았으면 저장된 번호를 그대로 두고, 고친 입력만 검사한다.
    const edited = number.trim() !== initial.number;
    const parsed = edited ? parseNumber(number) : student.number;
    if (parsed === undefined) {
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
          expectedVersion: student.enrollmentVersion,
          grade: grade || null,
          classId: classId || null,
          number: parsed,
        },
      });
      const code = errorCode(res.body);
      if (res.status === 200) {
        toast.show({
          tone: "Success",
          message: `${student.displayName} 학생 정보를 바꿨어요`,
        });
        void queryClient.invalidateQueries({ queryKey: CONSOLE_LIST_KEY });
        onClose();
        return;
      }
      if (code === "NUMBER_TAKEN")
        setNumberError(numberTakenMessage(res.body, gradeLabel));
      else if (code === "VERSION_CONFLICT") {
        setNotice(CONFLICT_MESSAGE);
        void queryClient.invalidateQueries({ queryKey: CONSOLE_LIST_KEY });
      } else setNotice(errorMessage(res.body) ?? SAVE_FAILED_MESSAGE);
    } catch {
      setNotice(SAVE_FAILED_MESSAGE);
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[32.5rem]"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          학생 정보 편집
        </DialogTitle>
        <div className="grid grid-cols-2 items-end gap-3">
          <FilterSelect
            variant="stacked"
            label="학년"
            value={grade}
            options={studentGradesOf(classes).map((g) => ({
              value: g,
              label: gradeLabel(g),
            }))}
            onChange={(next) => {
              setGrade(next);
              setGroupId("");
              setClassId("");
            }}
          />
          <FilterSelect
            variant="stacked"
            label={GROUP_LABEL}
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
          <FilterSelect
            variant="stacked"
            label="반"
            value={classId}
            options={[
              { value: "", label: "선택" },
              ...studentClassesOf(classes, grade, groupId).map((c) => ({
                value: c.id,
                label: `${c.name}반`,
              })),
            ]}
            onChange={setClassId}
          />
          <TextField
            label="번호"
            inputMode="numeric"
            value={number}
            error={numberError}
            onChange={(e) => {
              setNumber(e.target.value);
              setNumberError(null);
            }}
          />
        </div>
        {grade !== initial.grade && <Notice tone="Info">{GRADE_NOTICE}</Notice>}
        {target && !target.hasHomeroom && (
          <Notice tone="Info">{NO_HOMEROOM_NOTICE}</Notice>
        )}
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
            disabled={!changed || classId === "" || saving}
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
