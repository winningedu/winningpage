// 지식 검색 품질 평가 화면의 입력 변환과 표 계산. 화면 컴포넌트는 KnowledgeEvalsAdmin.tsx.

/** 서버 EvalParams 와 같은 키. */
export type EvalParamKey =
  | "matchThreshold"
  | "rrfK"
  | "fullTextWeight"
  | "semanticWeight"
  | "matchCount";

export type EvalParams = Record<EvalParamKey, number>;

export const PARAM_FIELDS: { key: EvalParamKey; label: string }[] = [
  { key: "matchThreshold", label: "threshold" },
  { key: "rrfK", label: "RRF k" },
  { key: "fullTextWeight", label: "단어 가중치" },
  { key: "semanticWeight", label: "의미 가중치" },
  { key: "matchCount", label: "match_count" },
];

export type ParamDraft = Record<EvalParamKey, string>;

export const EMPTY_PARAM_DRAFT: ParamDraft = {
  matchThreshold: "",
  rrfK: "",
  fullTextWeight: "",
  semanticWeight: "",
  matchCount: "",
};

/** 채운 칸만 덮어쓰기 값으로 보낸다. 범위 검사는 서버가 한다. */
export function toParamOverrides(
  draft: ParamDraft,
):
  | { ok: true; overrides: Partial<EvalParams> }
  | { ok: false; message: string } {
  const overrides: Partial<EvalParams> = {};
  for (const { key, label } of PARAM_FIELDS) {
    const text = draft[key].trim();
    if (!text) continue;
    const value = Number(text);
    if (!Number.isFinite(value)) {
      return { ok: false, message: `${label} 는 숫자여야 합니다.` };
    }
    overrides[key] = value;
  }
  return { ok: true, overrides };
}

export type SweepDraft = {
  rrfK: string;
  weights: string;
  matchThreshold: string;
};

export type SweepGrid = {
  rrfK: number[];
  weights: { fullText: number; semantic: number }[];
  matchThreshold: number[];
};

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function numberList(text: string): number[] | null {
  const values = splitList(text).map(Number);
  return values.every(Number.isFinite) ? values : null;
}

/** 조합 비교 입력. 빈 칸은 빈 목록이고, 서버가 그 축을 운영값 하나로 채운다. */
export function toSweepGrid(
  draft: SweepDraft,
): { ok: true; grid: SweepGrid } | { ok: false; message: string } {
  const rrfK = numberList(draft.rrfK);
  if (!rrfK) return { ok: false, message: "RRF k 목록은 숫자여야 합니다." };
  const matchThreshold = numberList(draft.matchThreshold);
  if (!matchThreshold) {
    return { ok: false, message: "threshold 목록은 숫자여야 합니다." };
  }
  const weights: SweepGrid["weights"] = [];
  for (const pair of splitList(draft.weights)) {
    // 빈 쪽은 Number("") 가 0 이 되므로 NaN 으로 바꿔 거절한다.
    const parts = pair
      .split(":")
      .map((part) => (part.trim() ? Number(part.trim()) : Number.NaN));
    const [fullText, semantic] = parts;
    if (
      parts.length !== 2 ||
      fullText === undefined ||
      semantic === undefined ||
      !Number.isFinite(fullText) ||
      !Number.isFinite(semantic)
    ) {
      return {
        ok: false,
        message: "가중치 쌍은 단어:의미 모양으로 적습니다. 예 1:1, 0.5:1.5",
      };
    }
    weights.push({ fullText, semantic });
  }
  return { ok: true, grid: { rrfK, weights, matchThreshold } };
}

/** 서버 RunMetrics 와 같은 모양. recall 키는 k 문자열이다. */
export type RunMetrics = { recall: Record<string, number>; mrr: number };

export type SweepItem =
  | { status: "done"; runId: string; params: EvalParams; metrics: RunMetrics }
  | { status: "skipped"; params: EvalParams };

export function isSameParams(a: EvalParams, b: EvalParams): boolean {
  return PARAM_FIELDS.every(({ key }) => a[key] === b[key]);
}

/** 조합 표 순서. 끝난 조합은 MRR 내림차순, 건너뛴 조합은 들어온 순서대로 맨 뒤다. */
export function sortSweepItems(items: readonly SweepItem[]): SweepItem[] {
  const done = items.filter((item) => item.status === "done");
  const skipped = items.filter((item) => item.status === "skipped");
  return [
    ...[...done].sort((a, b) => b.metrics.mrr - a.metrics.mrr),
    ...skipped,
  ];
}

export type MetricDiffRow = {
  label: string;
  before: number | null;
  after: number | null;
  diff: number | null;
};

function diffRow(
  label: string,
  before: number | undefined,
  after: number | undefined,
): MetricDiffRow {
  const a = before ?? null;
  const b = after ?? null;
  return {
    label,
    before: a,
    after: b,
    diff: a === null || b === null ? null : b - a,
  };
}

/** 두 실행의 지표 차이. diff 는 after 에서 before 를 뺀 값이다. */
export function diffMetrics(
  before: RunMetrics,
  after: RunMetrics,
): MetricDiffRow[] {
  const ks = [
    ...new Set([...Object.keys(before.recall), ...Object.keys(after.recall)]),
  ].sort((x, y) => Number(x) - Number(y));
  return [
    ...ks.map((k) => diffRow(`recall@${k}`, before.recall[k], after.recall[k])),
    diffRow("MRR", before.mrr, after.mrr),
  ];
}

export type KnowledgeType = "topic_pattern" | "verified_resource";

/** 기대 자료로 고른 지식 항목. 제목은 화면 표시용이고 저장은 id 만 한다. */
export type ExpectedResource = { id: string; title: string };

export type GoldenDraft = {
  grade: string;
  subject: string;
  career: string;
  selectedTopic: string;
  assessmentInfo: string;
  note: string;
  expected: ExpectedResource[];
};

export const EMPTY_GOLDEN_DRAFT: GoldenDraft = {
  grade: "",
  subject: "",
  career: "",
  selectedTopic: "",
  assessmentInfo: "",
  note: "",
  expected: [],
};

export type GoldenRowInput = {
  knowledge_type: KnowledgeType;
  grade: string;
  subject: string;
  career: string | null;
  selected_topic: string | null;
  assessment_info: string | null;
  note: string | null;
  expected_resource_ids: string[];
};

function optional(text: string): string | null {
  return text.trim() || null;
}

/** 편집 Dialog 입력을 knowledge_golden_queries 저장 행으로 바꾼다. */
export function toGoldenRow(
  knowledgeType: KnowledgeType,
  draft: GoldenDraft,
): { ok: true; row: GoldenRowInput } | { ok: false; message: string } {
  const grade = draft.grade.trim();
  if (!grade) return { ok: false, message: "학년을 입력하세요." };
  const subject = draft.subject.trim();
  if (!subject) return { ok: false, message: "과목을 입력하세요." };
  if (!draft.expected.length) {
    return { ok: false, message: "기대 자료를 1개 이상 고르세요." };
  }
  return {
    ok: true,
    row: {
      knowledge_type: knowledgeType,
      grade,
      subject,
      career: optional(draft.career),
      selected_topic: optional(draft.selectedTopic),
      assessment_info: optional(draft.assessmentInfo),
      note: optional(draft.note),
      expected_resource_ids: draft.expected.map((item) => item.id),
    },
  };
}
