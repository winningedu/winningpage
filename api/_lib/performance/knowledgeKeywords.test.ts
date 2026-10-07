import { describe, expect, it } from "vitest";
import { buildKnowledgeKeywordQuery } from "./knowledgeKeywords.js";

describe("buildKnowledgeKeywordQuery", () => {
  it("과목, 정규화 교과군, 진로를 따옴표로 감싼 OR 질의로 만든다", () => {
    expect(
      buildKnowledgeKeywordQuery({
        subject: "물리학Ⅰ",
        normalizedSubject: "과학",
        career: "의학",
        selectedTopic: "",
      }),
    ).toBe('"물리학Ⅰ" OR "과학" OR "의학"');
  });

  it("주제와 진로는 글자와 숫자가 아닌 문자에서 나누고 1글자 토큰과 중복을 버린다", () => {
    expect(
      buildKnowledgeKeywordQuery({
        subject: "과학",
        normalizedSubject: "과학",
        career: "의학 / 생명과학",
        selectedTopic: "항생제 내성, 그 원인과 mRNA-LNP 백신 및 의학",
      }),
    ).toBe(
      '"과학" OR "의학" OR "생명과학" OR "항생제" OR "내성" OR "원인과" OR "mRNA" OR "LNP" OR "백신"',
    );
  });

  it("토큰은 앞에서부터 12개까지만 쓴다", () => {
    const topic = Array.from({ length: 20 }, (_, i) => `주제${i}`).join(" ");
    const query = buildKnowledgeKeywordQuery({
      subject: "국어",
      normalizedSubject: "국어",
      career: "교사",
      selectedTopic: topic,
    });
    const terms = query.split(" OR ");
    expect(terms).toHaveLength(12);
    expect(terms.slice(0, 3)).toEqual(['"국어"', '"교사"', '"주제0"']);
    expect(terms.at(-1)).toBe('"주제9"');
  });

  it("질의 문법의 특수문자는 남기지 않고 OR 같은 연산자 단어도 따옴표 안 글자로 둔다", () => {
    expect(
      buildKnowledgeKeywordQuery({
        selectedTopic: 'AI OR "윤리" (책임) -편향 +공정 데이터* \\경계',
      }),
    ).toBe(
      '"AI" OR "OR" OR "윤리" OR "책임" OR "편향" OR "공정" OR "데이터" OR "경계"',
    );
  });

  it("쓸 토큰이 없으면 빈 문자열이다", () => {
    expect(buildKnowledgeKeywordQuery({})).toBe("");
    expect(
      buildKnowledgeKeywordQuery({
        subject: " ",
        normalizedSubject: "",
        career: "가 / 나",
        selectedTopic: "-- () *",
      }),
    ).toBe("");
  });
});
