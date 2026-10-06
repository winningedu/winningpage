// 성장설계 리포트 P4 앱 계산 단계. 모델 없이 앱이 계산한다.
// 2단계 분류, 5단계 일관성 입력과 계산, 6단계 5축 평가, 8단계 데이터 섹션, 한눈에 카드 입력.
// 순수 함수만 담는다. DB 와 시계에 의존하지 않는다.

import {
  AXES,
  type AxisEvaluation,
  type AxisEvidence,
  evaluateAxes,
} from "../axes.js";
import {
  type ConsistencyActivity,
  type ConsistencyResult,
  computeConsistency,
  type LinkSignal,
} from "../consistency.js";
import {
  type CurveSummary,
  type CurveVerdict,
  curveSummary,
} from "../gradeCurve.js";
import {
  NARRATIVE_STAGE_LABELS,
  type Narrative,
  NO_DATA_TEXT,
  SECTION_REGISTRY,
  type SectionDef,
  type SectionItem,
} from "../sections.js";
import {
  ADMISSION_DISCLAIMER,
  backsolveTarget,
  compareWithAdmission,
  targetScheduleRows,
} from "../targetGrade.js";
import type { Axis, HighGrade, SemesterKey } from "../types.js";
import type {
  ActivitySignal,
  Classification,
  ContextActivity,
  ReportContext,
} from "./types.js";

const GRADES: readonly HighGrade[] = ["고1", "고2", "고3"];
const ALL_SEMESTERS: readonly SemesterKey[] = [
  "고1-1",
  "고1-2",
  "고2-1",
  "고2-2",
  "고3-1",
  "고3-2",
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

const semesterKeyOf = (a: ContextActivity): string | null =>
  a.gradeLabel === null || a.semester === null
    ? null
    : `${a.gradeLabel}-${a.semester}`;

// ---------------------------------------------------------------------------
// 2단계 분류
// ---------------------------------------------------------------------------

export function classify(context: ReportContext): Classification {
  const { activities, range } = context;
  const inRange = new Set<string>(range.semesters);

  const bySubject = new Map<string, number>();
  for (const a of activities) {
    if (a.subjectGroup === null) continue;
    bySubject.set(a.subjectGroup, (bySubject.get(a.subjectGroup) ?? 0) + 1);
  }

  return {
    byGrade: GRADES.map((grade) => ({
      grade,
      count: activities.filter((a) => a.gradeLabel === grade).length,
    })),
    bySemester: range.semesters.map((key) => ({
      key,
      count: activities.filter((a) => semesterKeyOf(a) === key).length,
    })),
    bySubjectGroup: [...bySubject.entries()]
      .map(([subjectGroup, count]) => ({ subjectGroup, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.subjectGroup.localeCompare(b.subjectGroup, "ko"),
      ),
    byGroup: {
      curricular: activities.filter((a) => a.group === "curricular").length,
      extracurricular: activities.filter((a) => a.group === "extracurricular")
        .length,
      unclassified: activities.filter((a) => a.group === "unclassified").length,
    },
    // 학년이나 학기를 모르는 활동은 제외하지 않고 범위 안으로 본다.
    outOfRangeIds: activities
      .filter((a) => {
        const key = semesterKeyOf(a);
        return key !== null && !inRange.has(key);
      })
      .map((a) => a.id),
  };
}

// ---------------------------------------------------------------------------
// 5단계 방향 일관성
// ---------------------------------------------------------------------------

/** 활동 전체에서 가장 많이 달린 축 상위 2개. 동률은 A~E 순. 0건이면 빈 배열. */
export function representativeAxes(signals: ActivitySignal[]): Axis[] {
  const counts = new Map<Axis, number>();
  for (const s of signals) {
    for (const axis of new Set(s.axes)) {
      counts.set(axis, (counts.get(axis) ?? 0) + 1);
    }
  }
  return AXES.filter((axis) => (counts.get(axis) ?? 0) > 0)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, 2);
}

/**
 * 5단계 입력. 가정: 축 일치(axis_match)는 "활동의 축이 대표 축(전체에서 가장 많은 상위 2개)과
 * 하나라도 겹침"으로 본다. 명세 No.59~63 은 축 일치만 말하고 기준 축을 정하지 않았다.
 */
export function consistencyActivities(
  context: ReportContext,
  signals: ActivitySignal[],
): ConsistencyActivity[] {
  const representative = new Set(representativeAxes(signals));
  const byId = new Map(signals.map((s) => [s.activityId, s]));
  return context.activities.map((a) => {
    const s = byId.get(a.id);
    if (!s) return { id: a.id, signals: [] };
    const link: LinkSignal[] = [...s.linkage];
    if (s.axes.some((axis) => representative.has(axis)))
      link.push("axis_match");
    return { id: a.id, signals: link, evidence: s.summary };
  });
}

export function computeStep5(
  context: ReportContext,
  signals: ActivitySignal[],
): { consistency: ConsistencyResult; expectedFormula: string } {
  const consistency = computeConsistency(
    consistencyActivities(context, signals),
  );
  return { consistency, expectedFormula: consistency.formula };
}

// ---------------------------------------------------------------------------
// 6단계 5축 평가
// ---------------------------------------------------------------------------

/** 활동 하나에 축이 여럿이면 축마다 1건. */
export function axisEvidence(signals: ActivitySignal[]): AxisEvidence[] {
  return signals.flatMap((s) =>
    [...new Set(s.axes)].map((axis) => ({ activityId: s.activityId, axis })),
  );
}

/** 현재 학년 활동만 센다. 졸업과 N수는 context.currentGrade 가 고3 이다. */
export function computeStep6(
  context: ReportContext,
  signals: ActivitySignal[],
): AxisEvaluation[] {
  const gradeFilterIds = context.activities
    .filter((a) => a.gradeLabel === context.currentGrade)
    .map((a) => a.id);
  return evaluateAxes(context.currentGrade, axisEvidence(signals), {
    gradeFilterIds,
  });
}

// ---------------------------------------------------------------------------
// 8단계 데이터 섹션
// ---------------------------------------------------------------------------

export type AppSectionOutputs = {
  classification: Classification;
  narrative: Narrative | null | undefined;
  consistency: ConsistencyResult;
  axes: AxisEvaluation[];
  signals: ActivitySignal[];
  /** 저장된 앞 단계 섹션. 3-1 근거를 1-8 에서 받는 데 쓴다. */
  sections?: SectionItem[];
};

const VERDICT_LABEL_KO: Record<CurveVerdict, string> = {
  rising: "상승",
  falling: "하향",
  flat: "유지",
  not_judgeable: "판정 불가",
};

type CurveInfo = {
  points: { key: SemesterKey; average: number }[];
  summary: CurveSummary;
  system: "five" | "nine";
};

/** 성적 곡선 계산. 등급 체계가 없거나 평균 있는 학기가 없으면 null. */
function curveInfo(context: ReportContext): CurveInfo | null {
  const { system, semesters } = context.grades;
  if (system === null) return null;
  const points = semesters.flatMap((s) =>
    s.average === null ? [] : [{ key: s.key, average: s.average }],
  );
  if (points.length === 0) return null;
  const actualAverage = round2(
    points.reduce((a, p) => a + p.average, 0) / points.length,
  );
  return {
    points,
    system,
    summary: curveSummary({
      system,
      actualAverage,
      semesterAverages: points,
    }),
  };
}

function defOf(id: string): SectionDef {
  const def = SECTION_REGISTRY.find((d) => d.id === id);
  if (!def) throw new Error(`레지스트리에 없는 섹션 id: ${id}`);
  return def;
}

function okItem(id: string, evidenceIds: string[], body: unknown): SectionItem {
  const def = defOf(id);
  return {
    id,
    title: def.title,
    format: def.format,
    badge: def.badge,
    status: "ok",
    evidence_ids: [...evidenceIds],
    body,
  };
}

function noDataItem(id: string, reason: string): SectionItem {
  const def = defOf(id);
  return {
    id,
    title: def.title,
    format: def.format,
    badge: def.badge,
    status: "no_data",
    evidence_ids: [],
    body: { text: NO_DATA_TEXT, reason },
    no_data_reason: reason,
  };
}

const GRADE_ORDER: Record<string, number> = { 고1: 1, 고2: 2, 고3: 3 };

function sortBySemester(activities: ContextActivity[]): ContextActivity[] {
  const rank = (a: ContextActivity): number =>
    (a.gradeLabel === null ? 9 : (GRADE_ORDER[a.gradeLabel] ?? 9)) * 10 +
    (a.semester ?? 9);
  return [...activities].sort((a, b) => rank(a) - rank(b));
}

function profileRows(
  context: ReportContext,
): { label: string; value: string }[] {
  const { profile, universities } = context;
  const gradeSemester =
    profile.grade === null
      ? NO_DATA_TEXT
      : profile.semester === null
        ? profile.grade
        : `${profile.grade} ${profile.semester}학기`;
  const universityText =
    universities.length === 0
      ? NO_DATA_TEXT
      : universities
          .slice(0, 2)
          .map((u) =>
            u.departmentName === null
              ? u.universityName
              : `${u.universityName} ${u.departmentName}`,
          )
          .join(", ");
  return [
    { label: "학교 유형", value: profile.schoolType ?? NO_DATA_TEXT },
    { label: "학년과 학기", value: gradeSemester },
    { label: "진로", value: profile.career ?? NO_DATA_TEXT },
    { label: "희망 대학", value: universityText },
    { label: "트랙", value: context.track },
    { label: "분석 범위", value: context.range.description || NO_DATA_TEXT },
  ];
}

function section12(info: CurveInfo | null): SectionItem {
  if (info === null) {
    return noDataItem("1-12", "성적 자료가 아직 없어요");
  }
  const { summary } = info;
  return okItem("1-12", [], {
    system: info.system,
    points: info.points,
    actual: summary.actual,
    estimate: summary.estimate,
    verdict: summary.verdict,
    verdictLabel: VERDICT_LABEL_KO[summary.verdict],
    basis: summary.basis,
    thresholdText: summary.thresholdText,
  });
}

function section13(info: CurveInfo | null): SectionItem {
  if (info === null || info.summary.estimate === null) {
    return noDataItem("1-13", "성적 자료가 아직 없어요");
  }
  const { summary } = info;
  const correctionText =
    summary.correction === null || summary.correction === 0
      ? "보정 없음"
      : `${summary.correction > 0 ? "+" : ""}${summary.correction}`;
  return okItem("1-13", [], {
    rows: [
      { label: "실제 평균", value: String(summary.actual) },
      { label: "곡선 판정", value: VERDICT_LABEL_KO[summary.verdict] },
      { label: "보정", value: correctionText },
      { label: "내부 추정 등급", value: String(summary.estimate) },
    ],
    estimate: summary.estimate,
    correction: summary.correction,
    note: `위닝 내부 추정이에요. 실제 성적이 아니라 참고용 내부 추정 값이에요. ${ADMISSION_DISCLAIMER}`,
  });
}

function section14(
  context: ReportContext,
  info: CurveInfo | null,
): SectionItem {
  const estimate = info?.summary.estimate ?? null;
  const { universities } = context;
  const anyCut = universities.some((u) => u.cuts.some((c) => c.grade !== null));
  if (universities.length === 0 || estimate === null || !anyCut) {
    return noDataItem(
      "1-14",
      "희망 대학 입결이나 내부 추정 등급이 아직 없어요",
    );
  }
  return okItem("1-14", [], {
    estimate,
    rows: universities.map((u) => {
      const cmp = compareWithAdmission({ estimate, cuts: u.cuts });
      return {
        university:
          u.departmentName === null
            ? u.universityName
            : `${u.universityName} ${u.departmentName}`,
        byYear: cmp.byYear,
        latest: cmp.latest,
        diff: cmp.diff,
        diffText: cmp.diffText,
        status: cmp.status,
      };
    }),
    note: ADMISSION_DISCLAIMER,
  });
}

function section310(context: ReportContext): SectionItem {
  const completed = context.grades.semesters.flatMap((s) =>
    s.average === null ? [] : [{ key: s.key, average: s.average }],
  );
  const latestCuts = context.universities.flatMap((u) => {
    const valid = u.cuts.filter(
      (c): c is { year: number; grade: number } => c.grade !== null,
    );
    if (valid.length === 0) return [];
    const latest = valid.reduce((a, b) => (b.year > a.year ? b : a));
    return [latest.grade];
  });
  if (completed.length === 0 || latestCuts.length === 0) {
    return noDataItem(
      "3-10",
      "희망 대학 입결이나 완료 학기 성적이 아직 없어요",
    );
  }
  // 여러 희망 대학 중 가장 낮은 컷(가장 어려운 곳) 기준이다.
  // 명세 No.81 은 기준 대학을 정하지 않아 보수적으로 잡은 가정이다.
  const targetCut = Math.min(...latestCuts);
  const lastDone = Math.max(
    ...completed.map((c) => ALL_SEMESTERS.indexOf(c.key)),
  );
  const remainingSemesters = ALL_SEMESTERS.slice(lastDone + 1).map((key) => ({
    key,
  }));
  const result = backsolveTarget({
    completed,
    remainingSemesters,
    targetCut,
  });
  return okItem("3-10", [], {
    targetCut,
    requiredAverage: result.requiredAverage,
    reachable: result.reachable,
    status: result.status,
    basis: result.basis,
    unitsAssumedEqual: result.unitsAssumedEqual,
    rows: targetScheduleRows({
      remainingSemesters,
      requiredAverage: result.requiredAverage,
    }),
    note: ADMISSION_DISCLAIMER,
  });
}

/** 8단계 앱 데이터 섹션. 제외 항목은 만들지 않는다. 계획 §1 범위 밖인 3-8, 3-9 는 항상 자료 없음. */
export function appSections(
  context: ReportContext,
  outputs: AppSectionOutputs,
): SectionItem[] {
  const omitted = new Set(context.omitted.ids);
  const ids = context.activities.map((a) => a.id);
  const info = curveInfo(context);
  const { classification, narrative, signals } = outputs;
  const subjectIds = context.activities
    .filter((a) => a.subjectGroup !== null)
    .map((a) => a.id);
  const sec18 = outputs.sections?.find((x) => x.id === "1-8");
  const narrativeIds =
    sec18 && sec18.status === "ok" && sec18.evidence_ids.length > 0
      ? sec18.evidence_ids
      : ids;
  const axesById = new Map(signals.map((s) => [s.activityId, s.axes]));

  const builders: [string, () => SectionItem][] = [
    ["1-1", () => okItem("1-1", [], { rows: profileRows(context) })],
    [
      "1-3",
      () =>
        context.activities.length === 0
          ? noDataItem("1-3", "분석할 활동이 아직 없어요")
          : okItem("1-3", ids, {
              nodes: sortBySemester(context.activities).map((a) => ({
                id: a.id,
                gradeLabel: a.gradeLabel,
                semester: a.semester,
                subjectGroup: a.subjectGroup,
                topic: a.topic,
                axes: axesById.get(a.id) ?? [],
              })),
            }),
    ],
    [
      "1-4",
      () =>
        okItem("1-4", [], {
          bars: classification.byGrade.map((g) => ({
            label: g.grade,
            value: g.count,
          })),
        }),
    ],
    [
      "1-5",
      () =>
        classification.bySubjectGroup.length === 0
          ? noDataItem("1-5", "과목이 확인된 활동이 아직 없어요")
          : okItem("1-5", subjectIds, {
              bars: classification.bySubjectGroup.map((s) => ({
                label: s.subjectGroup,
                value: s.count,
              })),
            }),
    ],
    ["1-12", () => section12(info)],
    ["1-13", () => section13(info)],
    ["1-14", () => section14(context, info)],
    [
      "3-1",
      () =>
        narrative && context.activities.length > 0
          ? okItem("3-1", narrativeIds, {
              theme: narrative.theme,
              subthemes: narrative.subthemes.map((s) => ({
                grade: s.grade,
                stage: s.stage,
                stageLabel: NARRATIVE_STAGE_LABELS[s.stage],
                text: s.text,
              })),
            })
          : noDataItem("3-1", "성장 흐름 서사가 아직 없어요"),
    ],
    ["3-8", () => noDataItem("3-8", "권장과목, 인재상 자료가 아직 없어요")],
    ["3-9", () => noDataItem("3-9", "권장과목, 인재상 자료가 아직 없어요")],
    ["3-10", () => section310(context)],
  ];

  return builders
    .filter(([id]) => !omitted.has(id))
    .map(([, build]) => build());
}
