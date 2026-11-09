// W9a 학습진단 상세 창의 내용. 서비스 상세(serviceDetail.ts)의 학습진단 창이 이 한 곳에서 받아 쓴다.

import {
  type AreaCode,
  type AreaScores,
  EXECUTION_AREAS,
  READINESS_AREAS,
  urgencyOf,
} from "./coaching.js";
import type { DiagnosisMeta } from "./coachingData.js";
import { AREA_NAME, areaState, STRATEGIES } from "./coachingText.js";
import { URGENCY_LABEL } from "./diagnosisStatus.js";

export interface DiagnosisMetric {
  label: string;
  value: string;
  sub?: string;
}

const average = (codes: readonly AreaCode[], areas: AreaScores) =>
  Math.round(codes.reduce((sum, c) => sum + areas[c], 0) / codes.length);

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

export const TARGET_SCORE = 75;

/** 리포트 정보와 가장 시급한 실행 영역(동점은 레이더 순서) 한 문장. 비어 있는 정보는 뺀다. */
function summaryOf(areas: AreaScores, meta: DiagnosisMeta | null): string {
  const weakest = EXECUTION_AREAS.reduce((low, c) =>
    areas[c] < areas[low] ? c : low,
  );
  const gap = TARGET_SCORE - areas[weakest];
  const urgent = `가장 시급한 영역 ${AREA_NAME[weakest]} ${areas[weakest]}점${gap > 0 ? `, 목표까지 ${gap}점` : ""}`;
  const facts = [
    meta?.schoolType && `학교 유형 ${meta.schoolType}`,
    meta?.gpa && `전체 평균 내신 ${meta.gpa}`,
    meta?.gradeTrend && `성적 흐름 ${meta.gradeTrend}`,
    meta?.diagnosedAt && `진단일 ${meta.diagnosedAt}`,
  ].filter(Boolean);
  return facts.length > 0 ? `${facts.join(", ")}. ${urgent}` : urgent;
}

export interface DiagnosisBar {
  group: "execution" | "readiness";
  name: string;
  score: number;
  status: string;
  firstStep: string;
  /** 목표선(75점). 학습 실행 역량 줄에만 있다. */
  target?: number;
}

const barOf = (
  group: DiagnosisBar["group"],
  code: AreaCode,
  areas: AreaScores,
): DiagnosisBar => ({
  group,
  name: AREA_NAME[code],
  score: areas[code],
  status: areaState(code, areas[code]),
  firstStep: STRATEGIES[code][0] as string,
  ...(group === "execution" && { target: TARGET_SCORE }),
});

const RANK_LABELS = ["1순위", "2순위", "3순위", "4순위", "점검", "유지"];

/** 실행 영역을 점수 오름차순으로. 동점은 EXECUTION_AREAS(레이더) 순서를 지킨다. */
function priorityTable(areas: AreaScores) {
  const bars = EXECUTION_AREAS.map((c) => barOf("execution", c, areas));
  return {
    heading: "학습 실행 역량 우선순위",
    columns: ["순위", "영역", "점수", "상태", "먼저 할 것"],
    rows: bars
      .sort((a, b) => a.score - b.score)
      .map((b, i) => [
        RANK_LABELS[i] as string,
        b.name,
        `${b.score}점`,
        b.status,
        b.firstStep,
      ]),
  };
}

export function diagnosisDetail(
  areas: AreaScores,
  previous: AreaScores | null,
  meta: DiagnosisMeta | null,
) {
  return {
    summary: summaryOf(areas, meta),
    priorities: priorityTable(areas),
    bars: [
      ...EXECUTION_AREAS.map((c) => barOf("execution", c, areas)),
      ...READINESS_AREAS.map((c) => barOf("readiness", c, areas)),
    ],
    metrics: [
      averageMetric(
        "학습 실행 역량(6영역 평균)",
        EXECUTION_AREAS,
        areas,
        previous,
      ),
      averageMetric("학교생활 준비도", READINESS_AREAS, areas, previous),
      {
        label: "학습진단 긴급도",
        value: URGENCY_LABEL[urgencyOf(areas)],
        sub: `40점 미만 영역 ${Object.values(areas).filter((s) => s < 40).length}개`,
      },
    ],
  };
}
