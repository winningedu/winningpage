// 평가 서버 계산(명세 No.82~92, 94~96, 4, 개발계획 §2 19, §6 7, 8, 9).
// 모델 응답은 요건 충족 여부와 근거만 준다. 수준, 점수, 상한, 라벨, 출처 상태는 여기서 정한다.
// 순수 함수만 둔다. DB 와 모델 호출은 호출 계층이 맡는다.
import {
  CHECKLIST,
  CORE_ERRORS,
  MAX_FIX_FIRST,
  REVISION_NEEDED_BELOW_TOTAL,
  RUBRIC,
  type RubricItem,
  type RubricRequirement,
  SECTION_IDS,
  SECTIONS,
} from "./constants.js";
import type {
  CoreErrorId,
  CoreErrorResult,
  EvaluationReport,
  FixItem,
  Level,
  RubricItemId,
  RubricItemResult,
  SectionId,
  SourceCheck,
  SubmissionLabel,
} from "./types.js";

/** 모델이 돌려주는 평가 응답(§2 19). 수준과 점수는 들어 있지 않다. */
export type ModelEvaluation = {
  items: {
    id: RubricItemId;
    requirements: { id: string; met: boolean; note: string }[];
    evidence: string;
  }[];
  coreErrors: {
    id: CoreErrorId;
    location: SectionId;
    detail: string;
    quote: string;
  }[];
  fixes: FixItem[];
  sources: { text: string; hasUrlOrCitation: boolean }[];
  checklist: { id: string; met: boolean }[];
};

/** 앱이 작성본과 설계 리포트에서 직접 센 사실. */
export type AppFacts = {
  counts: Record<SectionId, number>;
  placeholders: Partial<Record<SectionId, number>>;
  /** Ⅰ절 권장 분량(SECTIONS 의 I). */
  introMinChars: number;
  /** Ⅱ절 원문. */
  questionText: string;
  /** Ⅳ 또는 Ⅴ절에 아라비아 숫자가 있음. */
  hasNumbersInResults: boolean;
  /** Ⅷ절 줄 수. */
  sourceLineCount: number;
  /** 예비 주제 세션(No.4). */
  isProvisional: boolean;
  designSourceTableRows: number;
};

type DeterministicKey = NonNullable<RubricRequirement["deterministic"]>;

const QUESTION_MAX_CHARS = 150;
const FILLED_SECTIONS: readonly SectionId[] = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
];

/** 소수 첫째 자리 반올림. 배점 x 수준 x 10 / 4 는 항상 0.5 단위라 부동소수 오차가 없다(No.94). */
export function scoreOf(maxScore: number, level: Level): number {
  return Math.round((maxScore * level * 10) / 4) / 10;
}

export function labelFor(input: {
  total: number;
  coreErrorCount: number;
  anyLevelAtMost2: boolean;
  evaluable: boolean;
}): SubmissionLabel {
  if (!input.evaluable) return "not_evaluable";
  if (input.coreErrorCount >= 1) return "major_revision_needed";
  if (input.anyLevelAtMost2 || input.total < REVISION_NEEDED_BELOW_TOTAL) {
    return "revision_needed";
  }
  return "ready_with_minor_edits";
}

/** 1차는 조회 기록이 없어 retrieved_verified 를 만들지 않는다(No.96, §6 9). */
export function sourceStatuses(
  sources: { text: string; hasUrlOrCitation: boolean }[],
): SourceCheck[] {
  return sources.map((s) => ({
    text: s.text,
    status: s.hasUrlOrCitation ? "supplied_unverified" : "search_target",
  }));
}

function questionSentences(text: string): string[] {
  return text
    .split(/(?<=[?？.!。])\s+|\n/)
    .map((s) => s.trim())
    .filter((s) => /[?？]$/.test(s));
}

function placeholderTotal(
  placeholders: Partial<Record<SectionId, number>>,
): number {
  return Object.values(placeholders).reduce((a, b) => a + (b ?? 0), 0);
}

/** 앱이 판정해 모델 판정을 덮어쓰는 결정적 요건(§2 19, §6 7). */
export function deterministicRequirement(
  key: DeterministicKey,
  facts: AppFacts,
): boolean {
  switch (key) {
    case "intro_min_chars":
      return facts.counts.I >= facts.introMinChars;
    case "question_single_sentence":
      return questionSentences(facts.questionText).some(
        (s) => s.length <= QUESTION_MAX_CHARS,
      );
    case "both_hypotheses":
      return (
        /가설\s*1/.test(facts.questionText) &&
        /가설\s*2/.test(facts.questionText)
      );
    case "source_table_filled":
      return facts.designSourceTableRows > 0;
    case "no_placeholders":
      return placeholderTotal(facts.placeholders) === 0;
    case "sections_filled":
      return FILLED_SECTIONS.every((id) => facts.counts[id] > 0);
  }
}

// ── 핵심 오류(No.85) ────────────────────────────────────────────────────────

const ITEM_LABELS = Object.fromEntries(
  RUBRIC.map((r) => [r.id, r.label]),
) as Record<RubricItemId, string>;

function effectFor(id: CoreErrorId): string {
  const meta = CORE_ERRORS.find((e) => e.id === id);
  if (!meta) return "";
  return `${ITEM_LABELS[meta.capItem]} 항목은 ${meta.capLevel}수준까지만 받을 수 있어요`;
}

function numeralOf(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)?.numeral ?? id;
}

/** 앱이 직접 판정하는 핵심 오류 5, 6(§2 19). */
export function appCoreErrors(facts: AppFacts): CoreErrorResult[] {
  const out: CoreErrorResult[] = [];
  if (facts.hasNumbersInResults && facts.sourceLineCount === 0) {
    out.push({
      id: "unsourced_number",
      location: "VIII",
      detail: "결과와 해석에 숫자가 있는데 참고 자료가 비어 있어요",
      effect: effectFor("unsourced_number"),
    });
  }
  const filled = SECTION_IDS.filter((id) => (facts.placeholders[id] ?? 0) > 0);
  if (filled.length > 0) {
    let top = filled[0] as SectionId;
    for (const id of filled) {
      if ((facts.placeholders[id] ?? 0) > (facts.placeholders[top] ?? 0)) {
        top = id;
      }
    }
    const detail = filled
      .map((id) => `${numeralOf(id)}절 ${facts.placeholders[id]}개`)
      .join(", ");
    out.push({
      id: "placeholder_left",
      location: top,
      detail: `대괄호로 비워 둔 자리가 남아 있어요. ${detail}`,
      effect: effectFor("placeholder_left"),
    });
  }
  return out;
}

/** 모델 오류 중 앱 판정 대상은 버리고 앱 결과로 바꾼다. id 중복 제거, CORE_ERRORS 순서(§2 19). */
export function mergeCoreErrors(
  model: ModelEvaluation["coreErrors"],
  app: CoreErrorResult[],
): CoreErrorResult[] {
  const byId = new Map<CoreErrorId, CoreErrorResult>();
  for (const e of model) {
    const meta = CORE_ERRORS.find((m) => m.id === e.id);
    if (!meta || meta.appJudged || byId.has(e.id)) continue;
    // quote 는 가드 판정용이라 저장 모양(CoreErrorResult)에는 싣지 않는다.
    byId.set(e.id, {
      id: e.id,
      location: e.location,
      detail: e.detail,
      effect: effectFor(e.id),
    });
  }
  for (const e of app) byId.set(e.id, e);
  return CORE_ERRORS.flatMap((m) => {
    const found = byId.get(m.id);
    return found ? [found] : [];
  });
}

// ── 수준과 상한(No.83, 85, 4) ───────────────────────────────────────────────

/** 요건 4개를 판정해 충족 수를 수준으로 삼는다. 결정적 요건은 앱 판정, 나머지는 모델 판정. */
export function levelFor(
  item: RubricItem,
  modelReqs: { id: string; met: boolean; note: string }[],
  facts: AppFacts,
): { level: Level; met: string[]; unmet: string[] } {
  const met: string[] = [];
  const unmet: string[] = [];
  for (const req of item.requirements) {
    if (req.deterministic) {
      (deterministicRequirement(req.deterministic, facts) ? met : unmet).push(
        req.text,
      );
      continue;
    }
    const found = modelReqs.find((m) => m.id === req.id);
    if (found?.met) {
      met.push(req.text);
    } else {
      unmet.push(found?.note ? `${req.text}: ${found.note}` : req.text);
    }
  }
  return { level: met.length as Level, met, unmet };
}

export const PROVISIONAL_CAP_REASON =
  "관심 기반 예비 주제라 연계 점수는 0점이에요";

/** 핵심 오류 상한과 예비 주제 고정을 적용한다. 실제로 수준이 내려갈 때만 사유를 적는다. */
export function applyCaps(
  level: Level,
  itemId: RubricItemId,
  coreErrors: CoreErrorResult[],
  isProvisional = false,
): { level: Level; capReason: string | null } {
  if (isProvisional && itemId === "linkage") {
    return { level: 0, capReason: PROVISIONAL_CAP_REASON };
  }
  let cap: Level = level;
  let reason: string | null = null;
  for (const err of coreErrors) {
    const meta = CORE_ERRORS.find((m) => m.id === err.id);
    if (!meta || meta.capItem !== itemId || meta.capLevel >= cap) continue;
    cap = meta.capLevel;
    reason = `${meta.label} ${meta.capLevel}수준까지만 받을 수 있어요`;
  }
  return { level: cap, capReason: reason };
}

// ── 먼저 고칠 것(No.95) ─────────────────────────────────────────────────────

/** 핵심 오류 위치의 수정을 앞으로 보내 최대 MAX_FIX_FIRST 개를 먼저 고칠 것으로 둔다. 억지로 채우지 않는다. */
export function splitFixes(
  fixes: FixItem[],
  coreErrors: CoreErrorResult[],
): { fixFirst: FixItem[]; mustFix: FixItem[] } {
  const locations = new Set(coreErrors.map((e) => e.location));
  const ordered = [
    ...fixes.filter((f) => locations.has(f.location)),
    ...fixes.filter((f) => !locations.has(f.location)),
  ];
  return {
    fixFirst: ordered.slice(0, MAX_FIX_FIRST),
    mustFix: ordered.slice(MAX_FIX_FIRST),
  };
}

// ── 조립 ────────────────────────────────────────────────────────────────────

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildEvaluation(
  model: ModelEvaluation,
  facts: AppFacts,
): EvaluationReport {
  const coreErrors = mergeCoreErrors(model.coreErrors, appCoreErrors(facts));
  const items: RubricItemResult[] = RUBRIC.map((rubric) => {
    const modelItem = model.items.find((m) => m.id === rubric.id);
    const judged = levelFor(rubric, modelItem?.requirements ?? [], facts);
    const capped = applyCaps(
      judged.level,
      rubric.id,
      coreErrors,
      facts.isProvisional,
    );
    return {
      id: rubric.id,
      level: capped.level,
      score: scoreOf(rubric.maxScore, capped.level),
      met: judged.met,
      unmet: judged.unmet,
      evidence: modelItem?.evidence ?? "",
      capReason: capped.capReason,
    };
  });
  const total = roundTenth(items.reduce((sum, i) => sum + i.score, 0));
  const { fixFirst, mustFix } = splitFixes(model.fixes, coreErrors);
  return {
    total,
    label: labelFor({
      total,
      coreErrorCount: coreErrors.length,
      // 예비 주제로 0 고정된 연계 항목은 라벨 판정에서 뺀다(No.4). 총점에는 이미 반영돼 있다.
      anyLevelAtMost2: items.some(
        (i) => i.level <= 2 && !(facts.isProvisional && i.id === "linkage"),
      ),
      evaluable: true,
    }),
    items,
    coreErrors,
    fixFirst,
    mustFix,
    checklist: CHECKLIST.map((c) => ({
      id: c.id,
      met: model.checklist.find((m) => m.id === c.id)?.met === true,
    })),
    sources: sourceStatuses(model.sources),
    placeholders: facts.placeholders,
  };
}

// ── 모델 응답 모양 검증 ─────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameIdSet(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((id) => actual.includes(id))
  );
}

function parseItems(raw: unknown): ModelEvaluation["items"] | null {
  if (!Array.isArray(raw)) return null;
  const items: ModelEvaluation["items"] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.evidence !== "string") return null;
    const rubric = RUBRIC.find((r) => r.id === entry.id);
    if (!rubric || !Array.isArray(entry.requirements)) return null;
    const requirements: ModelEvaluation["items"][number]["requirements"] = [];
    for (const q of entry.requirements) {
      if (
        !isRecord(q) ||
        typeof q.id !== "string" ||
        typeof q.met !== "boolean" ||
        typeof q.note !== "string"
      ) {
        return null;
      }
      requirements.push({ id: q.id, met: q.met, note: q.note });
    }
    if (
      !sameIdSet(
        requirements.map((q) => q.id),
        rubric.requirements.map((q) => q.id),
      )
    ) {
      return null;
    }
    items.push({ id: rubric.id, requirements, evidence: entry.evidence });
  }
  return sameIdSet(
    items.map((i) => i.id),
    RUBRIC.map((r) => r.id),
  )
    ? items
    : null;
}

function isSectionId(v: unknown): v is SectionId {
  return (
    typeof v === "string" && (SECTION_IDS as readonly string[]).includes(v)
  );
}

function parseCoreErrors(raw: unknown): ModelEvaluation["coreErrors"] | null {
  if (!Array.isArray(raw)) return null;
  const out: ModelEvaluation["coreErrors"] = [];
  for (const e of raw) {
    if (
      !isRecord(e) ||
      typeof e.detail !== "string" ||
      typeof e.quote !== "string" ||
      !isSectionId(e.location)
    ) {
      return null;
    }
    const meta = CORE_ERRORS.find((m) => m.id === e.id);
    if (!meta) return null;
    out.push({
      id: meta.id,
      location: e.location,
      detail: e.detail,
      quote: e.quote,
    });
  }
  return out;
}

function parseFixes(raw: unknown): FixItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FixItem[] = [];
  for (const f of raw) {
    if (
      !isRecord(f) ||
      !isSectionId(f.location) ||
      typeof f.problem !== "string" ||
      typeof f.impact !== "string" ||
      typeof f.action !== "string" ||
      typeof f.check !== "string"
    ) {
      return null;
    }
    out.push({
      location: f.location,
      problem: f.problem,
      impact: f.impact,
      action: f.action,
      check: f.check,
    });
  }
  return out;
}

function parseSources(raw: unknown): ModelEvaluation["sources"] | null {
  if (!Array.isArray(raw)) return null;
  const out: ModelEvaluation["sources"] = [];
  for (const s of raw) {
    if (
      !isRecord(s) ||
      typeof s.text !== "string" ||
      typeof s.hasUrlOrCitation !== "boolean"
    ) {
      return null;
    }
    out.push({ text: s.text, hasUrlOrCitation: s.hasUrlOrCitation });
  }
  return out;
}

function parseChecklist(raw: unknown): ModelEvaluation["checklist"] | null {
  if (!Array.isArray(raw)) return null;
  const out: ModelEvaluation["checklist"] = [];
  for (const c of raw) {
    if (
      !isRecord(c) ||
      typeof c.id !== "string" ||
      typeof c.met !== "boolean"
    ) {
      return null;
    }
    out.push({ id: c.id, met: c.met });
  }
  return out;
}

/** 모델 응답이 평가 계약과 같은 모양인지 확인한다. 아니면 null(호출 계층이 재요청). */
export function validateModelEvaluationShape(
  input: unknown,
): ModelEvaluation | null {
  if (!isRecord(input)) return null;
  const items = parseItems(input.items);
  const coreErrors = parseCoreErrors(input.coreErrors);
  const fixes = parseFixes(input.fixes);
  const sources = parseSources(input.sources);
  const checklist = parseChecklist(input.checklist);
  if (!items || !coreErrors || !fixes || !sources || !checklist) return null;
  return { items, coreErrors, fixes, sources, checklist };
}
