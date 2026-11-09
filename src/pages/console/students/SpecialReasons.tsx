// 특이학생 사유 칩. 기준값은 기관 설정 값을 그대로 쓴다.

import Chip from "../Chip";
import type { SpecialReason, SpecialThresholds } from "./types";

interface SpecialReasonsProps {
  reasons: SpecialReason[];
  thresholds: SpecialThresholds;
}

export default function SpecialReasons({
  reasons,
  thresholds,
}: SpecialReasonsProps) {
  const label: Record<SpecialReason, string> = {
    low_rate: `달성율 ${thresholds.execRatePct}% 미만`,
    inactive: `${thresholds.inactiveDays}일 이상 미접속`,
    urgency: "긴급도 높음 이상",
    feedback_wait: `수행평가 피드백 ${thresholds.feedbackWaitDays}일 이상 대기`,
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
