// 2p 목표 (22 r29-r36).

import type { DiagnosisV3Answers, DiagnosisV3Scores } from "../types.js";

/** 22 r29 cell and 22 r35 ladder. */
export function goalOf(
  _answers: DiagnosisV3Answers,
): DiagnosisV3Scores["goal"] {
  return { cell: "C_NA", ladder: { far: false, mid: false, near: false } };
}
