// 특이학생 사유 칩. 달성율 기준은 기관 설정 값을 그대로 쓴다.

import Chip from "../Chip";
import type { SpecialReason } from "./types";

interface SpecialReasonsProps {
  reasons: SpecialReason[];
  execRatePct: number | null;
}

export default function SpecialReasons({
  reasons,
  execRatePct,
}: SpecialReasonsProps) {
  const label: Record<SpecialReason, string> = {
    low_rate: `달성율 ${execRatePct}% 미만`,
    urgency: "긴급도 높음 이상",
    manual: "직접 지정",
  };
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <Chip key={r} tone="Caution">
          {label[r]}
        </Chip>
      ))}
    </span>
  );
}
