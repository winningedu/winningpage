// 수행평가 지식 DB 하이브리드 검색의 단어 검색 질의(PGroonga &@~ 문법)를 만든다.
//
// 재료는 과목(원문과 정규화 교과군), 진로, 선택 또는 이전 주제다. 안내문 전문은 넣지 않는다.
// 너무 길고, 공백이 AND 로 읽혀 질의가 거의 아무 행에도 걸리지 않게 되기 때문이다.
// 토큰마다 따옴표로 감싸 OR 로 잇는다. 따옴표 안에서는 공백과 괄호, OR, -, +, * 가
// 연산자가 아니라 글자로 읽힌다.

/** 글자와 숫자가 아닌 문자(공백, 문장부호, 슬래시, 하이픈 등)에서 토큰을 나눈다. */
const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/u;

/** 바이그램 인덱스는 1글자 질의를 잘 거르지 못하므로 2글자 이상만 쓴다. */
const MIN_TOKEN_LENGTH = 2;

/** OR 항 상한. 주제가 길어도 질의가 과목과 진로 쪽 토큰을 밀어내지 않게 앞에서 자른다. */
export const KEYWORD_TOKEN_LIMIT = 12;

/**
 * 과목, 정규화 교과군, 진로, 주제 순으로 토큰을 모아 `"토큰" OR "토큰"` 질의를 만든다.
 * 쓸 토큰이 없으면 빈 문자열이고, RPC 는 이때 단어 검색을 0행으로 둔다.
 */
export function buildKnowledgeKeywordQuery({
  subject,
  normalizedSubject,
  career,
  selectedTopic,
}: {
  subject?: string | undefined;
  normalizedSubject?: string | undefined;
  career?: string | undefined;
  selectedTopic?: string | undefined;
}): string {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const value of [subject, normalizedSubject, career, selectedTopic]) {
    for (const token of String(value ?? "").split(TOKEN_SEPARATOR)) {
      if ([...token].length < MIN_TOKEN_LENGTH) continue;
      // 인덱스 normalizer(NFKC)가 대소문자를 맞추므로 중복 판정도 소문자로 한다.
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(token);
    }
  }

  return tokens
    .slice(0, KEYWORD_TOKEN_LIMIT)
    .map((token) => `"${token}"`)
    .join(" OR ");
}
