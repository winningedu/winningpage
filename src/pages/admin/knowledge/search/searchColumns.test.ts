import { describe, expect, it } from "vitest";

import { searchColumnsFor } from "./searchColumns";

describe("searchColumnsFor", () => {
  it("벡터 결과는 뜻 검색 열만 7개를 둔다", () => {
    expect(searchColumnsFor("vector").map((c) => c.label)).toEqual([
      "순위",
      "자료명",
      "학년",
      "교과군",
      "유사도",
      "threshold",
      "실제 주입",
    ]);
  });

  it("하이브리드 결과는 유사도 뒤에 뜻, 단어 순위와 RRF 점수 열을 더해 9개를 둔다", () => {
    expect(searchColumnsFor("hybrid").map((c) => c.label)).toEqual([
      "순위",
      "자료명",
      "학년",
      "교과군",
      "유사도",
      "뜻, 단어 순위",
      "RRF 점수",
      "threshold",
      "실제 주입",
    ]);
  });

  it("같은 모드면 같은 상수 배열을 돌려준다", () => {
    expect(searchColumnsFor("hybrid")).toBe(searchColumnsFor("hybrid"));
  });
});
