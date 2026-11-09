// W9a 학습진단 상세 창의 내용. 서비스 상세(serviceDetail.ts)의 학습진단 창이 이 한 곳에서 받아 쓴다.

import {
  type AreaCode,
  type AreaScores,
  EXECUTION_AREAS,
  READINESS_AREAS,
  urgencyOf,
} from "./coaching.js";
import type { DiagnosisMeta } from "./coachingData.js";
import { AREA_NAME } from "./coachingText.js";
import { mean, URGENCY_LABEL } from "./diagnosisStatus.js";

export interface DiagnosisMetric {
  label: string;
  value: string;
  sub?: string;
}

const average = (codes: readonly AreaCode[], areas: AreaScores) =>
  mean(
    codes.map((c) => ({ name: AREA_NAME[c], score: areas[c], status: "" })),
  ) as number;

function averageMetric(
  label: string,
  codes: readonly AreaCode[],
  areas: AreaScores,
  previous: AreaScores | null,
): DiagnosisMetric {
  return {
    label,
    value: `${average(codes, areas)}점`,
    ...(previous && { sub: `직전 진단 ${average(codes, previous)}점` }),
  };
}

export function diagnosisDetail(
  areas: AreaScores,
  previous: AreaScores | null,
  _meta: DiagnosisMeta | null,
) {
  return {
    metrics: [
      averageMetric(
        "학습 실행 역량(6영역 평균)",
        EXECUTION_AREAS,
        areas,
        previous,
      ),
      averageMetric("학교생활 준비도", READINESS_AREAS, areas, previous),
      { label: "학습진단 긴급도", value: URGENCY_LABEL[urgencyOf(areas)] },
    ],
  };
}
