// 성장설계 리포트 37항목 레지스트리와 런타임 스키마(No.5, No.52, No.56, No.87, No.90~94, No.112).
// 순수 모듈: 외부 의존 없음.

import type { HighGrade } from "./types.js";

/** 항목 표현 형식 6종(No.91). */
export type SectionFormat =
  | "table"
  | "prose"
  | "diagram"
  | "bar"
  | "line"
  | "list";
/** 배지 2종(No.5): 확인된 사실 / 제안. */
export type SectionBadge = "fact" | "proposal";

export const SECTION_FORMATS: readonly SectionFormat[] = [
  "table",
  "prose",
  "diagram",
  "bar",
  "line",
  "list",
];

export const SECTION_FORMAT_LABELS: Record<SectionFormat, string> = {
  table: "표",
  prose: "서술",
  diagram: "도식",
  bar: "막대그래프",
  line: "선그래프",
  list: "목록",
};

export const SECTION_BADGE_LABELS: Record<SectionBadge, string> = {
  fact: "확인된 사실",
  proposal: "제안",
};

export interface SectionDef {
  id: string;
  part: 1 | 2 | 3;
  title: string;
  format: SectionFormat;
  badge: SectionBadge;
  /** 외부 데이터 의존 항목. 자료가 없으면 no_data 로 유지한다(No.87). */
  externalData: boolean;
  /** 성적 민감 항목. 학부모 열람에서 제외한다(No.112). */
  gradeSensitive: boolean;
}

const EXTERNAL = new Set(["1-14", "3-8", "3-9", "3-10"]);
const GRADE_SENSITIVE = new Set(["1-12", "1-13", "1-14", "3-10"]);

type Row = [string, string, SectionFormat];

const PART1: Row[] = [
  ["1-1", "학생 프로필", "table"],
  ["1-2", "장기 목표", "prose"],
  ["1-3", "전체 활동 지도", "diagram"],
  ["1-4", "학년별 활동 분포", "bar"],
  ["1-5", "과목별 활동 분포", "bar"],
  ["1-6", "지적 성향", "table"],
  ["1-7", "선호 탐구 방식", "table"],
  ["1-8", "반복된 문제의식", "list"],
  ["1-9", "단절과 반복 진단", "table"],
  ["1-10", "방향 진단", "diagram"],
  ["1-11", "현재 핵심 정체성", "prose"],
  ["1-12", "성적 추이와 곡선 판정", "line"],
  ["1-13", "내부 추정 등급", "table"],
  ["1-14", "희망 대학 입결 대비 위치", "table"],
];

const PART2: Row[] = [
  ["2-1", "A 학업역량", "table"],
  ["2-2", "B 진로 및 전공적합성", "table"],
  ["2-3", "C 탐구 및 자기주도성", "table"],
  ["2-4", "D 공동체역량", "table"],
  ["2-5", "E 발전가능성", "table"],
  ["2-6", "교과별 역할 분석", "table"],
  ["2-7", "자율 및 자치 활동 분석", "prose"],
  ["2-8", "동아리 활동 분석", "prose"],
  ["2-9", "진로 활동 분석", "prose"],
  ["2-10", "독서와 후속 질문", "table"],
];

const PART3: Row[] = [
  ["3-1", "지금까지의 성장 흐름", "diagram"],
  ["3-2", "1학년 평가", "prose"],
  ["3-3", "2학년 보완 방향", "prose"],
  ["3-4", "3학년 콘셉트", "prose"],
  ["3-5", "과목별 빌드업 지도", "table"],
  ["3-6", "자율 및 동아리 발전 방향", "prose"],
  ["3-7", "진로활동 구체화", "table"],
  ["3-8", "희망 대학 인재상 대조", "table"],
  ["3-9", "고교학점제 과목 선택 권장", "table"],
  ["3-10", "학년별 목표 등급", "table"],
  ["3-11", "반드시 필요한 다음 활동", "list"],
  ["3-12", "있으면 좋은 활동", "list"],
  ["3-13", "피해야 할 반복", "list"],
];

function build(rows: Row[], part: 1 | 2 | 3): SectionDef[] {
  return rows.map(([id, title, format]) => ({
    id,
    part,
    title,
    format,
    // 1·2부 전부 사실, 3부는 3-1 만 사실이고 나머지는 제안
    badge: part === 3 && id !== "3-1" ? "proposal" : "fact",
    externalData: EXTERNAL.has(id),
    gradeSensitive: GRADE_SENSITIVE.has(id),
  }));
}

export const SECTION_REGISTRY: readonly SectionDef[] = [
  ...build(PART1, 1),
  ...build(PART2, 2),
  ...build(PART3, 3),
];

/** 섹션 항목 런타임 스키마. */
export interface SectionItem {
  id: string;
  title: string;
  format: SectionFormat;
  badge: SectionBadge;
  status: "ok" | "no_data";
  evidence_ids: string[];
  survey_refs?: number[];
  formula?: string;
  body: unknown;
  no_data_reason?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const result = (errors: string[]): ValidationResult => ({
  ok: errors.length === 0,
  errors,
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 단일 항목의 모양 검증. 레지스트리 대조는 validateSections 가 맡는다. */
export function validateSectionItem(value: unknown): ValidationResult {
  if (!isRecord(value)) return result(["항목이 객체가 아님"]);
  const errors: string[] = [];
  const id = typeof value.id === "string" && value.id !== "" ? value.id : null;
  const tag = id ?? "?";
  if (!id) errors.push("id 가 비어 있음");
  if (typeof value.title !== "string" || value.title === "")
    errors.push(`${tag}: title 누락`);
  if (!SECTION_FORMATS.includes(value.format as SectionFormat)) {
    errors.push(`${tag}: format 값이 허용 집합 밖`);
  }
  if (value.badge !== "fact" && value.badge !== "proposal") {
    errors.push(`${tag}: badge 값이 허용 집합 밖`);
  }
  if (
    !Array.isArray(value.evidence_ids) ||
    value.evidence_ids.some((e) => typeof e !== "string")
  ) {
    errors.push(`${tag}: evidence_ids 는 문자열 배열이어야 함`);
  }
  if (
    value.survey_refs !== undefined &&
    (!Array.isArray(value.survey_refs) ||
      value.survey_refs.some((n) => typeof n !== "number"))
  ) {
    errors.push(`${tag}: survey_refs 는 숫자 배열이어야 함`);
  }
  if (value.formula !== undefined && typeof value.formula !== "string") {
    errors.push(`${tag}: formula 는 문자열이어야 함`);
  }
  if (value.status === "ok") {
    if (value.body === undefined || value.body === null)
      errors.push(`${tag}: ok 항목은 body 필수`);
  } else if (value.status === "no_data") {
    if (
      typeof value.no_data_reason !== "string" ||
      value.no_data_reason === ""
    ) {
      errors.push(`${tag}: no_data 항목은 no_data_reason 필수(No.87)`);
    }
  } else {
    errors.push(`${tag}: status 는 ok 또는 no_data`);
  }
  return result(errors);
}

/** 항목 목록 전체 검증: id 집합 정확 일치 + 레지스트리 형식·배지 일치. */
export function validateSections(
  items: unknown[],
  expectedIds: string[],
): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    errors.push(...validateSectionItem(item).errors);
    if (!isRecord(item) || typeof item.id !== "string") continue;
    if (seen.has(item.id)) errors.push(`${item.id}: id 중복`);
    seen.add(item.id);
    const def = SECTION_REGISTRY.find((d) => d.id === item.id);
    if (!def) continue;
    if (item.format !== def.format) {
      errors.push(`${item.id}: format 이 레지스트리(${def.format})와 다름`);
    }
    if (item.badge !== def.badge) {
      errors.push(`${item.id}: badge 가 레지스트리(${def.badge})와 다름`);
    }
  }
  const expected = new Set(expectedIds);
  for (const id of expectedIds) if (!seen.has(id)) errors.push(`${id}: 누락`);
  for (const id of seen)
    if (!expected.has(id)) errors.push(`${id}: 기대 목록에 없는 초과 항목`);
  return result(errors);
}

/** 트랙별 제외분(omit)을 뺀 기대 id 목록. omit 계산은 호출측(tracks 모듈) 몫이다. */
export function expectedSectionIds(options: { omit: string[] }): string[] {
  const omit = new Set(options.omit);
  return SECTION_REGISTRY.map((s) => s.id).filter((id) => !omit.has(id));
}

export type NarrativeGrade = HighGrade;
export type NarrativeStage = "seed" | "flower" | "bloom";

export interface Narrative {
  theme: string;
  subthemes: { grade: NarrativeGrade; stage: NarrativeStage; text: string }[];
  previous?: { theme: string; issuedAt: string; reason: "career_change" };
}

/** 단계 라벨(No.52): 씨앗/꽃/만개. */
export const NARRATIVE_STAGE_LABELS: Record<NarrativeStage, string> = {
  seed: "씨앗",
  flower: "꽃",
  bloom: "만개",
};

/** 학년과 짝이 되는 단계(No.52). */
const STAGE_BY_GRADE: Record<NarrativeGrade, NarrativeStage> = {
  고1: "seed",
  고2: "flower",
  고3: "bloom",
};

/** 서사 검증: theme 비어있지 않음, 하위 주제 3개·학년 중복 없음·단계 짝(No.52, No.56). */
export function validateNarrative(value: unknown): ValidationResult {
  if (!isRecord(value)) return result(["서사가 객체가 아님"]);
  const errors: string[] = [];
  if (typeof value.theme !== "string" || value.theme.trim() === "")
    errors.push("theme 이 비어 있음");
  const subs = value.subthemes;
  if (!Array.isArray(subs) || subs.length !== 3) {
    errors.push("subthemes 는 정확히 3개여야 함");
  } else {
    const grades = new Set<string>();
    for (const sub of subs) {
      if (
        !isRecord(sub) ||
        typeof sub.grade !== "string" ||
        !(sub.grade in STAGE_BY_GRADE)
      ) {
        errors.push("subthemes 항목의 grade 가 올바르지 않음");
        continue;
      }
      if (grades.has(sub.grade)) errors.push(`${sub.grade}: 학년 중복`);
      grades.add(sub.grade);
      if (sub.stage !== STAGE_BY_GRADE[sub.grade as NarrativeGrade]) {
        errors.push(
          `${sub.grade}: stage 는 ${STAGE_BY_GRADE[sub.grade as NarrativeGrade]} 여야 함`,
        );
      }
      if (typeof sub.text !== "string") errors.push(`${sub.grade}: text 누락`);
    }
  }
  if (value.previous !== undefined) {
    const p = value.previous;
    if (
      !isRecord(p) ||
      typeof p.theme !== "string" ||
      typeof p.issuedAt !== "string" ||
      p.reason !== "career_change"
    ) {
      errors.push("previous 형식이 올바르지 않음(reason 은 career_change)");
    }
  }
  return result(errors);
}

/** 학부모 열람용 목록: 성적 민감 항목을 제외한다(No.112). */
export function parentVisibleSections<T extends { id: string }>(
  items: T[],
): { items: T[]; excludedIds: string[] } {
  const sensitive = new Set(
    SECTION_REGISTRY.filter((s) => s.gradeSensitive).map((s) => s.id),
  );
  return {
    items: items.filter((i) => !sensitive.has(i.id)),
    excludedIds: items.filter((i) => sensitive.has(i.id)).map((i) => i.id),
  };
}

export const NO_DATA_TEXT = "자료 없음";

export interface OverviewInput {
  consistencyPercent: number | null;
  consistencyLabel: string | null;
  axesConfirmed: number | null;
  axesTotal: number | null;
  /** 가장 부족한 축 안내 문구. 없으면 "A부터 E 확인됨" 카드의 sub 를 생략한다. */
  weakestAxisText?: string | null;
  estimate: string | null;
  actual: string | null;
  curveLabel: string | null;
  /** 권장과목 이수 수(분자). "권장과목 이수" 카드에 쓴다. */
  recommendedDone: number | null;
  /** 권장과목 전체 수(분모). "권장과목 이수" 카드에 쓴다. */
  recommendedTotal: number | null;
  brokenSemester: string | null;
  activityCount: number | null;
}

export interface OverviewCard {
  key:
    | "consistency"
    | "axes"
    | "estimate"
    | "recommendedCourses"
    | "brokenSemester"
    | "activities";
  label: string;
  value: string;
  sub?: string;
}

/** 시안 "한눈에" 6카드. 필요한 값이 null 이면 값 대신 "자료 없음"(No.87). */
export function overviewCards(input: OverviewInput): OverviewCard[] {
  const card = (
    key: OverviewCard["key"],
    label: string,
    value: string | null,
    sub?: string | null,
  ): OverviewCard => ({
    key,
    label,
    value: value ?? NO_DATA_TEXT,
    ...(value !== null && sub ? { sub } : {}),
  });
  const pair = (a: number | null, b: number | null) =>
    a === null || b === null ? null : `${a} / ${b}`;
  const estimateSub = [
    input.actual === null ? null : `실제 평균 ${input.actual}`,
    input.curveLabel,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(", ");
  return [
    card(
      "consistency",
      "방향 일관성",
      input.consistencyPercent === null ? null : `${input.consistencyPercent}%`,
      input.consistencyLabel,
    ),
    card(
      "axes",
      "A부터 E 확인됨",
      pair(input.axesConfirmed, input.axesTotal),
      input.weakestAxisText,
    ),
    card("estimate", "내부 추정 등급", input.estimate, estimateSub),
    card(
      "recommendedCourses",
      "권장과목 이수",
      pair(input.recommendedDone, input.recommendedTotal),
    ),
    card("brokenSemester", "끊긴 시기", input.brokenSemester),
    card(
      "activities",
      "분석 활동",
      input.activityCount === null ? null : `${input.activityCount}건`,
    ),
  ];
}
