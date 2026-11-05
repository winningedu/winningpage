// W11a 학년그룹 일괄 변경 확인 창. 숫자는 미리보기 응답의 summary 다.

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Notice from "../Notice";

export interface RolloverSummary {
  graduate: number;
  promote: number;
  waiting: number;
}

interface RolloverConfirmDialogProps {
  open: boolean;
  summary: RolloverSummary;
  applying: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function RolloverConfirmDialog({
  open,
  summary,
  applying,
  onCancel,
  onConfirm,
}: RolloverConfirmDialogProps) {
  const items = [
    { label: "졸업 처리 대상", value: summary.graduate },
    { label: "학년 +1 대상", value: summary.promote },
    {
      label: "반 배정 대기(명단에 없거나 반과 번호를 비운 학생)",
      value: summary.waiting,
    },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !applying && onCancel()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="gap-5 rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[30rem]"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          학년그룹 일괄 변경을 적용할까요?
        </DialogTitle>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col text-app-body">
            {items.map((item, i) => (
              <div
                key={item.label}
                className={`flex gap-3 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <span className="flex-1 text-ink-sub">{item.label}</span>
                <span className="text-right font-semibold text-ink-strong">
                  {item.value}명
                </span>
              </div>
            ))}
          </div>
          <Notice tone="Info">한 학년도에 한 번만 실행할 수 있어요</Notice>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={applying}
            onClick={onCancel}
            className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={applying}
            onClick={onConfirm}
            className="h-10 rounded-lg px-5 text-app-label font-semibold"
          >
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
