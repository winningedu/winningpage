// 학습진단 버전 공통 값(DiagnosisView)을 만든다. 코칭 문구와 지표가 v2 와 v3 를 가리지 않고 이 값을 읽는다.

import {
  AREAS,
  P1_CODES,
  P2_CODES,
} from "../../../src/lib/diagnosis-v3/codes.js";
import { COPY_TEXT } from "../../../src/lib/diagnosis-v3/source/copyText.js";
import type {
  AreaScore,
  DiagnosisV3Scores,
} from "../../../src/lib/diagnosis-v3/types.js";
import {
  type DiagnosisAreas,
  type DiagnosisView,
  type DiagnosisViewArea,
  urgencyOfAreas,
} from "./coaching.js";
import { v2View } from "./coachingText.js";
import { stateLabel } from "./diagnosisStatus.js";

/** 03_영역문구 AREA_<code>_ACT1~ACT4: 영역의 보강 단계 네 개. 문구가 없으면 오류다. */
function stepsOf(code: keyof typeof AREAS): string[] {
  return [1, 2, 3, 4].map((n) => {
    const id = `AREA_${code}_ACT${n}`;
    const text = COPY_TEXT[id];
    if (typeof text !== "string") throw new Error(`03_영역문구 ${id} missing`);
    return text;
  });
}

const v3Area = (
  code: keyof typeof AREAS,
  area: AreaScore,
  page: "page1" | "page2",
): DiagnosisViewArea => ({
  // 05_영역설정 B: area name
  name: AREAS[code].label,
  score: area.score,
  group: page === "page1" ? "execution" : "readiness",
  state: stateLabel(area.state, page),
  steps: stepsOf(code),
});

function v3View(
  set: Extract<DiagnosisAreas, { version: "v3" }>,
): DiagnosisView {
  const s: DiagnosisV3Scores = set.scores;
  const page2 = P2_CODES[s.track].flatMap((c) => {
    const area = s.page2.areas[c];
    return area ? [v3Area(c, area, "page2")] : [];
  });
  return {
    urgency: urgencyOfAreas(set),
    executionAvg: s.page1.total,
    readinessAvg: s.page2.total,
    areas: [
      ...P1_CODES.map((c) => v3Area(c, s.page1.areas[c], "page1")),
      ...page2,
    ],
  };
}

export const diagnosisViewOf = (set: DiagnosisAreas): DiagnosisView =>
  set.version === "v3" ? v3View(set) : v2View(set.areas);
