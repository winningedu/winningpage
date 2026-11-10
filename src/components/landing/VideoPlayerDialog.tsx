import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import YoutubePlayer from "@/components/YoutubePlayer";

type VideoPlayerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  title: string;
};

/**
 * 영상 재생 팝업(W2). 유튜브 플레이어는 열린 동안에만 마운트한다 - 열기 전에는 유튜브에 요청하지 않고(G3),
 * 닫으면 iframe이 사라져 재생이 멈춘다. 포커스 복귀와 Esc, 배경 클릭 닫기는 Dialog가 맡는다.
 */
export default function VideoPlayerDialog({
  open,
  onOpenChange,
  videoId,
  title,
}: VideoPlayerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-overlay supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup
          aria-labelledby="video-player-title"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-full w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden bg-white pb-5 shadow-popover outline-none sm:w-176 sm:rounded-2xl lg:w-250"
        >
          <div className="flex items-start gap-4 px-5 pt-5">
            <DialogPrimitive.Title
              id="video-player-title"
              className="flex-1 text-[1.125rem] font-semibold leading-[1.575rem] text-ink-strong"
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="닫기"
              className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-strong after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] sm:after:hidden"
            >
              <XIcon size={18} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="aspect-video w-full sm:px-5">
            <YoutubePlayer
              key={videoId}
              videoId={videoId}
              title={title}
              autoplay
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
