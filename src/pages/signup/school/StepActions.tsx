// 단계마다 붙는 이전, 다음 버튼(사 #98).
import { OutlineButton, PrimaryButton } from "@/components/auth";

interface StepActionsProps {
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  loading?: boolean;
}

export default function StepActions({
  onPrev,
  onNext,
  nextDisabled = false,
  nextLabel = "다음",
  loading = false,
}: StepActionsProps) {
  return (
    <div className="flex w-full gap-3">
      <OutlineButton onClick={onPrev}>이전</OutlineButton>
      <PrimaryButton onClick={onNext} disabled={nextDisabled} loading={loading}>
        {nextLabel}
      </PrimaryButton>
    </div>
  );
}
