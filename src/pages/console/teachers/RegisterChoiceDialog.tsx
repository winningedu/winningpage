// W14a 등록 방식 고르기. "계정 생성하기"에서 일괄 등록(엑셀)과 개별 등록 중 고른다(교 #115).

import { Button } from "@/components/ui/button";
import TeacherDialog, { CancelButton, DialogFooter } from "./TeacherDialog";

interface RegisterChoiceDialogProps {
  onBulk: () => void;
  onSingle: () => void;
  onClose: () => void;
}

export default function RegisterChoiceDialog({
  onBulk,
  onSingle,
  onClose,
}: RegisterChoiceDialogProps) {
  const choice =
    "h-12 w-full rounded-lg border border-line bg-background px-5 text-app-body font-semibold text-ink-strong hover:bg-surface-muted";
  return (
    <TeacherDialog title="등록 방식 고르기" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onBulk}
          className={choice}
        >
          일괄 등록
        </Button>
        <p className="text-app-caption text-ink-sub">
          엑셀 파일로 여러 선생님을 한 번에 등록해요
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={onSingle}
          className={choice}
        >
          개별 등록
        </Button>
        <p className="text-app-caption text-ink-sub">
          이름과 전화번호를 넣어 한 명씩 등록해요
        </p>
      </div>
      <DialogFooter>
        <CancelButton onClick={onClose} />
      </DialogFooter>
    </TeacherDialog>
  );
}
