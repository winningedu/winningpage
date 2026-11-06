// W14, W16 창들의 공통 틀. 제목과 본문을 가운데 창에 담고 어두운 배경을 깐다. 버튼은 창마다 그린다.

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface TeacherDialogProps {
  title: string;
  onClose: () => void;
  /** 표가 들어가는 창은 넓게. */
  wide?: boolean;
  children: React.ReactNode;
}

export default function TeacherDialog({
  title,
  onClose,
  wide = false,
  children,
}: TeacherDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className={cn(
          "max-h-[calc(100%-2rem)] gap-5 overflow-y-auto rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0",
          wide ? "sm:max-w-[35rem]" : "sm:max-w-[30rem]",
        )}
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          {title}
        </DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}

export function CancelButton({
  onClick,
  children = "취소",
}: {
  onClick: () => void;
  children?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
    >
      {children}
    </Button>
  );
}

export function ConfirmButton({
  onClick,
  disabled,
  tone = "primary",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger";
  children: string;
}) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-10 rounded-lg px-5 text-app-label font-semibold text-primary-foreground disabled:opacity-40",
        tone === "danger" && "bg-error hover:bg-error",
      )}
    >
      {children}
    </Button>
  );
}
