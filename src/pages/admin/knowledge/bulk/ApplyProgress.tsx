// 미리보기 아래 진행 문구. 검사나 반영이 도는 동안은 진행률을, 아니면 반영 대상 행 수를 보여 준다.

export default function ApplyProgress({
  progress,
  selectedCount,
}: {
  progress: string;
  selectedCount: number;
}) {
  return (
    <span className="text-xs font-bold text-gray-600">
      {progress || `반영 대상 ${selectedCount}행`}
    </span>
  );
}
