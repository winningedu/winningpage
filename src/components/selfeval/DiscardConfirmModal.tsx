import AppModal from "@/components/goal/AppModal";

// 작성 중인 세션을 파기하고 새로 시작할 때 쓰는 확인 모달(명세 No.70, 시안 04).
// 이미 차감된 이용 횟수는 파기해도 돌아오지 않으므로(계획서 §2 8) 그 사실을 먼저 알린다.

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DiscardConfirmModal({
  open,
  busy,
  onClose,
  onConfirm,
}: Props) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="작성 중인 자기평가서를 파기할까요?"
      subtitle="파기하면 이어서 쓸 수 없어요. 이미 차감된 이용 횟수는 돌아오지 않아요."
      cancelLabel="취소"
      submitLabel="파기하고 새로 만들기"
      submitDisabled={busy}
      onSubmit={onConfirm}
    />
  );
}
