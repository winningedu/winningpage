// W9a 학습진단 상세 창의 내용. 서비스 상세(serviceDetail.ts)의 학습진단 창이 이 한 곳에서 받아 쓴다.

import {
  AREAS,
  P1_CODES,
  P2_CODES,
} from "../../../src/lib/diagnosis-v3/codes.js";
import { numberCell, sheetRows } from "../../../src/lib/diagnosis-v3/sheet.js";
import { COPY_TEXT } from "../../../src/lib/diagnosis-v3/source/copyText.js";
import type { DiagnosisV3Scores } from "../../../src/lib/diagnosis-v3/types.js";
import {
  type AreaCode,
  type AreaScores,
  type DiagnosisAreas,
  EXECUTION_AREAS,
  READINESS_AREAS,
  urgencyOf,
} from "./coaching.js";
import type { DiagnosisMeta } from "./coachingData.js";
import { AREA_NAME, areaState, STRATEGIES } from "./coachingText.js";
import { stateLabel, URGENCY_LABEL, urgencyOfV3 } from "./diagnosisStatus.js";

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

/** 06_임계값 r37: 우선순위 뱃지 5~7번째는 이 점수 이상이면 유지, 미만이면 점검. */
const MAINTAIN_FROM = numberCell(
  sheetRows("06_임계값").find((r) => r.r === 37) ?? { r: 37, c: [] },
  2,
);

/** W9a 시안의 준비도 줄 순서. 영역 상수(READINESS_AREAS)의 순서와 다르다. */
const READINESS_BAR_ORDER = [
  "SUBJECT",
  "INQUIRY",
  "RECORD",
  "PERFORM",
  "STRATEGY",
  "ACTIVITY",
] as const satisfies readonly AreaCode[];

/** 리포트 정보와 가장 시급한 실행 영역(동점은 레이더 순서) 한 문장. 비어 있는 정보는 뺀다. */
function summaryOf(areas: AreaScores, meta: DiagnosisMeta | null): string {
  const weakest = EXECUTION_AREAS.reduce((low, c) =>
    areas[c] < areas[low] ? c : low,
  );
  const gap = TARGET_SCORE - areas[weakest];
  return withFacts(
    `가장 시급한 영역 ${AREA_NAME[weakest]} ${areas[weakest]}점${gap > 0 ? `, 목표까지 ${gap}점` : ""}`,
    meta,
  );
}

function withFacts(urgent: string, meta: DiagnosisMeta | null): string {
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

function v2Detail(
  areas: AreaScores,
  previous: AreaScores | null,
  meta: DiagnosisMeta | null,
) {
  return {
    summary: summaryOf(areas, meta),
    priorities: priorityTable(areas),
    bars: [
      ...EXECUTION_AREAS.map((c) => barOf("execution", c, areas)),
      ...READINESS_BAR_ORDER.map((c) => barOf("readiness", c, areas)),
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

type V3Page = "page1" | "page2";

const v3Bar = (
  group: DiagnosisBar["group"],
  code: keyof typeof AREAS,
  area: DiagnosisV3Scores["page1"]["areas"][(typeof P1_CODES)[number]],
  page: V3Page,
): DiagnosisBar => ({
  group,
  name: AREAS[code].label,
  score: area.score,
  status: stateLabel(area.state, page),
  // 03_영역문구 AREA_<code>_ACT1: the first action of the area
  firstStep: COPY_TEXT[`AREA_${code}_ACT1`] as string,
  ...(group === "execution" && { target: TARGET_SCORE }),
});

function v3Detail(
  scores: DiagnosisV3Scores,
  previous: DiagnosisV3Scores | null,
  meta: DiagnosisMeta | null,
) {
  const track = P2_CODES[scores.track];
  const page2 = track.flatMap((c) => {
    const area = scores.page2.areas[c];
    return area ? [v3Bar("readiness", c, area, "page2")] : [];
  });
  const page1 = P1_CODES.map((c) =>
    v3Bar("execution", c, scores.page1.areas[c], "page1"),
  );
  const first = scores.page1.order[0];
  const total = (s: DiagnosisV3Scores, page: V3Page) =>
    Math.round(s[page].total);
  const metric = (label: string, page: V3Page): DiagnosisMetric => ({
    label,
    value: `${total(scores, page)}점`,
    ...(previous && { sub: `직전 진단 ${total(previous, page)}점` }),
  });
  const weakest = first ? scores.page1.areas[first] : null;
  return {
    summary:
      first && weakest
        ? withFacts(
            `가장 시급한 영역 ${AREAS[first].label} ${weakest.score}점${weakest.gapToTarget > 0 ? `, 목표까지 ${weakest.gapToTarget}점` : ""}`,
            meta,
          )
        : "",
    // 06 r35-r37: lowest first, 1~4순위 by position, then 유지 (MAINTAIN_FROM or more) or 점검
    priorities: {
      heading: "학습 실행 역량 우선순위",
      columns: ["순위", "영역", "점수", "상태", "먼저 할 것"],
      rows: scores.page1.order.map((code, i) => {
        const bar = page1.find(
          (b) => b.name === AREAS[code].label,
        ) as DiagnosisBar;
        return [
          i < 4 ? `${i + 1}순위` : bar.score >= MAINTAIN_FROM ? "유지" : "점검",
          bar.name,
          `${bar.score}점`,
          bar.status,
          bar.firstStep,
        ];
      }),
    },
    bars: [...page1, ...page2],
    metrics: [
      metric("학습 실행 역량(종합점수)", "page1"),
      metric("학교생활 준비도", "page2"),
      {
        label: "학습진단 긴급도",
        value: URGENCY_LABEL[urgencyOfV3(scores)],
        sub: `긴급도 점수 ${scores.urgency.points}점`,
      },
    ],
  };
}

const tagged = (x: AreaScores | DiagnosisAreas): DiagnosisAreas =>
  "version" in x ? x : { version: "v2", areas: x };

/**
 * 학습진단 상세. 버전이 다른 직전 진단은 비교하지 않는다(sub 를 뺀다).
 * 점수 집합을 그대로 받으면 v2, 버전 태그가 붙은 값을 받으면 그 버전으로 읽는다.
 */
export function diagnosisDetail(
  areas: AreaScores | DiagnosisAreas,
  previous: AreaScores | DiagnosisAreas | null,
  meta: DiagnosisMeta | null,
) {
  const cur = tagged(areas);
  const prev = previous ? tagged(previous) : null;
  return cur.version === "v3"
    ? v3Detail(cur.scores, prev?.version === "v3" ? prev.scores : null, meta)
    : v2Detail(cur.areas, prev?.version === "v2" ? prev.areas : null, meta);
}
