import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EmptyAssetsDialogProps = {
  open: boolean;
  /** 창을 닫거나 "활동 고르러 가기"를 눌렀을 때. */
  onPickActivity: () => void;
  /** "예비 주제로 추천받기"를 눌렀을 때. */
  onProceed: () => void;
};

// 활동을 하나도 고르지 않고 추천받으려 할 때 뜨는 확인 창(No.146).
export default function EmptyAssetsDialog({
  open,
  onPickActivity,
  onProceed,
}: EmptyAssetsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onPickActivity();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-app-card-title font-bold text-ink-strong">
            고른 활동이 없어요
          </DialogTitle>
          <DialogDescription className="text-app-label text-ink-sub">
            활동 없이 추천받으면 관심을 바탕으로 한 예비 주제를 보여 드려요.
            이전 활동과 이어지지 않아 연계 점수는 0점이에요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 px-5 text-app-label"
            onClick={onPickActivity}
          >
            활동 고르러 가기
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-10 px-5 text-app-label"
            onClick={onProceed}
          >
            예비 주제로 추천받기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
