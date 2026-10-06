import { useState } from "react";
import AppModal from "@/components/goal/AppModal";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { promoteGrade } from "./profileApi";

const DISMISS_KEY = "growth-promotion-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 닫힌다.
  }
}

type PromotionModalProps = {
  next: { grade: 2 | 3; semester: 1 };
  onPromoted: () => Promise<void>;
};

/** 새 학년도 첫 진입 모달. 세션당 한 번만 연다(닫으면 sessionStorage 에 기록). */
export default function PromotionModal({
  next,
  onPromoted,
}: PromotionModalProps) {
  const { userId } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(() => !readDismissed());
  const [saving, setSaving] = useState(false);

  function dismiss() {
    writeDismissed();
    setOpen(false);
  }

  async function promote() {
    if (!userId || saving) return;
    setSaving(true);
    const result = await promoteGrade(userId, next);
    setSaving(false);
    if (!result.ok) {
      toast.error("학년을 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      return;
    }
    await onPromoted();
    dismiss();
  }

  return (
    <AppModal
      open={open}
      onClose={dismiss}
      title="학년을 올릴까요?"
      subtitle={`새 학년도가 시작됐어요. 고${next.grade} ${next.semester}학기로 올릴까요?`}
      cancelLabel="이번엔 그대로"
      submitLabel="올리기"
      submitDisabled={saving}
      onSubmit={() => void promote()}
    />
  );
}
