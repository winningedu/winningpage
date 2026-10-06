// 심화탐구 모델 응답 검증(No.2, 12, 15, 48, 49, 55, 64, 99, 122, 123, 125, 126).
// 순수 함수만 둔다. 모델 호출과 저장은 호출자가 맡는다.
import {
  CHECKLIST,
  CORE_ERRORS,
  LINK_KINDS,
  MAX_MODEL_ATTEMPTS_PER_MODE,
  NEEDS_CHECK,
  RUBRIC,
  RELIABILITY_PHRASE,
  SECTION_IDS,
} from "./constants.js";
import type {
  CoreErrorId,
  DesignReport,
  FixItem,
  RubricItemId,
  LinkKind,
  Reliability,
  SectionId,
  SectionPlan,
  TopicDetail,
  ValidationIssue,
} from "./types.js";

export type { ValidationIssue };

/** 금지 산출 사전(§6 14). 공백을 뺀 문자열로 비교한다. */
export const FORBIDDEN_OUTPUT_PHRASES: readonly string[] = [
  "합격 가능성",
  "합격률",
  "합격 확률",
  "예상 점수",
  "등급 예측",
  "인공지능 작성",
  "표절",
  "조작",
  "대필",
  "학생부 등급",
];

const stripSpaces = (v: string): string => v.replace(/\s+/g, "");

/** 텍스트에서 발견된 금지 산출 표현(사전 원문, 사전 순서). */
export function findForbiddenPhrases(text: string): string[] {
  const compact = stripSpaces(text);
  return FORBIDDEN_OUTPUT_PHRASES.filter((p) =>
    compact.includes(stripSpaces(p)),
  );
}

/** 마크다운 기호: 별표, 줄 머리 샵, 백틱, 줄 머리 목록 기호. */
export const MARKDOWN_RE = /\*|^\s*#|`|^\s*[-*]\s/m;

const MARKDOWN_PARTS: readonly { label: string; re: RegExp }[] = [
  { label: "별표(*)", re: /\*/ },
  { label: "줄 머리 샵(#)", re: /^\s*#/m },
  { label: "백틱(`)", re: /`/ },
  { label: "줄 머리 목록 기호", re: /^\s*[-*]\s/m },
];

/** 발견된 마크다운 기호의 표기 배열. 없으면 빈 배열. */
export function findMarkdown(text: string): string[] {
  return MARKDOWN_PARTS.filter((p) => p.re.test(text)).map((p) => p.label);
}

/** 서지 창작 패턴(§6 15): DOI, URL, "외 n명", 연도 괄호. */
export const CITATION_RE =
  /10\.\d{4,}\/\S+|https?:\/\/|외\s*\d+\s*명|\((?:19|20)\d{2}\)/;

const CITATION_PARTS: readonly { label: string; re: RegExp }[] = [
  { label: "DOI", re: /10\.\d{4,}\/\S+/ },
  { label: "URL", re: /https?:\/\// },
  { label: "외 n명", re: /외\s*\d+\s*명/ },
  { label: "연도 괄호", re: /\((?:19|20)\d{2}\)/ },
];

/** 발견된 서지 창작 패턴의 표기 배열. 설계와 추천 응답에만 쓴다. */
export function findFabricatedCitations(text: string): string[] {
  return CITATION_PARTS.filter((p) => p.re.test(text)).map((p) => p.label);
}

/** 객체를 깊이 순회해 모든 문자열을 이어 붙인다. */
export function collectText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectText).join("\n");
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(collectText)
      .join("\n");
  }
  return "";
}

/** "다." 로 끝나는 완결문 수. */
export function completeSentenceCount(text: string): number {
  return (text.match(/다\.(?=\s|$)/g) ?? []).length;
}

export function exceedsLength(text: string, max: number): boolean {
  return [...text].length > max;
}

/** 코드 울타리(```json ... ```)를 벗긴다. */
export function stripCodeFence(raw: string): string {
  const m = /^\s*```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```\s*$/.exec(raw);
  return (m ? (m[1] ?? "") : raw).trim();
}

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; issue: ValidationIssue };

/** 코드 울타리를 벗기고 JSON 으로 파싱한다(No.125). */
export function parseJsonResponse(raw: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(stripCodeFence(raw)) };
  } catch {
    return {
      ok: false,
      issue: {
        code: "invalid_json",
        message: "응답이 JSON 형식이 아니거나 중간에 잘렸다.",
      },
    };
  }
}

/** 잘림 재요청에 붙이는 분량 축소 문구(§2 26). */
export const TRUNCATED_RETRY_NOTE =
  "이전 응답이 출력 한도를 넘어 잘렸다. 모든 항목의 글 길이를 절반 이하로 줄이고, 같은 뜻의 문장을 반복하지 않는다. 항목 수는 안내한 범위를 지킨다.";

/** 검증 실패 시 재요청에 붙일 문제 목록(No.126). */
export function buildRetryNote(issues: ValidationIssue[]): string[] {
  const notes = issues.map((i) =>
    i.path
      ? `[${i.path}] ${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`
      : `${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`,
  );
  if (issues.some((i) => i.code === "truncated" || i.code === "invalid_json")) {
    notes.push(TRUNCATED_RETRY_NOTE);
  }
  return notes;
}

/** mode 별 누적 시도 횟수가 상한 미만이면 재시도 가능(No.22). */
export function canRetry(attemptCount: number): boolean {
  return attemptCount < MAX_MODEL_ATTEMPTS_PER_MODE;
}

// ── 공통 검사 도구 ──────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** 비어 있지 않은 문자열이면 트림해 돌려주고, 아니면 null. */
function readText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** 금지 산출, 마크다운 검사. citations 가 true 면 서지 창작도 검사한다. */
function checkTextRules(
  text: string,
  options: { citations: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const p of findForbiddenPhrases(text)) {
    issues.push({
      code: "forbidden_phrase",
      message: `금지 표현 "${p}" 이(가) 포함되어 있다.`,
    });
  }
  const md = findMarkdown(text);
  if (md.length > 0) {
    issues.push({
      code: "markdown",
      message: `마크다운 기호(${md.join(", ")})를 쓰지 않는다.`,
    });
  }
  if (options.citations) {
    const cites = findFabricatedCitations(text);
    if (cites.length > 0) {
      issues.push({
        code: "fabricated_citation",
        message: `논문명, DOI, URL, 저자와 연도 같은 서지 정보(${cites.join(", ")})를 지어 쓰지 않는다. 검색 계획으로 대신한다.`,
      });
    }
  }
  return issues;
}

export type ValidationFailure = { ok: false; issues: ValidationIssue[] };

const invalidPayload = (): ValidationFailure => ({
  ok: false,
  issues: [
    { code: "invalid_payload", message: "응답이 올바른 객체 형식이 아니다." },
  ],
});

// ── 주제 추천(No.48, 49, 53, 55, 125, 146) ──────────────────────────────────

/** 모델이 돌려주는 주제 한 건. 연계 허용값과 적합도는 서버가 정하므로 없다. */
export type ModelTopic = { linkKind: LinkKind } & Omit<
  TopicDetail,
  "path" | "fitReason" | "followUpQuestions"
> & {
    path: { from: string; via: string; to: string };
    fitReason: string | null;
    followUpQuestions: string[];
  };

const TOPIC_TEXT_KEYS = [
  "title",
  "subtitle",
  "question",
  "hypothesis1",
  "hypothesis2",
  "verifiability",
  "reason",
  "careerLink",
  "nextDirection",
] as const;

/** 질문은 물음표로 끝나는 한 문장. */
function isSingleQuestion(q: string): boolean {
  return (
    q.endsWith("?") && (q.match(/\?/g) ?? []).length === 1 && !/다\./.test(q)
  );
}

/** 문자열 배열을 읽는다. 빈 항목이 있으면 null. */
function readTextList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const t = readText(item);
    if (t === null) return null;
    out.push(t);
  }
  return out;
}

function readTopic(
  raw: unknown,
  idx: number,
  expectProvisional: boolean,
  issues: ValidationIssue[],
): ModelTopic | null {
  const at = `topics[${idx}]`;
  if (!isRecord(raw)) {
    issues.push({
      code: "invalid_payload",
      message: "주제가 객체가 아니다.",
      path: at,
    });
    return null;
  }
  const before = issues.length;
  const text: Record<string, string> = {};
  for (const key of TOPIC_TEXT_KEYS) {
    const t = readText(raw[key]);
    if (t === null) {
      issues.push({
        code: "field_empty",
        message: `${key} 항목이 비어 있다.`,
        path: `${at}.${key}`,
      });
    } else text[key] = t;
  }
  const kind = raw.linkKind;
  if (!LINK_KINDS.includes(kind as LinkKind)) {
    issues.push({
      code: "link_kind_invalid",
      message:
        "linkKind 는 followup, transfer, critique, extension 중 하나여야 한다.",
      path: `${at}.linkKind`,
    });
  }
  const concepts = readTextList(raw.concepts);
  if (concepts === null || concepts.length !== 4) {
    issues.push({
      code: "concepts_count",
      message: "개념은 비어 있지 않은 항목 정확히 4개다.",
      path: `${at}.concepts`,
    });
  }
  const steps = readTextList(raw.methodSteps);
  if (steps === null || steps.length !== 4) {
    issues.push({
      code: "method_steps_count",
      message: "방법 단계는 비어 있지 않은 항목 정확히 4개다.",
      path: `${at}.methodSteps`,
    });
  }
  const sources = readTextList(raw.sourceCandidates);
  if (sources === null || sources.length < 1) {
    issues.push({
      code: "field_empty",
      message: "자료 후보가 비어 있다.",
      path: `${at}.sourceCandidates`,
    });
  }
  const pathRaw = isRecord(raw.path) ? raw.path : {};
  const from = readText(pathRaw.from);
  const via = readText(pathRaw.via);
  const to = readText(pathRaw.to);
  if (from === null || via === null || to === null) {
    issues.push({
      code: "field_empty",
      message: "경로(from, via, to)가 비어 있다.",
      path: `${at}.path`,
    });
  }
  if (text.question && !isSingleQuestion(text.question)) {
    issues.push({
      code: "question_format",
      message: "탐구 질문은 물음표로 끝나는 한 문장이어야 한다.",
      path: `${at}.question`,
    });
  }
  let followUps: string[] = [];
  if (expectProvisional) {
    const f = readTextList(raw.followUpQuestions);
    if (f === null || f.length !== 3) {
      issues.push({
        code: "followup_count",
        message: "이전 활동 확인 질문은 정확히 3개다.",
        path: `${at}.followUpQuestions`,
      });
    } else followUps = f;
  }
  for (const issue of checkTextRules(
    collectText({
      ...text,
      concepts,
      steps,
      sources,
      path: [from, via, to],
      followUps,
    }),
    { citations: true },
  )) {
    issues.push({ ...issue, path: at });
  }
  if (issues.length > before) return null;
  return {
    linkKind: kind as LinkKind,
    title: text.title as string,
    subtitle: text.subtitle as string,
    question: text.question as string,
    hypothesis1: text.hypothesis1 as string,
    hypothesis2: text.hypothesis2 as string,
    verifiability: text.verifiability as string,
    concepts: concepts as string[],
    methodSteps: steps as string[],
    sourceCandidates: sources as string[],
    reason: text.reason as string,
    careerLink: text.careerLink as string,
    nextDirection: text.nextDirection as string,
    path: { from: from as string, via: via as string, to: to as string },
    fitReason: readText(raw.fitReason),
    followUpQuestions: followUps,
  };
}

export type TopicsValidation =
  | { ok: true; topics: ModelTopic[] }
  | ValidationFailure;

/** 주제 추천 응답 검증과 정규화. 배열 또는 { topics: [...] } 를 받는다. */
export function validateTopicsResponse(
  value: unknown,
  ctx: { expectProvisional: boolean; excludedTitles: string[] },
): TopicsValidation {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.topics)
      ? value.topics
      : null;
  if (list === null) return invalidPayload();
  const issues: ValidationIssue[] = [];
  if (list.length !== 3) {
    issues.push({
      code: "topics_count",
      message: `주제는 정확히 3개여야 한다. 지금은 ${list.length}개다.`,
    });
  }
  const topics: ModelTopic[] = [];
  list.forEach((raw, i) => {
    const t = readTopic(raw, i, ctx.expectProvisional, issues);
    if (t) topics.push(t);
  });
  const seen = new Set<string>();
  const excluded = new Set(ctx.excludedTitles.map(stripSpaces));
  for (const t of topics) {
    const key = stripSpaces(t.title);
    if (seen.has(key)) {
      issues.push({
        code: "duplicate_title",
        message: `제목 "${t.title}" 이(가) 중복된다.`,
      });
    }
    seen.add(key);
    if (excluded.has(key)) {
      issues.push({
        code: "excluded_title",
        message: `제목 "${t.title}" 은(는) 이전에 보여 준 주제와 같다. 다른 주제를 낸다.`,
      });
    }
  }
  const kinds = topics.map((t) => t.linkKind);
  if (new Set(kinds).size !== kinds.length) {
    issues.push({
      code: "link_kind_duplicate",
      message: "주제 3개의 연계 유형은 서로 달라야 한다.",
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, topics };
}

// ── 설계 리포트(No.39, 59~64, 68~70, §2 25) ─────────────────────────────────

const MUST_RANGE = { min: 3, max: 5 } as const;
const AVOID_RANGE = { min: 2, max: 5 } as const;
/** must, avoid 한 항목 글자 수 상한(§2 25). */
export const DESIGN_ITEM_MAX_CHARS = 100;
/** tip 글자 수 상한(§2 25). */
export const DESIGN_TIP_MAX_CHARS = 120;

function readSectionPlan(
  raw: unknown,
  idx: number,
  issues: ValidationIssue[],
): SectionPlan | null {
  const at = `sections[${idx}]`;
  if (!isRecord(raw)) {
    issues.push({
      code: "invalid_payload",
      message: "절 설계가 객체가 아니다.",
      path: at,
    });
    return null;
  }
  const before = issues.length;
  const id = raw.id as SectionId;
  const role = readText(raw.role);
  const tip = readText(raw.tip);
  if (role === null) {
    issues.push({
      code: "field_empty",
      message: "role 이 비어 있다.",
      path: `${at}.role`,
    });
  }
  if (tip === null) {
    issues.push({
      code: "field_empty",
      message: "tip 이 비어 있다.",
      path: `${at}.tip`,
    });
  } else if (exceedsLength(tip, DESIGN_TIP_MAX_CHARS)) {
    issues.push({
      code: "too_long",
      message: `tip 은 ${DESIGN_TIP_MAX_CHARS}자 이하여야 한다.`,
      path: `${at}.tip`,
    });
  }
  const readList = (
    key: "must" | "avoid",
    range: { min: number; max: number },
  ): string[] => {
    const list = readTextList(raw[key]);
    if (list === null || list.length < range.min || list.length > range.max) {
      issues.push({
        code: `${key}_count`,
        message: `${key} 는 비어 있지 않은 항목 ${range.min}~${range.max}개다.`,
        path: `${at}.${key}`,
      });
      return [];
    }
    list.forEach((item, i) => {
      if (exceedsLength(item, DESIGN_ITEM_MAX_CHARS)) {
        issues.push({
          code: "too_long",
          message: `${key} 항목은 ${DESIGN_ITEM_MAX_CHARS}자 이하여야 한다.`,
          path: `${at}.${key}[${i}]`,
        });
      }
    });
    return list;
  };
  const must = readList("must", MUST_RANGE);
  const avoid = readList("avoid", AVOID_RANGE);
  // 완성문 대필 휴리스틱: must 와 tip 한 항목에 완결문이 2개 이상이면 안 된다.
  for (const [i, item] of [...must, ...(tip ? [tip] : [])].entries()) {
    if (completeSentenceCount(item) >= 2) {
      issues.push({
        code: "ghostwriting",
        message:
          "작성 지침에 완성된 문장을 여러 개 쓰지 않는다. 무엇을 쓸지만 짧게 안내한다.",
        path: `${at}.${i < must.length ? `must[${i}]` : "tip"}`,
      });
    }
  }
  if (issues.length > before) return null;
  return { id, role: role as string, must, avoid, tip: tip as string };
}

/** 신뢰도 B, C 의 Ⅰ절 표현 규칙(No.39). */
function checkReliabilityPhrase(
  sections: SectionPlan[],
  reliability: Reliability,
): ValidationIssue[] {
  if (reliability === "A") return [];
  const first = sections.find((s) => s.id === "I");
  if (!first) return [];
  const issues: ValidationIssue[] = [];
  const guidance = stripSpaces([...first.must, first.tip].join(""));
  if (!guidance.includes(stripSpaces(RELIABILITY_PHRASE.required))) {
    issues.push({
      code: "reliability_phrase_missing",
      message: `Ⅰ절 안내에 "${RELIABILITY_PHRASE.required}" 표현으로 출발 활동의 확인 범위를 밝히게 한다.`,
      path: "sections[0]",
    });
  }
  if (
    stripSpaces(collectText(first)).includes(
      stripSpaces(RELIABILITY_PHRASE.forbidden),
    )
  ) {
    issues.push({
      code: "reliability_phrase_forbidden",
      message: `Ⅰ절에 "${RELIABILITY_PHRASE.forbidden}" 표현을 쓰지 않는다.`,
      path: "sections[0]",
    });
  }
  return issues;
}

export type DesignValidation =
  | { ok: true; design: DesignReport }
  | ValidationFailure;

/** 설계 리포트 응답 검증과 정규화. source, asOf 는 서버가 확인 필요로 채운다. */
export function validateDesignResponse(
  value: unknown,
  ctx: { reliability: Reliability },
): DesignValidation {
  if (!isRecord(value)) return invalidPayload();
  const issues: ValidationIssue[] = [];

  const verifiability = readText(value.verifiability);
  if (verifiability === null) {
    issues.push({
      code: "field_empty",
      message: "검증 가능성이 비어 있다.",
      path: "verifiability",
    });
  }

  const rawSections = Array.isArray(value.sections) ? value.sections : [];
  const ids = rawSections.map((s) => (isRecord(s) ? s.id : undefined));
  if (
    rawSections.length !== SECTION_IDS.length ||
    SECTION_IDS.some((id) => ids.filter((x) => x === id).length !== 1)
  ) {
    issues.push({
      code: "sections_ids",
      message: `절 설계는 ${SECTION_IDS.join(", ")} 8개가 한 번씩 있어야 한다.`,
      path: "sections",
    });
  }
  const parsed: SectionPlan[] = [];
  rawSections.forEach((raw, i) => {
    const p = readSectionPlan(raw, i, issues);
    if (p) parsed.push(p);
  });
  const sections = SECTION_IDS.flatMap((id) =>
    parsed.filter((p) => p.id === id),
  );

  const rawTable = Array.isArray(value.sourceTable)
    ? value.sourceTable
    : isRecord(value.sourceTable) && Array.isArray(value.sourceTable.rows)
      ? value.sourceTable.rows
      : [];
  const sourceTable = rawTable.flatMap((row, i) => {
    const item = isRecord(row) ? readText(row.item) : null;
    if (item === null) {
      issues.push({
        code: "field_empty",
        message: "자료 항목이 비어 있다.",
        path: `sourceTable[${i}].item`,
      });
      return [];
    }
    return [{ item, source: NEEDS_CHECK, asOf: NEEDS_CHECK }];
  });
  if (rawTable.length < 1) {
    issues.push({
      code: "field_empty",
      message: "자료 출처표는 1행 이상이다.",
      path: "sourceTable",
    });
  }

  const rawPlan = Array.isArray(value.searchPlan) ? value.searchPlan : [];
  const searchPlan = rawPlan.flatMap((row, i) => {
    const r = isRecord(row) ? row : {};
    const keyword = readText(r.keyword);
    const institution = readText(r.institution);
    const item = readText(r.item);
    if (keyword === null || institution === null || item === null) {
      issues.push({
        code: "field_empty",
        message: "검색 계획은 키워드, 기관, 확인할 항목 3열을 모두 채운다.",
        path: `searchPlan[${i}]`,
      });
      return [];
    }
    return [{ keyword, institution, item }];
  });
  if (rawPlan.length < 1) {
    issues.push({
      code: "field_empty",
      message: "검색 계획은 1건 이상이다.",
      path: "searchPlan",
    });
  }

  const iq = isRecord(value.interpretQuestions) ? value.interpretQuestions : {};
  const same = readText(iq.same);
  const different = readText(iq.different);
  const insufficient = readText(iq.insufficient);
  if (same === null || different === null || insufficient === null) {
    issues.push({
      code: "field_empty",
      message: "결과 해석 질문 3개(같다, 다르다, 부족하다)를 모두 채운다.",
      path: "interpretQuestions",
    });
  }

  const scopeRaw = isRecord(value.scope) ? value.scope : {};
  const minimum = readTextList(scopeRaw.minimum);
  const optional = readTextList(scopeRaw.optional) ?? [];
  if (minimum === null || minimum.length < 1) {
    issues.push({
      code: "field_empty",
      message: "최소 범위는 1개 이상이다.",
      path: "scope.minimum",
    });
  }

  issues.push(...checkTextRules(collectText(value), { citations: true }));
  issues.push(...checkReliabilityPhrase(sections, ctx.reliability));

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    design: {
      verifiability: verifiability as string,
      sections,
      sourceTable,
      searchPlan,
      interpretQuestions: {
        same: same as string,
        different: different as string,
        insufficient: insufficient as string,
      },
      scope: { minimum: minimum as string[], optional },
    },
  };
}

// ── 평가 리포트(No.84~102, §2 19) ───────────────────────────────────────────

/** 정규화된 모델 평가 응답. 수준과 점수는 scoring 이 계산한다. */
export type ValidatedEvaluation = {
  items: {
    id: RubricItemId;
    requirements: { id: string; met: boolean; note: string }[];
    evidence: string;
  }[];
  coreErrors: { id: CoreErrorId; location: SectionId; detail: string }[];
  fixes: FixItem[];
  sources: { text: string; hasUrlOrCitation: boolean }[];
  checklist: { id: string; met: boolean }[];
};

export type EvaluationValidation =
  | { ok: true; evaluation: ValidatedEvaluation }
  | ValidationFailure;

const asString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : "";
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** id 목록이 기대 집합과 정확히 같은지(각 한 번씩). */
function sameIds(actual: unknown[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    expected.every((id) => actual.filter((x) => x === id).length === 1)
  );
}

/**
 * 평가 응답은 형태만 검사한다. 점수 계산은 scoring 이 한다.
 * 학생 글을 옮긴 sources.text 와 단정 표현("증명했다")의 인용은 검사하지 않는다.
 */
export function validateEvaluationResponse(
  value: unknown,
): EvaluationValidation {
  if (!isRecord(value)) return invalidPayload();
  const issues: ValidationIssue[] = [];
  const feedback: string[] = [];

  const rawItems = asArray(value.items);
  const rawItemIds = rawItems.map((i) => (isRecord(i) ? i.id : undefined));
  if (
    !sameIds(
      rawItemIds,
      RUBRIC.map((r) => r.id),
    )
  ) {
    issues.push({
      code: "items_ids",
      message: "평가 항목 6개가 한 번씩 있어야 한다.",
      path: "items",
    });
  }
  const items: ValidatedEvaluation["items"] = [];
  for (const [i, raw] of rawItems.entries()) {
    const it = isRecord(raw) ? raw : {};
    const rubric = RUBRIC.find((r) => r.id === it.id);
    if (!rubric) continue;
    const reqs = asArray(it.requirements);
    const reqIds = reqs.map((r) => (isRecord(r) ? r.id : undefined));
    if (
      !sameIds(
        reqIds,
        rubric.requirements.map((r) => r.id),
      )
    ) {
      issues.push({
        code: "requirements_ids",
        message: `${rubric.id} 항목의 요건 4개가 한 번씩 있어야 한다.`,
        path: `items[${i}].requirements`,
      });
      continue;
    }
    const requirements: ValidatedEvaluation["items"][number]["requirements"] =
      [];
    for (const [j, r] of reqs.entries()) {
      const rr = r as Record<string, unknown>;
      if (typeof rr.met !== "boolean") {
        issues.push({
          code: "met_type",
          message: "met 는 true 또는 false 여야 한다.",
          path: `items[${i}].requirements[${j}].met`,
        });
        continue;
      }
      const note = asString(rr.note);
      feedback.push(note);
      requirements.push({ id: rr.id as string, met: rr.met, note });
    }
    const evidence = asString(it.evidence);
    feedback.push(evidence);
    items.push({ id: rubric.id, requirements, evidence });
  }

  const coreErrors: ValidatedEvaluation["coreErrors"] = [];
  for (const [i, raw] of asArray(value.coreErrors).entries()) {
    const c = isRecord(raw) ? raw : {};
    const meta = CORE_ERRORS.find((m) => m.id === c.id);
    if (!meta || !SECTION_IDS.includes(c.location as SectionId)) {
      issues.push({
        code: "core_error_invalid",
        message: "핵심 오류의 id 또는 위치가 허용값이 아니다.",
        path: `coreErrors[${i}]`,
      });
      continue;
    }
    // 앱이 판정하는 오류(⑤, ⑥)는 모델 응답을 버린다.
    if (meta.appJudged) continue;
    const detail = asString(c.detail);
    feedback.push(detail);
    coreErrors.push({ id: meta.id, location: c.location as SectionId, detail });
  }

  const fixes: FixItem[] = [];
  for (const [i, raw] of asArray(value.fixes).entries()) {
    const f = isRecord(raw) ? raw : {};
    const problem = readText(f.problem);
    const impact = readText(f.impact);
    const action = readText(f.action);
    const check = readText(f.check);
    if (
      !SECTION_IDS.includes(f.location as SectionId) ||
      problem === null ||
      impact === null ||
      action === null ||
      check === null
    ) {
      issues.push({
        code: "fix_incomplete",
        message:
          "먼저 고칠 것은 위치, 문제, 영향, 수정, 확인 기준 5필드를 모두 채운다.",
        path: `fixes[${i}]`,
      });
      continue;
    }
    feedback.push(problem, impact, action, check);
    fixes.push({
      location: f.location as SectionId,
      problem,
      impact,
      action,
      check,
    });
  }

  if (!Array.isArray(value.sources)) {
    issues.push({
      code: "sources_type",
      message: "sources 는 배열이어야 한다.",
      path: "sources",
    });
  }
  const sources = asArray(value.sources).map((raw) => {
    const s = isRecord(raw) ? raw : {};
    return {
      text: asString(s.text),
      hasUrlOrCitation: s.hasUrlOrCitation === true,
    };
  });

  const rawChecklist = asArray(value.checklist);
  const checklistIds = rawChecklist.map((c) =>
    isRecord(c) ? c.id : undefined,
  );
  if (
    !sameIds(
      checklistIds,
      CHECKLIST.map((c) => c.id),
    )
  ) {
    issues.push({
      code: "checklist_ids",
      message: "체크리스트 13개가 한 번씩 있어야 한다.",
      path: "checklist",
    });
  }
  const checklist = rawChecklist.flatMap((c) => {
    const cc = isRecord(c) ? c : {};
    return typeof cc.id === "string" && typeof cc.met === "boolean"
      ? [{ id: cc.id, met: cc.met }]
      : [];
  });

  issues.push(...checkTextRules(feedback.join("\n"), { citations: false }));

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    evaluation: { items, coreErrors, fixes, sources, checklist },
  };
}
