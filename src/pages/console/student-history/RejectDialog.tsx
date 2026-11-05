// W13c 거절 사유 창. 사유가 비어 있으면 서버를 부르지 않고 확정을 막는다(공백만 쓴 것도 비어 있는 것으로 본다).

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Notice from "../Notice";

const MAX_LENGTH = 200;

interface RejectDialogProps {
  /** 거절을 보낸다. null 이면 처리됨, "blank" 면 사유 없음, 그 밖의 문자열은 창에 보일 오류다. */
  onConfirm: (reason: string) => Promise<"blank" | string | null>;
  onClose: () => void;
}

export default function RejectDialog({
  onConfirm,
  onClose,
}: RejectDialogProps) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [blank, setBlank] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    const trimmed = reason.trim();
    if (trimmed === "") {
      setBlank(true);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onConfirm(trimmed);
    if (result === "blank") setBlank(true);
    else if (result !== null) setError(result);
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="gap-5 rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[30rem]"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          거절 사유
        </DialogTitle>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={id}
            className="text-app-label font-medium text-ink-sub"
          >
            사유
          </label>
          <textarea
            id={id}
            value={reason}
            maxLength={MAX_LENGTH}
            placeholder="거절 사유를 입력해요"
            onChange={(e) => {
              setReason(e.target.value);
              setBlank(false);
            }}
            className="h-24 resize-none rounded-lg border border-line bg-background p-4 text-app-label text-ink-strong placeholder:text-ink-sub"
          />
          <Notice tone="Info">사유는 학생에게 알림으로 가요</Notice>
          {blank && (
            <p className="text-app-label text-ink-danger">
              사유를 적어야 거절할 수 있어요
            </p>
          )}
          {error && <Notice tone="Danger">{error}</Notice>}
        </div>
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
            disabled={blank || busy}
            onClick={() => void confirm()}
            className="h-10 rounded-lg bg-error px-5 text-app-label font-semibold text-primary-foreground disabled:opacity-40"
          >
            거절 확정
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
