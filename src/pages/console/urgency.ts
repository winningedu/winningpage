// 학습진단 긴급도 4단계의 이름과 칩 색. W6, W8, W10 이 함께 쓴다.

import type { ChipTone } from "./Chip";

export type Urgency = "low" | "mid" | "high" | "very_high";

export const URGENCY: Record<string, { label: string; tone: ChipTone }> = {
  low: { label: "낮음", tone: "Success" },
  mid: { label: "보통", tone: "Warning" },
  high: { label: "높음", tone: "Caution" },
  very_high: { label: "매우 높음", tone: "Danger" },
};
