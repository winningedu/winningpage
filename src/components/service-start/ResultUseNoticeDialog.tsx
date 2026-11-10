import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";

type ResultUseNoticeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * 결과물 안내 창(사 #56, 결정 107-8). 확인해야만 서비스로 들어가고, 닫기, Esc, 배경 클릭은 시작하지 않는다.
 * 본문은 학생 사용 안내서 17쪽이 오기 전까지 쓰는 개발팀 문구다.
 */
export default function ResultUseNoticeDialog({
  open,
  onOpenChange,
  onConfirm,
}: ResultUseNoticeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-overlay supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-white p-6 shadow-popover outline-none">
          <DialogPrimitive.Title className="text-[1.125rem] font-semibold leading-[1.575rem] text-ink-strong">
            이렇게 쓰면 안 돼요
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            render={<div />}
            className="flex flex-col gap-2 break-keep text-base leading-[1.6] text-ink"
          >
            <p>
              서비스가 만든 추천 주제, 설계 리포트, 평가 리포트 문장을 그대로
              복사해서 제출하면 안 돼요.
            </p>
            <p>
              결과물은 참고 자료예요. 내 경험과 생각으로 직접 고쳐 써 주세요.
            </p>
          </DialogPrimitive.Description>
          <button
            type="button"
            onClick={onConfirm}
            className="h-12 rounded-xl bg-primary text-base font-semibold text-white transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            확인했어요
          </button>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
