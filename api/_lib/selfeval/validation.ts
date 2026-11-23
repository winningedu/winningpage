// 자기평가서 모델 응답 검증. 순수 함수만 둔다. 모델 호출과 저장은 호출자(P4)가 맡는다.
// 검증 사유는 hard 와 soft 로 나눈다. hard 는 재요청 뒤에도 실패면 단계 실패이고,
// soft 는 재요청 사유로만 쓰고 두 번째에도 벗어나면 통과시킨다(분량 오차는 학생이 고칠 수 있다).

import {
  FORBIDDEN_PHRASES,
  SCHOOL_NAME_PATTERN,
  SCORE_RUBRIC,
  SENTENCE_STYLE,
} from "./dictionaries.js";
import { type EvidenceSources, resolveSentenceEvidence } from "./evidence.js";
import type { LinkJudgment, SupportLinkState } from "./linkWrite.js";
import {
  containsUniversity,
  countByMode,
  countChars,
  extractKeywords,
  findCausalLinkPhrases,
  hasMarkdown,
  normalizeNominalEndings,
} from "./text.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type AnalysisField,
  type CharCount,
  type GenerationSections,
  type Paragraph,
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
const SOFT_CODES: ReadonlySet<string> = new Set([
  "length_off_target",
  "causal_unconfirmed_link",
  "link_word_missing",
]);

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
  /** 이번 세션의 선택 기록과 포함된 수기 메모. 근거는 이 안에서만 인정한다. */
  sources: EvidenceSources;
  targetChars: number | null;
  mode: TargetCharsMode;
  universities: string[];
  /** 핵심 밖 선택 기록마다 연계 문장 규칙. 없으면 연계 문장 검사를 하지 않는다(명세 No.189, 193). */
  linkStates?: SupportLinkState[];
};

export type WriteValidation =
  | {
      ok: true;
      sections: GenerationSections;
      charCount: CharCount;
      softIssues: ValidationIssue[];
    }
  | { ok: false; issues: ValidationIssue[] };

/**
 * 본문 문장은 "~함" 명사형으로 끝나야 한다(명세 No.11). 끝의 문장 부호와 따옴표는 떼고,
 * 마지막 글자가 받침 ㅁ 인 음절(함, 음, 됨, 임, 세움, 깨달음)이면 통과다.
 * 했다, 한다, 합니다, 해요 같은 종결은 받침 ㅁ 이 아니라서 걸린다.
 */
const TRAILING_MARKS = /[\s.!?"'\u201d\u2019)\]」』]+$/;
const JONG_MIEUM = 16;

function isNominalStyle(text: string): boolean {
  const last = text.replace(TRAILING_MARKS, "").slice(-1);
  if (last === "") return false;
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === JONG_MIEUM;
}

/**
 * 연계 문장 검사(명세 No.189, 193). 둘 다 soft 라서 첫 시도에만 재요청하고, 그래도 남으면 글을 그대로 둔다.
 * 확인하지 않은 암묵 연계 기록을 인용한 문장에 인과 표현이 있으면 그 문장을 확인 필요로 올려 남긴다.
 * 연계 문장을 쓸 기록은 처음 인용한 문장에 앞 기록의 구체물 낱말이 하나라도 있어야 한다.
 */
function checkLinkSentences(
  paragraphs: Paragraph[],
  states: SupportLinkState[],
): ValidationIssue[] {
  const all = paragraphs.flatMap((p) => p.sentences);
  const issues: ValidationIssue[] = [];
  for (const st of states) {
    const citing = all.filter((s) => s.evidence.some((e) => e.refId === st.id));
    if (st.reason === "implicit_unconfirmed") {
      const causal = citing.filter(
        (s) => findCausalLinkPhrases(s.text).length > 0,
      );
      for (const s of causal) s.feeling = true;
      if (causal.length > 0) {
        issues.push({
          code: "causal_unconfirmed_link",
          message: `기록 ${st.id} 는 학생이 확인하지 않은 연계라서 기여 항목으로만 씁니다. 문장 ${causal.map((s) => s.id).join(", ")} 의 '~을 바탕으로', '~에서 이어' 같은 인과 표현을 쓰지 않고 다시 작성합니다.`,
        });
      }
    }
    const first = citing[0];
    if (
      st.mode === "link" &&
      st.carried.length > 0 &&
      first !== undefined &&
      !st.carried.some((w) => first.text.includes(w))
    ) {
      issues.push({
        code: "link_word_missing",
        message: `기록 ${st.id} 를 처음 인용한 문장 ${first.id} 에 넘어온 구체물 낱말(${st.carried.join(", ")}) 중 하나가 없습니다. 연계 문장에 그 낱말을 적어 다시 작성합니다.`,
      });
    }
  }
  return issues;
}

/**
 * 본문 생성 응답을 검증하고 저장 모양으로 정규화한다.
 * hard 사유(구조, 근거, 금지어)는 재요청 뒤에도 남으면 실패이고, soft 사유(분량)는
 * softIssues 로 돌려 호출자가 첫 시도에만 재요청하게 한다.
 * feeling 은 모델 신고를 보지 않고 서버가 판정한다(명세 No.48, 199): 근거가 하나도 없거나
 * 완료되지 않은 기록을 가리켰거나 근거로 설명되지 않는 수치가 있으면 true. 근거가 있는 문장은
 * 느낌 표현 패턴이 걸려도 표시하지 않는다(명세 No.49 결정). 규칙은 evidence.ts 에 있다.
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
  if (rawParagraphs.length < 1) {
    issues.push({
      code: "paragraph_count",
      message: "문단은 1개 이상이어야 합니다.",
      path: "paragraphs",
    });
  }

  const paragraphs: Paragraph[] = [];
  rawParagraphs.forEach((rawP, pi) => {
    const pn = pi + 1;
    const p = isRecord(rawP) ? rawP : {};
    const rawSentences = Array.isArray(p.sentences) ? p.sentences : [];
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
      const text = normalizeNominalEndings(rawText);
      if (!isNominalStyle(text)) {
        issues.push({
          code: "sentence_style",
          message: `문장 ${id} 이(가) '~${SENTENCE_STYLE}' 체가 아닙니다. 모든 문장을 '~${SENTENCE_STYLE}' 처럼 명사형으로 끝내 다시 작성합니다.`,
          path: id,
        });
      }
      if (
        s.evidence !== undefined &&
        s.evidence !== null &&
        !Array.isArray(s.evidence)
      ) {
        issues.push({
          code: "invalid_evidence",
          message: `문장 ${id} 의 evidence 는 배열이어야 합니다.`,
          path: id,
        });
      }
      const { evidence, needsConfirmation } = resolveSentenceEvidence(
        s.evidence,
        text,
        ctx.sources,
      );
      sentences.push({
        id,
        text,
        evidence,
        feeling: needsConfirmation,
        confirmed: false,
      });
    });
    paragraphs.push({ sentences });
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

  softIssues.push(...checkLinkSentences(paragraphs, ctx.linkStates ?? []));

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
      linkJudgments: LinkJudgment[];
    }
  | { ok: false; issues: ValidationIssue[] };

/**
 * 채점 응답을 검증한다. 모델은 pass 만 판정하고 점수는 내지 않는다(점수는 scoring.ts).
 * 확인 문장은 루브릭 정본으로 덮어써서 모델이 문구를 바꿔도 화면과 계산이 흔들리지 않는다.
 */
export function validateVerifyResponse(
  value: unknown,
  ctx: {
    expectGrowth: boolean;
    promptMissing?: boolean;
    /** 연계 판정을 받아야 하는 기록 id(명세 No.182, 190). */
    linkRecordIds?: string[];
  },
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
    // 학교 문항이 없으면 문항 대응은 묻지 않고, 응답에 있어도 버린다.
    if (row.key === "prompt" && ctx.promptMissing) {
      checks.prompt = [];
      continue;
    }
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

  const rawLinks =
    isRecord(value) && Array.isArray(value.linkChecks) ? value.linkChecks : [];
  const linkJudgments: LinkJudgment[] = [];
  for (const recordId of ctx.linkRecordIds ?? []) {
    const raw = rawLinks.find((c) => isRecord(c) && c.recordId === recordId);
    if (
      !isRecord(raw) ||
      typeof raw.linkShown !== "boolean" ||
      typeof raw.standsWithout !== "boolean"
    ) {
      issues.push({
        code: "link_check_missing",
        message: `linkChecks 에 기록 ${recordId} 의 linkShown 과 standsWithout 이 true 또는 false 로 있어야 합니다.`,
        path: "linkChecks",
      });
      continue;
    }
    linkJudgments.push({
      recordId,
      linkShown: raw.linkShown,
      standsWithout: raw.standsWithout,
    });
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, checks, stageChecks, linkJudgments };
}
