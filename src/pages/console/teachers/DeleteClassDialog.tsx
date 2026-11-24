// QA 51 빈 반 삭제 확인 창. 학생, 대기 명단, 담당 선생님이 없는 반만 서버가 지운다(409 면 그 문구를 보인다).
// 이미 지워진 반(404)은 내가 누른 삭제가 끝난 것과 같아서 성공으로 닫는다.

import { useMutation } from "@tanstack/react-query";
import { consoleRequest, errorMessage } from "../api";
import Notice from "../Notice";
import TeacherDialog, {
  CancelButton,
  ConfirmButton,
  DialogFooter,
} from "./TeacherDialog";

const FAILED_MESSAGE = "반을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요";

interface DeleteClassDialogProps {
  classId: string;
  /** "중3 1반" 같은 반 표기. */
  label: string;
  onDeleted: () => void;
  onClose: () => void;
}

export default function DeleteClassDialog({
  classId,
  label,
  onDeleted,
  onClose,
}: DeleteClassDialogProps) {
  const remove = useMutation({
    mutationFn: async () => {
      const res = await consoleRequest("/api/console/classes/delete", {
        method: "POST",
        body: { classId },
      });
      if (res.status !== 200 && res.status !== 404) {
        throw new Error(errorMessage(res.body) ?? FAILED_MESSAGE);
      }
    },
    onSuccess: onDeleted,
  });

  return (
    <TeacherDialog title={`${label}을 삭제할까요?`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-app-body text-ink">
        <p>
          비어 있는 반이라 삭제하면 선생님 목록과 가입할 때 반 선택에서 사라져요
        </p>
        {remove.isError && (
          <Notice tone="Danger">{remove.error.message}</Notice>
        )}
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose} />
        <ConfirmButton
          tone="danger"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          삭제
        </ConfirmButton>
      </DialogFooter>
    </TeacherDialog>
  );
}
