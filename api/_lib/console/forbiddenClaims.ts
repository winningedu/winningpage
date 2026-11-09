// 금지 표현 검사(교 #140, 결정 106 7번). 자동 생성 문장에 합격을 단정하는 표현이 없는지 테스트에서 본다.
// 화면에서 글을 막지는 않는다. 문구를 더하려면 아래 목록에 한 줄을 넣는다.
// 공개 진단 사이트의 목록(src/data/diagnosisCopy.ts)은 "100%"와 "1위"까지 막아 콘솔 문구와 맞지 않아 따로 둔다.

const FORBIDDEN: (string | RegExp)[] = [
  "합격 보장",
  "반드시 합격",
  "확실히 붙",
  "합격이 확실",
  "합격 확정",
  "합격할 것입니다",
  "합격합니다",
  "100% 합격",
  "합격을 보장",
  /합격\s*가능성이?\s*(?:높|크|큰)/,
  /합격\s*(?:할|될)\s*수\s*있습니다/,
  // 확률 수치를 서술문으로 단정하는 말투. 디자인 칩 "이상 가나대 경영학과 34%"는 걸리지 않는다.
  /확률(?:은|이|를|을)?\s*\d+(?:\.\d+)?\s*%\s*(?:입니다|이므로|이라서|이기 때문|예요|이에요|로|으로|이다)/,
];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim() !== "") out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) strings(v, out);
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) strings(v, out);
  }
  return out;
}

/** 값 안의 모든 문자열을 훑어 금지 표현이 든 문장과 걸린 표현을 돌려준다(문장마다 처음 걸린 표현 하나). */
export function findForbiddenClaims(
  value: unknown,
): { text: string; phrase: string }[] {
  const hits: { text: string; phrase: string }[] = [];
  for (const text of strings(value)) {
    for (const rule of FORBIDDEN) {
      const found =
        typeof rule === "string" ? text.includes(rule) : rule.test(text);
      if (found) {
        hits.push({ text, phrase: String(rule) });
        break;
      }
    }
  }
  return hits;
}
