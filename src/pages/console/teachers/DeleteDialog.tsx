// W14d 한 명 삭제 확인 창(교 #118, #204). 재학생 수와 연결 계정 삭제를 알린다. 학생 정보는 남고 담임 표시는 "(미등록)"이 된다.

import { useState } from "react";
import { consoleRequest, errorMessage } from "../api";
import Notice from "../Notice";
import type { TeacherSummary } from "./roster";
import TeacherDialog, {
  CancelButton,
  ConfirmButton,
  DialogFooter,
} from "./TeacherDialog";

const FAILED_MESSAGE = "선생님을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요";

/** 삭제를 보내고 실패하면 창에 보일 문구, 성공하면 null. */
export async function deleteTeachers(ids: string[]): Promise<string | null> {
  const res = await consoleRequest("/api/console/teachers/delete", {
    method: "POST",
    body: { teacherIds: ids },
  });
  return res.status === 200 ? null : (errorMessage(res.body) ?? FAILED_MESSAGE);
}

interface DeleteDialogProps {
  teacher: TeacherSummary;
  onDeleted: () => void;
  onClose: () => void;
}

export default function DeleteDialog({
  teacher,
  onDeleted,
  onClose,
}: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const failure = await deleteTeachers([teacher.id]);
    setBusy(false);
    if (failure) setError(failure);
    else onDeleted();
  };

  return (
    <TeacherDialog
      title={`${teacher.name} 선생님을 삭제할까요?`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-app-body text-ink">
        <p>{`이 선생님이 맡은 학급의 재학생 ${teacher.activeStudents}명은 그대로 남고, 담임 표시는 (미등록)으로 바뀌어요. 가입할 때 그 반을 고를 수 없게 돼요.`}</p>
        <p>연결 계정도 함께 삭제돼요. 학생 정보는 그대로 남아요</p>
        {error && <Notice tone="Danger">{error}</Notice>}
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose} />
        <ConfirmButton
          tone="danger"
          disabled={busy}
          onClick={() => void confirm()}
        >
          삭제
        </ConfirmButton>
      </DialogFooter>
    </TeacherDialog>
  );
}
