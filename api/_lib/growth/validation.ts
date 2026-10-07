// 성장설계 생성 단계 응답 검증(No.87, No.88, No.89, No.95, No.163).
// 외부 의존은 sections 모듈의 순수 검증 함수뿐이다.
import { validateSections } from "./sections.js";

/** 금지 표현 사전(모든 단계 적용, No.163). */
export const FORBIDDEN_PHRASES: readonly string[] = [
  "합격 가능성",
  "합격 가능",
  "합격률",
  "합격 확률",
  "합격할 수",
  "예측",
  "예상 합격",
  "안정권",
  "소신권",
  "상향권",
];

/**
 * 활동 근거(evidence_ids) 검사를 면제하는 항목 id.
 * 프로필, 분포 집계, 설문 답 기반 항목(1-2), 성적과 입결 기반 항목은 활동 근거 대신 데이터 자체가 근거다.
 * 활동이 0건인 회차에서도 ok 로 둘 수 있어야 한다.
 */
export const EVIDENCE_EXEMPT_SECTION_IDS: readonly string[] = [
  "1-1",
  "1-2",
  "1-4",
  "1-12",
  "1-13",
  "1-14",
  "3-10",
];

const stripSpaces = (v: string): string => v.replace(/\s+/g, "");

/**
 * 텍스트에서 발견된 금지 표현(중복 제거). 입력과 사전 항목 모두 공백을 제거해 비교하고,
 * 발견 목록은 사전 원문으로 돌려준다.
 * 앱이 붙이는 고지 문구(ADMISSION_DISCLAIMER 등)도 8단계 조립 뒤 같은 검사를 받는다.
 * 그래서 고정 문구는 이 사전의 어떤 항목도 포함하지 않게 쓴다.
 */
export function findForbiddenPhrases(text: string): string[] {
  const compact = stripSpaces(text);
  return FORBIDDEN_PHRASES.filter((p) => compact.includes(stripSpaces(p)));
}

/** 1~7단계 부분 산출물의 느슨한 항목 타입. 최종 항목 스키마는 sections.SectionItem 이다. */
export type StepSectionDraft = {
  id: string;
  format?: string;
  badge?: string;
  status?: "ok" | "no_data";
  evidence_ids?: string[];
  body?: unknown;
  formula?: string;
};

export type ValidationIssue = { code: string; message: string; path?: string };
export type StepValidationResult = { ok: boolean; issues: ValidationIssue[] };
export type ValidationContext = {
  expectedSectionIds: string[];
  topicPatterns?: RegExp[];
  /** 5단계: 앱이 계산한 기대 계산식. 주어지면 공백 제거 후 정확히 같아야 한다. */
  expectedFormula?: string;
  /** 6~8단계: 주어지면 evidence_ids 가 모두 이 목록 안에 있어야 한다. */
  knownEvidenceIds?: string[];
};
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** 객체를 깊이 순회해 모든 문자열을 이어 붙인다(금지 표현 검사용). */
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

/** 단계별 응답 검증. 모든 단계에 금지 표현 검사를 적용한다. */
export function validateStep(
  step: StepNumber,
  payload: unknown,
  context: ValidationContext,
): StepValidationResult {
  const issues: ValidationIssue[] = [];
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      ok: false,
      issues: [
        { code: "invalid_payload", message: "응답이 객체 형식이 아닙니다." },
      ],
    };
  }
  for (const phrase of findForbiddenPhrases(collectText(payload))) {
    issues.push({
      code: "forbidden_phrase",
      message: `금지 표현 "${phrase}" 이(가) 포함되어 있습니다.`,
    });
  }
  if (step === 5)
    issues.push(
      ...checkFormula(
        payload as Record<string, unknown>,
        context.expectedFormula,
      ),
    );
  if (step === 6 || step === 7 || step === 8) {
    const drafts = readSections(payload);
    issues.push(...checkEvidence(drafts));
    issues.push(...checkKnownEvidence(drafts, context.knownEvidenceIds));
  }
  if (step === 7)
    issues.push(...checkTopicGenerated(payload, context.topicPatterns));
  if (step === 8) issues.push(...checkFinalReport(payload, context));
  return { ok: issues.length === 0, issues };
}

/** 7단계 기본 주제 생성 탐지 패턴(No.3, No.95). */
export const DEFAULT_TOPIC_PATTERNS: readonly RegExp[] = [
  /탐구\s*주제\s*[:：]/,
  /주제\s*[:：]\s*["“]/,
  /연구\s*주제\s*[:：]/,
];

// 7단계: 성장설계는 방향과 조건까지만 제시한다. 구체 주제 제시를 탐지한다.
function checkTopicGenerated(
  payload: unknown,
  custom?: RegExp[],
): ValidationIssue[] {
  const patterns = custom ?? DEFAULT_TOPIC_PATTERNS;
  const text = collectText(payload);
  return patterns.some((re) => re.test(text))
    ? [
        {
          code: "topic_generated",
          message:
            "구체적인 탐구 주제가 생성되었습니다. 방향과 조건까지만 제시해야 합니다.",
        },
      ]
    : [];
}

// 8단계: 항목 스키마, 레지스트리 대조, id 집합 일치는 sections.validateSections 에 위임한다.
function checkFinalReport(
  payload: unknown,
  context: ValidationContext,
): ValidationIssue[] {
  const raw = (payload as { sections?: unknown }).sections;
  const items = Array.isArray(raw) ? raw : [];
  return validateSections(items, context.expectedSectionIds).errors.map(
    (message) => {
      const id = /^([^:\s]+):/.exec(message)?.[1];
      return id
        ? { code: "section_schema", message, path: id }
        : { code: "section_schema", message };
    },
  );
}

// payload.sections 배열에서 id 를 가진 객체 항목만 추린다.
function readSections(payload: unknown): StepSectionDraft[] {
  const sections = (payload as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  return sections.filter(
    (s): s is StepSectionDraft =>
      s !== null &&
      typeof s === "object" &&
      typeof (s as StepSectionDraft).id === "string",
  );
}

// 6~8단계: no_data 가 아닌 항목은 근거(evidence_ids)가 1개 이상이어야 한다(면제 항목 제외).
function checkEvidence(sections: StepSectionDraft[]): ValidationIssue[] {
  return sections
    .filter(
      (s) =>
        s.status !== "no_data" &&
        !EVIDENCE_EXEMPT_SECTION_IDS.includes(s.id) &&
        (s.evidence_ids?.length ?? 0) < 1,
    )
    .map((s) => ({
      code: "missing_evidence",
      message: `항목 "${s.id}" 에 근거(evidence_ids)가 연결되어 있지 않습니다.`,
      path: s.id,
    }));
}

// 6~8단계: evidence_ids 가 알려진 근거 id 목록 안에 있어야 한다(목록이 있을 때만).
function checkKnownEvidence(
  sections: StepSectionDraft[],
  known?: string[],
): ValidationIssue[] {
  if (!known) return [];
  const set = new Set(known);
  const issues: ValidationIssue[] = [];
  for (const s of sections) {
    const unknown = (s.evidence_ids ?? []).filter((e) => !set.has(e));
    if (unknown.length > 0) {
      issues.push({
        code: "unknown_evidence",
        message: `항목 "${s.id}" 이(가) 모르는 근거 id 를 가리킵니다: ${unknown.join(", ")}`,
        path: s.id,
      });
    }
  }
  return issues;
}

// 5단계: 일관성 계산식 포함 여부와 형식(분수식과 % 표기)
function checkFormula(
  payload: Record<string, unknown>,
  expectedFormula?: string,
): ValidationIssue[] {
  const formula = payload.formula;
  if (typeof formula !== "string" || formula.trim() === "") {
    return [
      {
        code: "missing_formula",
        message: "계산식(formula)이 포함되어야 합니다.",
        path: "formula",
      },
    ];
  }
  const hasDivision = formula.includes("÷") || formula.includes("/");
  if (!hasDivision || !formula.includes("%")) {
    return [
      {
        code: "invalid_formula",
        message: "계산식에는 나눗셈(÷ 또는 /)과 % 표기가 모두 있어야 합니다.",
        path: "formula",
      },
    ];
  }
  if (
    expectedFormula !== undefined &&
    stripSpaces(formula) !== stripSpaces(expectedFormula)
  ) {
    return [
      {
        code: "formula_mismatch",
        message:
          "계산식이 앱이 계산한 값과 다릅니다. 주어진 계산식을 그대로 쓰세요.",
        path: "formula",
      },
    ];
  }
  return [];
}

/**
 * 모델을 부르는 단계마다 세션당 성공과 실패 합산 10회(No.89).
 * 단계별 카운터, 세션 안에서 단계마다 10회.
 */
export const MAX_MODEL_ATTEMPTS_PER_STEP = 10;

/** @deprecated MAX_MODEL_ATTEMPTS_PER_STEP 를 쓴다. */
export const MAX_MODEL_ATTEMPTS_PER_SESSION = MAX_MODEL_ATTEMPTS_PER_STEP;

/** 검증 실패 시 해당 단계 재요청에 붙일 문제 목록(No.88). */
export function buildRetryNote(issues: ValidationIssue[]): string[] {
  const notes = issues.map((i) =>
    i.path
      ? `[${i.path}] ${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`
      : `${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`,
  );
  // 잘림이나 깨진 JSON 은 같은 길이로 다시 쓰면 또 잘린다. 분량을 줄이라고 명시한다.
  if (issues.some((i) => i.code === "truncated" || i.code === "invalid_json")) {
    notes.push(
      "이전 응답이 출력 한도를 넘어 잘렸다. 모든 항목의 글 길이를 절반 이하로 줄이고, 같은 뜻의 문장을 반복하지 않는다. 항목 수는 안내한 범위를 지킨다.",
    );
  }
  return notes;
}

/** 해당 단계의 누적 시도 횟수가 상한 미만이면 재시도 가능. */
export function canRetry(attemptCount: number): boolean {
  return attemptCount < MAX_MODEL_ATTEMPTS_PER_STEP;
}
