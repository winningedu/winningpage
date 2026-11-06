// 학습진단 긴급도 칩. 값이 없으면 "-".

import Chip from "../Chip";
import { URGENCY, type Urgency } from "../urgency";

export default function UrgencyChip({ level }: { level: Urgency | null }) {
  if (!level) return <span className="text-app-label text-ink-sub">-</span>;
  const u = URGENCY[level];
  return u ? <Chip tone={u.tone}>{u.label}</Chip> : null;
}
