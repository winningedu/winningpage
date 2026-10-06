// 성장설계 생성 단계 응답 검증(No.87, No.88, No.89, No.95, No.163).
// 외부 의존 없는 순수 함수 모음.

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

/** 텍스트에서 발견된 금지 표현(중복 제거). */
export function findForbiddenPhrases(text: string): string[] {
  return FORBIDDEN_PHRASES.filter((p) => text.includes(p));
}

/** 섹션 항목의 느슨한 구조적 타입. */
export type SectionItem = {
  id: string;
  format?: string;
  badge?: string;
  status?: "ok" | "no_data";
  evidence_ids?: string[];
  body?: unknown;
  formula?: string;
};

export type ValidationIssue = { code: string; message: string; path?: string };
export type ValidationResult = { ok: boolean; issues: ValidationIssue[] };
export type ValidationContext = {
  expectedSectionIds: string[];
  topicPatterns?: RegExp[];
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
): ValidationResult {
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
    issues.push(...checkFormula(payload as Record<string, unknown>));
  if (step === 6 || step === 7)
    issues.push(...checkEvidence(readSections(payload)));
  if (step === 7)
    issues.push(...checkTopicGenerated(payload, context.topicPatterns));
  if (step === 8)
    issues.push(
      ...checkFinalReport(readSections(payload), context.expectedSectionIds),
    );
  return { ok: issues.length === 0, issues };
}

/** 7단계 기본 주제 생성 탐지 패턴(No.3, No.95). */
export const DEFAULT_TOPIC_PATTERNS: readonly RegExp[] = [
  /탐구\s*주제\s*[:：]/,
  /주제\s*[:：]\s*["“]/,
  /연구\s*주제\s*[:：]/,
  /제목\s*[:：]/,
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

// 8단계: 섹션 id 집합 일치, 외부 데이터가 없는 항목도 no_data 로 존재(No.87), format·badge 필수.
function checkFinalReport(
  sections: SectionItem[],
  expected: string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const present = new Set(sections.map((s) => s.id));
  for (const id of expected) {
    if (!present.has(id)) {
      issues.push({
        code: "missing_section",
        message: `섹션 "${id}" 이(가) 빠졌습니다. 데이터가 없으면 status "no_data" 로 포함해야 합니다.`,
        path: id,
      });
    }
  }
  const expectedSet = new Set(expected);
  for (const s of sections) {
    if (!expectedSet.has(s.id)) {
      issues.push({
        code: "unexpected_section",
        message: `정의되지 않은 섹션 "${s.id}" 이(가) 포함되어 있습니다.`,
        path: s.id,
      });
    }
    if (!s.format) {
      issues.push({
        code: "missing_format",
        message: `섹션 "${s.id}" 에 format 이 없습니다.`,
        path: s.id,
      });
    }
    if (!s.badge) {
      issues.push({
        code: "missing_badge",
        message: `섹션 "${s.id}" 에 badge 가 없습니다.`,
        path: s.id,
      });
    }
  }
  return issues;
}

// payload.sections 배열에서 id 를 가진 객체 항목만 추린다.
function readSections(payload: unknown): SectionItem[] {
  const sections = (payload as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  return sections.filter(
    (s): s is SectionItem =>
      s !== null &&
      typeof s === "object" &&
      typeof (s as SectionItem).id === "string",
  );
}

// 6·7단계: no_data 가 아닌 항목은 근거(evidence_ids)가 1개 이상이어야 한다.
function checkEvidence(sections: SectionItem[]): ValidationIssue[] {
  return sections
    .filter((s) => s.status !== "no_data" && (s.evidence_ids?.length ?? 0) < 1)
    .map((s) => ({
      code: "missing_evidence",
      message: `항목 "${s.id}" 에 근거(evidence_ids)가 연결되어 있지 않습니다.`,
      path: s.id,
    }));
}

// 5단계: 일관성 계산식 포함 여부와 형식(분수식과 % 표기)
function checkFormula(payload: Record<string, unknown>): ValidationIssue[] {
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
  return [];
}

/** 세션당 모델 호출 시도 상한(성공과 실패 합산, No.89). */
export const MAX_MODEL_ATTEMPTS_PER_SESSION = 10;

/** 검증 실패 시 해당 단계 재요청에 붙일 문제 목록(No.88). */
export function buildRetryNote(issues: ValidationIssue[]): string[] {
  return issues.map((i) =>
    i.path
      ? `[${i.path}] ${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`
      : `${i.message} 이 문제를 고쳐서 다시 작성해 주세요.`,
  );
}

/** 누적 시도 횟수가 상한 미만이면 재시도 가능. */
export function canRetry(
  attemptCount: number,
  max = MAX_MODEL_ATTEMPTS_PER_SESSION,
): boolean {
  return attemptCount < max;
}
