// 학습진단 긴급도 칩. 값이 없으면 "-".

import Chip, { type ChipTone } from "../Chip";

export type Urgency = "low" | "mid" | "high" | "very_high";

const URGENCY: Record<Urgency, { label: string; tone: ChipTone }> = {
  low: { label: "낮음", tone: "Success" },
  mid: { label: "보통", tone: "Warning" },
  high: { label: "높음", tone: "Caution" },
  very_high: { label: "매우 높음", tone: "Danger" },
};

export default function UrgencyChip({ level }: { level: Urgency | null }) {
  if (!level) return <span className="text-app-label text-ink-sub">-</span>;
  const { label, tone } = URGENCY[level];
  return <Chip tone={tone}>{label}</Chip>;
}
