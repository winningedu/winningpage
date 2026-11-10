import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";

type GuestStartNoticeProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: () => void;
};

/** 비로그인 시작 안내(사 #12, 결정 107-9). 서비스로 들어가지 않고 로그인이나 닫기만 고른다. */
export default function GuestStartNotice({
  open,
  onOpenChange,
  onLogin,
}: GuestStartNoticeProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-overlay supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-white p-6 shadow-popover outline-none">
          <DialogPrimitive.Title className="text-[1.125rem] font-semibold leading-[1.575rem] text-ink-strong">
            이용권이 없습니다
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            render={<div />}
            className="flex flex-col gap-2 break-keep text-base leading-[1.6] text-ink"
          >
            <p>결제 후 이용해 주세요.</p>
            <p>소속 기관에서 이용 중이면 로그인해 주세요.</p>
          </DialogPrimitive.Description>
          <div className="flex gap-2">
            <DialogPrimitive.Close className="h-12 flex-1 rounded-xl bg-surface-muted text-base font-semibold text-ink-strong focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              닫기
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={onLogin}
              className="h-12 flex-1 rounded-xl bg-primary text-base font-semibold text-white transition hover:bg-[#01498F] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              로그인
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
