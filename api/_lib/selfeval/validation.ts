// 자기평가서 모델 응답 검증. 순수 함수만 둔다. 모델 호출과 저장은 호출자(P4)가 맡는다.
// 검증 사유는 hard 와 soft 로 나눈다. hard 는 재요청 뒤에도 실패면 단계 실패이고,
// soft 는 재요청 사유로만 쓰고 두 번째에도 벗어나면 통과시킨다(분량 오차는 학생이 고칠 수 있다).

import {
  FEELING_PATTERNS,
  FORBIDDEN_PHRASES,
  SCHOOL_NAME_PATTERN,
  SCORE_RUBRIC,
} from "./dictionaries.js";
import {
  containsUniversity,
  countByMode,
  countChars,
  extractKeywords,
  fixNominalEndings,
  hasMarkdown,
} from "./text.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type AnalysisField,
  type CharCount,
  type GenerationSections,
  type Paragraph,
  type ParagraphRole,
  type ScoreCheck,
  type ScoreItemKey,
  type Sentence,
  type StepIssue,
  TARGET_TOLERANCE,
  type TargetCharsMode,
} from "./types.js";

export type ValidationIssue = StepIssue;

const stripSpaces = (v: string): string => v.replace(/\s+/g, "");

/** 텍스트에서 발견된 금지 표현. 공백을 지우고 비교하고 사전 원문으로 돌려준다. */
export function findForbidden(text: string): string[] {
  const compact = stripSpaces(text);
  return FORBIDDEN_PHRASES.filter((p) => compact.includes(stripSpaces(p)));
}

export type ParseJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; issue: ValidationIssue };

const FENCE = /^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;

/**
 * 모델 원문을 JSON 으로 읽는다. MAX_TOKENS 는 본문이 우연히 파싱돼도 잘린 응답이므로
 * 먼저 truncated 로 막는다. responseSchema 를 줘도 코드 펜스가 붙는 경우가 있어 벗긴다.
 */
export function parseModelJson(
  text: string,
  finishReason: string | null,
): ParseJsonResult {
  if (finishReason === "MAX_TOKENS") {
    return {
      ok: false,
      issue: {
        code: "truncated",
        message: "응답이 출력 한도에서 잘렸습니다.",
      },
    };
  }
  const body = FENCE.exec(text)?.[1] ?? text;
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return {
      ok: false,
      issue: {
        code: "invalid_json",
        message: "응답이 JSON 형식이 아닙니다.",
      },
    };
  }
}

/** 재요청 뒤에도 두 번째 벗어남을 통과시키는 soft 사유 코드. */
const SOFT_CODES: ReadonlySet<string> = new Set(["length_off_target"]);

/** 사유가 하나라도 있으면 같은 단계를 한 번 더 요청할 수 있다. 횟수 상한은 호출자가 본다. */
export function canRetry(issues: ValidationIssue[]): boolean {
  return issues.length > 0;
}

/** 사유가 전부 soft 인가. 비어 있으면 false. */
export function isSoftOnly(issues: ValidationIssue[]): boolean {
  return issues.length > 0 && issues.every((i) => SOFT_CODES.has(i.code));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// 분석(analyze) 응답
// ---------------------------------------------------------------------------

/** 객체 안의 모든 문자열을 이어 붙인다. numbers, sources 는 모양이 정해져 있지 않다. */
function collectStrings(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectStrings).join(" ");
  if (isRecord(value))
    return Object.values(value).map(collectStrings).join(" ");
  if (typeof value === "number") return String(value);
  return "";
}

function recordText(record: ActivityRecordLike): string {
  return [
    record.topic,
    record.concept,
    record.method,
    record.result,
    record.limitation,
    collectStrings(record.numbers),
    collectStrings(record.sources),
  ]
    .map((v) => v ?? "")
    .join(" ");
}

export type AnalyzeValidation =
  | { ok: true; values: Record<AnalysisField, string> }
  | { ok: false; issues: ValidationIssue[] };

/**
 * 11항목 값을 검증한다. 모델이 기록에 없는 내용을 지어내는 것이 가장 큰 위험이라,
 * 값이 있으면 그 값의 낱말 중 하나는 기록 7항목 텍스트에 있어야 한다.
 * 형태소 분석을 쓰지 않는 근사 대조라 완전한 증명은 아니고 명백한 창작만 거른다.
 */
export function validateAnalyzeResponse(
  value: unknown,
  ctx: { record: ActivityRecordLike },
): AnalyzeValidation {
  const raw = isRecord(value) && isRecord(value.values) ? value.values : null;
  if (!raw) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid_payload",
          message: "values 객체가 없습니다.",
          path: "values",
        },
      ],
    };
  }
  const issues: ValidationIssue[] = [];
  const source = recordText(ctx.record);
  const values = {} as Record<AnalysisField, string>;
  for (const field of ANALYSIS_FIELDS) {
    const v = raw[field];
    if (typeof v !== "string") {
      issues.push({
        code: "missing_field",
        message: `항목 "${field}" 이(가) 문자열로 없습니다. 기록에 없으면 빈 문자열로 둡니다.`,
        path: field,
      });
      continue;
    }
    values[field] = v;
    if (v.trim() === "") continue;
    if (hasMarkdown(v)) {
      issues.push({
        code: "markdown",
        message: `항목 "${field}" 에 마크다운 기호가 있습니다.`,
        path: field,
      });
    }
    for (const phrase of findForbidden(v)) {
      issues.push({
        code: "forbidden_phrase",
        message: `항목 "${field}" 에 금지 표현 "${phrase}" 이(가) 있습니다.`,
        path: field,
      });
    }
    const keywords = extractKeywords(v);
    if (keywords.length > 0 && !keywords.some((k) => source.includes(k))) {
      issues.push({
        code: "unsupported_value",
        message: `항목 "${field}" 의 내용이 기록에서 확인되지 않습니다. 기록에 있는 문구만 옮기고, 없으면 빈 문자열로 두세요.`,
        path: field,
      });
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, values };
}

// ---------------------------------------------------------------------------
// 본문 생성(write) 응답
// ---------------------------------------------------------------------------

export type WriteValidationContext = {
  coreActivityId: string;
  supportActivityIds: string[];
  /** 핵심 활동 분석에서 비어 있지 않은 항목만. 비운 항목을 evidence 로 쓰면 막는다. */
  allowedFields: AnalysisField[];
  targetChars: number | null;
  mode: TargetCharsMode;
  universities: string[];
  shortMode: boolean;
  expectedParagraphs: 3 | 4;
};

export type WriteValidation =
  | {
      ok: true;
      sections: GenerationSections;
      charCount: CharCount;
      softIssues: ValidationIssue[];
    }
  | { ok: false; issues: ValidationIssue[] };

const ROLES_3: readonly ParagraphRole[] = ["process", "judgment", "wrap"];
const ROLES_4: readonly ParagraphRole[] = ["link", ...ROLES_3];

/** 문단당 이 수 이상이면 짧은 글(300자 이하) 모드 위반. 명세 §2 14 의 2문장 이하. */
const SHORT_MODE_MAX_SENTENCES = 2;

function readEvidence(
  raw: unknown,
  ctx: WriteValidationContext,
  path: string,
  issues: ValidationIssue[],
): Sentence["evidence"] {
  if (raw === null || raw === undefined) return null;
  const known = [ctx.coreActivityId, ...ctx.supportActivityIds];
  if (
    !isRecord(raw) ||
    typeof raw.activityId !== "string" ||
    !known.includes(raw.activityId)
  ) {
    issues.push({
      code: "unknown_evidence",
      message: `문장 ${path} 의 evidence.activityId 가 입력에 없는 활동입니다.`,
      path,
    });
    return null;
  }
  const field = raw.field;
  // 비운 항목 제한은 핵심 활동에만 건다. 보조 활동은 요약 문장만 받으므로
  // 핵심에서 비운 항목이 보조 근거까지 막으면 정당한 연계 근거를 못 쓴다.
  const allowed =
    raw.activityId === ctx.coreActivityId
      ? (ctx.allowedFields as string[])
      : (ANALYSIS_FIELDS as readonly string[]);
  if (typeof field !== "string" || !allowed.includes(field)) {
    issues.push({
      code: "empty_field_used",
      message: `문장 ${path} 이(가) 비어 있거나 없는 항목 "${String(field)}" 을(를) 근거로 썼습니다. 값이 있는 항목만 근거로 씁니다.`,
      path,
    });
    return null;
  }
  return { activityId: raw.activityId, field: field as AnalysisField };
}

/**
 * 본문 생성 응답을 검증하고 저장 모양으로 정규화한다.
 * hard 사유(구조, 근거, 금지어)는 재요청 뒤에도 남으면 실패이고, soft 사유(분량)는
 * softIssues 로 돌려 호출자가 첫 시도에만 재요청하게 한다.
 * feeling 은 모델 신고를 믿지 않고 서버가 판정한다(명세 No.48): 근거가 없거나
 * 느낌 표현 패턴이 걸리면 true. 학생이 확인하기 전까지 제출을 막는 표시라서 보수적으로 올린다.
 */
export function validateWriteResponse(
  value: unknown,
  ctx: WriteValidationContext,
): WriteValidation {
  const rawParagraphs =
    isRecord(value) && Array.isArray(value.paragraphs)
      ? value.paragraphs
      : null;
  if (!rawParagraphs) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid_payload",
          message: "paragraphs 배열이 없습니다.",
          path: "paragraphs",
        },
      ],
    };
  }
  const issues: ValidationIssue[] = [];
  const roles = ctx.expectedParagraphs === 4 ? ROLES_4 : ROLES_3;
  if (rawParagraphs.length !== ctx.expectedParagraphs) {
    issues.push({
      code: "paragraph_count",
      message: `문단은 ${ctx.expectedParagraphs}개여야 합니다(순서: ${roles.join(", ")}). 지금은 ${rawParagraphs.length}개입니다.`,
      path: "paragraphs",
    });
  }

  const paragraphs: Paragraph[] = [];
  rawParagraphs.forEach((rawP, pi) => {
    const pn = pi + 1;
    const p = isRecord(rawP) ? rawP : {};
    const expectedRole = roles[pi];
    if (
      rawParagraphs.length === ctx.expectedParagraphs &&
      p.role !== expectedRole
    ) {
      issues.push({
        code: "paragraph_role",
        message: `문단 ${pn} 의 role 은 ${expectedRole} 여야 합니다.`,
        path: `p${pn}`,
      });
    }
    const rawSentences = Array.isArray(p.sentences) ? p.sentences : [];
    if (ctx.shortMode && rawSentences.length > SHORT_MODE_MAX_SENTENCES) {
      issues.push({
        code: "short_mode_overflow",
        message: `분량이 짧아 문단 ${pn} 은 문장 ${SHORT_MODE_MAX_SENTENCES}개 이하여야 합니다.`,
        path: `p${pn}`,
      });
    }
    const sentences: Sentence[] = [];
    rawSentences.forEach((rawS, si) => {
      const id = `p${pn}-s${si + 1}`;
      const s = isRecord(rawS) ? rawS : {};
      const rawText = typeof s.text === "string" ? s.text.trim() : "";
      if (rawText === "") {
        issues.push({
          code: "empty_sentence",
          message: `문장 ${id} 의 text 가 비어 있습니다.`,
          path: id,
        });
        return;
      }
      const text = fixNominalEndings(rawText);
      const evidence = readEvidence(s.evidence, ctx, id, issues);
      const feeling =
        s.feeling === true ||
        evidence === null ||
        FEELING_PATTERNS.some((re) => re.test(text));
      sentences.push({ id, text, evidence, feeling, confirmed: false });
    });
    paragraphs.push({
      role: (typeof p.role === "string"
        ? p.role
        : expectedRole) as ParagraphRole,
      sentences,
    });
  });

  const fullText = paragraphs
    .map((p) => p.sentences.map((s) => s.text).join(" "))
    .join("\n\n");

  const university = containsUniversity(fullText, ctx.universities);
  if (university !== null) {
    issues.push({
      code: "university_name",
      message: `본문에 대학 이름 "${university}" 을(를) 쓸 수 없습니다.`,
    });
  }
  if (SCHOOL_NAME_PATTERN.test(fullText)) {
    issues.push({
      code: "school_name",
      message: "본문에 학교 이름을 쓸 수 없습니다.",
    });
  }
  if (hasMarkdown(fullText)) {
    issues.push({
      code: "markdown",
      message:
        "본문에 마크다운 기호(#, *, -, 번호 목록, 굵게, 코드)를 쓸 수 없습니다.",
    });
  }
  for (const phrase of findForbidden(fullText)) {
    issues.push({
      code: "forbidden_phrase",
      message: `금지 표현 "${phrase}" 이(가) 포함되어 있습니다.`,
    });
  }

  const charCount = countChars(fullText);
  const softIssues: ValidationIssue[] = [];
  if (ctx.targetChars !== null) {
    const n = countByMode(fullText, ctx.mode);
    const lo = ctx.targetChars * (1 - TARGET_TOLERANCE);
    const hi = ctx.targetChars * (1 + TARGET_TOLERANCE);
    if (n < lo || n > hi) {
      softIssues.push({
        code: "length_off_target",
        message: `글자 수가 ${n}자입니다. 목표 ${ctx.targetChars}자의 ±5% (${Math.ceil(lo)}~${Math.floor(hi)}자) 안으로 맞춥니다.`,
      });
    }
  }

  if (issues.length > 0)
    return { ok: false, issues: [...issues, ...softIssues] };
  return { ok: true, sections: { paragraphs }, charCount, softIssues };
}

// ---------------------------------------------------------------------------
// 검증(verify) 응답
// ---------------------------------------------------------------------------

export const STAGE_CHECK_TEXTS: readonly string[] = [
  "학년 단계에 맞게 출발점에서 도착점으로 나아갔는가",
  "성장설계가 지목한 부족 축을 이 글에서 채웠는가",
];

export type VerifyValidation =
  | {
      ok: true;
      checks: Record<ScoreItemKey, ScoreCheck[]>;
      stageChecks: ScoreCheck[];
    }
  | { ok: false; issues: ValidationIssue[] };

/**
 * 채점 응답을 검증한다. 모델은 pass 만 판정하고 점수는 내지 않는다(점수는 scoring.ts).
 * 확인 문장은 루브릭 정본으로 덮어써서 모델이 문구를 바꿔도 화면과 계산이 흔들리지 않는다.
 */
export function validateVerifyResponse(
  value: unknown,
  ctx: { expectGrowth: boolean },
): VerifyValidation {
  const rawItems =
    isRecord(value) && Array.isArray(value.items) ? value.items : null;
  if (!rawItems) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid_payload",
          message: "items 배열이 없습니다.",
          path: "items",
        },
      ],
    };
  }
  const issues: ValidationIssue[] = [];
  const checks = {} as Record<ScoreItemKey, ScoreCheck[]>;
  for (const row of SCORE_RUBRIC) {
    const raw = rawItems.find((i) => isRecord(i) && i.key === row.key);
    const list = isRecord(raw) && Array.isArray(raw.checks) ? raw.checks : null;
    if (!list) {
      issues.push({
        code: "missing_item",
        message: `채점 항목 "${row.key}" 이(가) 응답에 없습니다.`,
        path: row.key,
      });
      continue;
    }
    if (list.length !== row.checks.length) {
      issues.push({
        code: "check_count",
        message: `채점 항목 "${row.key}" 의 확인 문장은 ${row.checks.length}개여야 합니다. 지금은 ${list.length}개입니다.`,
        path: row.key,
      });
      continue;
    }
    if (!list.every((c) => isRecord(c) && typeof c.pass === "boolean")) {
      issues.push({
        code: "invalid_pass",
        message: `채점 항목 "${row.key}" 의 pass 는 true 또는 false 여야 합니다.`,
        path: row.key,
      });
      continue;
    }
    checks[row.key] = row.checks.map((text, i) => ({
      text,
      pass: (list[i] as { pass: boolean }).pass,
    }));
  }

  let stageChecks: ScoreCheck[] = [];
  if (ctx.expectGrowth) {
    const raw =
      isRecord(value) && Array.isArray(value.stageChecks)
        ? value.stageChecks
        : [];
    if (
      raw.length !== STAGE_CHECK_TEXTS.length ||
      !raw.every((c) => isRecord(c) && typeof c.pass === "boolean")
    ) {
      issues.push({
        code: "check_count",
        message: `stageChecks 는 ${STAGE_CHECK_TEXTS.length}개이고 각각 pass 가 true 또는 false 여야 합니다.`,
        path: "stageChecks",
      });
    } else {
      stageChecks = STAGE_CHECK_TEXTS.map((text, i) => ({
        text,
        pass: (raw[i] as { pass: boolean }).pass,
      }));
    }
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, checks, stageChecks };
}
