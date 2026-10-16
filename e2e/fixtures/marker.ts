// E2E 가 만드는 데이터의 표지. 이 접두어로 시작하는 값만 정리 대상이다.
// 접두어 없는 행과 값은 어떤 정리 함수도 지우지 않는다.
export const E2E_PREFIX = "E2E ";

/** E2E 가 입력하는 문자열. 접두어를 붙인다. */
export function e2eText(text: string): string {
  return `${E2E_PREFIX}${text}`;
}

/** 값이 E2E 접두어로 시작하는 문자열인가. */
export function hasE2ePrefix(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(E2E_PREFIX);
}

export type StripResult = {
  cleaned: Record<string, unknown>;
  removedKeys: string[];
};

/** 조사 답 객체에서 값이 접두어로 시작하는 키만 뺀다. 다른 키와 값은 건드리지 않는다. */
export function stripE2eAnswers(answers: unknown): StripResult {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { cleaned: {}, removedKeys: [] };
  }
  const cleaned: Record<string, unknown> = {};
  const removedKeys: string[] = [];
  for (const [key, value] of Object.entries(answers)) {
    if (hasE2ePrefix(value)) removedKeys.push(key);
    else cleaned[key] = value;
  }
  return { cleaned, removedKeys };
}

const OPEN_REPORT_STATUSES = ["draft", "in_progress"];

export type ReportRow = {
  status: string;
  survey_answers: unknown;
  activity_ids: readonly string[];
};

/**
 * E2E 가 연 미완 회차인가. 열린 상태(draft, in_progress)이고, 시작 시점 답 스냅샷에 접두어 값이 있거나
 * E2E 활동 기록을 고른 회차만 해당한다.
 */
export function isE2eOpenedReport(
  report: ReportRow,
  e2eActivityIds: ReadonlySet<string>,
): boolean {
  if (!OPEN_REPORT_STATUSES.includes(report.status)) return false;
  if (stripE2eAnswers(report.survey_answers).removedKeys.length > 0)
    return true;
  return report.activity_ids.some((id) => e2eActivityIds.has(id));
}

export { OPEN_REPORT_STATUSES };

export const DEDICATED_E2E_EMAIL = "e2e-student@winning.test";

/** 공유 QA 계정(qa- 접두어 이메일)이면 경고 문구, 아니면 null. 실행을 막지는 않는다. */
export function sharedQaAccountWarning(email: string): string | null {
  if (!email.toLowerCase().startsWith("qa-")) return null;
  return `E2E_STUDENT_EMAIL 이 공유 QA 계정(${email})이다. E2E 는 전용 계정(${DEDICATED_E2E_EMAIL})으로 돌려 QA 데이터를 남기지 않는다.`;
}
