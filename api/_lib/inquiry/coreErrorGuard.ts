// 핵심 오류 가드. 모델이 인과 부정 문장을 correlation_as_cause 로 오판한 것을 앱이 걸러낸다.
import type { CoreErrorId } from "./types.js";

const stripSpaces = (v: string): string => v.replace(/\s+/g, "");

/**
 * 인과 부정 표현 패턴(공백 제거 기준). 보수적으로 둔다: 인과를 직접 부정하는 표현만 받고,
 * 놓치면 모델 판정이 그대로 남는 쪽(오류 유지)이 억울하게 오류가 지워지는 쪽보다 안전하다.
 */
export const CAUSAL_DENIAL_PATTERNS: readonly RegExp[] = [
  /인과(관계|성)?(는|가|라고|이라고|로)?아니/,
  /인과(관계|성)?(라고|로|이라고)?(할|볼|단정할|말할|결론내릴)수(는|도)?없/,
  /인과(관계|성)?(를|로)?(보인|보여준|보여주는|뜻하는|의미하는|나타내는|증명하는|입증하는)것(은|이)?아니/,
  /인과(관계|성)?(를|로)?(뜻하|의미하|보여주|나타내|증명하|입증하|보이)지(는|도)?않/,
  /인과(관계|성)?(로|라고)?(단정|확정|해석|결론)(할수(는)?없|하지(는)?않|하기(는)?어렵)/,
  /상관(관계)?(과|와)인과(관계|성)?(를|은|는|을)?(구분|구별)/,
  /원인(이라고|으로|이라)?(단정|확정|결론)(할수(는)?없|하지(는)?않|하기(는)?어렵)/,
];

/** 패턴 1~5 는 바로 뒤에 이 말이 이어지면 이중 부정이라 단정으로 본다. */
const DOUBLE_NEGATION_TAILS = [
  "라고할수없",
  "라고볼수없",
  "다고할수없",
  "다고는할수없",
  "고는할수없",
  "라고는할수없",
  "다고볼수없",
];
const DOUBLE_NEGATION_CHECKED_UNTIL = 5;

/** 문장이 상관과 인과를 구분해 인과가 아니라고 밝히는 문장이면 true. */
export function isCausalDenial(text: string): boolean {
  const compact = stripSpaces(text);
  return CAUSAL_DENIAL_PATTERNS.some((pattern, index) => {
    const global = new RegExp(pattern.source, "g");
    for (const m of compact.matchAll(global)) {
      if (index >= DOUBLE_NEGATION_CHECKED_UNTIL) return true;
      const rest = compact.slice(m.index + m[0].length);
      if (!DOUBLE_NEGATION_TAILS.some((tail) => rest.startsWith(tail))) {
        return true;
      }
    }
    return false;
  });
}

/** correlation_as_cause 중 인용 문장이 인과 부정인 것만 목록에서 뺀다. 순서는 유지한다. */
export function dropDeniedCausalErrors<
  T extends { id: CoreErrorId; quote: string },
>(coreErrors: readonly T[]): T[] {
  return coreErrors.filter(
    (e) => !(e.id === "correlation_as_cause" && isCausalDenial(e.quote)),
  );
}
