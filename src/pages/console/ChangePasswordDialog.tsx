// W18a 비밀번호 변경 창(스펙 5절).

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>비밀번호 변경</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}
