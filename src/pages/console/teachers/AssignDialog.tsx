// W16a 담당 변경과 추가(교 #232). 담당 표에서 학급을 하나씩 해제하고, 아래 입력으로 학급을 더한다.
// 해제와 추가는 각각 한 번의 요청이다. 담임의 마지막 학급은 막고(서버도 막는다), 주 담당을 해제하면
// 남는 첫 학급을 주 담당으로 함께 보낸다. 다른 선생님이 담임인 학급은 서버가 거절하고 그 문구를 보인다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { consoleRequest, errorMessage } from "../api";
import Notice from "../Notice";
import { useGradeLabel, useIsAcademy } from "../useConsoleMe";
import { useGroups } from "../useGroups";
import ClassRowFields, {
  type ClassInput,
  EMPTY_CLASS,
  toClassBody,
} from "./ClassRowFields";
import { type AccountItem, gradeGroupLabel } from "./roster";
import TeacherDialog, {
  CancelButton,
  ConfirmButton,
  DialogFooter,
} from "./TeacherDialog";

const FAILED_MESSAGE =
  "담당 학급을 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요";
const LAST_CLASS_MESSAGE =
  "담임은 담당 학급이 1개 이상 있어야 해서 마지막 학급은 해제할 수 없어요";

interface AssignDialogProps {
  /** 계정 목록의 최신 행. 바뀐 뒤 부모가 다시 읽어 내려준다. */
  teacher: AccountItem;
  onChanged: () => void;
  onClose: () => void;
}

export default function AssignDialog({
  teacher,
  onChanged,
  onClose,
}: AssignDialogProps) {
  const gradeLabel = useGradeLabel();
  const academy = useIsAcademy();
  const groups = useGroups();
  const [row, setRow] = useState<ClassInput>(EMPTY_CLASS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastClass = teacher.role === "homeroom" && teacher.classes.length === 1;
  const incomplete = (row.grade === "") !== (row.name.trim() === "");
  const filled = row.grade !== "" && row.name.trim() !== "";

  const send = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const res = await consoleRequest("/api/console/teachers/assignments", {
      method: "POST",
      body: { teacherId: teacher.id, ...body },
    });
    setBusy(false);
    if (res.status !== 200) {
      setError(errorMessage(res.body) ?? FAILED_MESSAGE);
      return false;
    }
    onChanged();
    return true;
  };

  const release = (classId: string) => {
    const target = teacher.classes.find((c) => c.id === classId);
    const next = teacher.classes.find((c) => c.id !== classId);
    void send({
      removeClassIds: [classId],
      ...(target?.isPrimary && next ? { primaryClassId: next.id } : {}),
    });
  };

  const add = async () => {
    const classes = toClassBody([row]);
    if (!classes) return;
    if (await send({ add: classes })) setRow(EMPTY_CLASS);
  };

  return (
    <TeacherDialog
      title={`${teacher.name} 선생님 (공통 아이디 ${teacher.loginId})`}
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-4">
        <table className="w-full text-app-label text-ink">
          <thead>
            <tr className="border-b border-line text-left text-ink-sub">
              <th className="py-2 font-medium">구분</th>
              <th className="py-2 font-medium">학년그룹</th>
              <th className="py-2 font-medium">반</th>
              <th className="py-2 text-right font-medium">학생 수</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {teacher.classes.map((c) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-2">{c.isPrimary ? "주 담당" : "추가"}</td>
                <td className="py-2">
                  {gradeGroupLabel(c.grade, c.groupName, gradeLabel)}
                </td>
                <td className="py-2">{`${c.name}반`}</td>
                <td className="py-2 text-right">{c.activeStudents}</td>
                <td className="py-2 text-right">
                  <Button
                    type="button"
                    disabled={lastClass || busy}
                    onClick={() => release(c.id)}
                    className="h-8 rounded-lg bg-surface-muted px-3 text-app-label font-semibold text-ink-strong hover:bg-surface-muted disabled:opacity-40"
                  >
                    담당 해제
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {teacher.classes.length === 0 && (
          <p className="text-app-label text-ink-sub">담당 학급이 아직 없어요</p>
        )}
        {lastClass && (
          <p className="text-app-caption text-ink-sub">{LAST_CLASS_MESSAGE}</p>
        )}
        <ClassRowFields
          value={row}
          groups={groups.data ?? []}
          academy={academy}
          onChange={setRow}
        />
        <Notice tone="Info">
          한 학급의 담임은 한 명이에요. 이미 담임이 있는 학급은 추가할 수 없어요
        </Notice>
        {error && <Notice tone="Danger">{error}</Notice>}
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose}>닫기</CancelButton>
        <ConfirmButton
          disabled={!filled || incomplete || busy}
          onClick={() => void add()}
        >
          추가
        </ConfirmButton>
      </DialogFooter>
    </TeacherDialog>
  );
}
