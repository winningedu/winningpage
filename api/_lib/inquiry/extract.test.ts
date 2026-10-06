// 확정 적립 7항목 추출과 검증 테스트(명세 No.104, 173, 174).
import { describe, expect, it } from "vitest";
import { MAX_EXTRACTED_NUMBERS } from "./constants.js";
import {
  extractActivityFields,
  firstItem,
  firstParagraph,
  sentencesWithNumbers,
  sourceLines,
  validateFinalFields,
} from "./extract.js";
import type { SubmissionSections } from "./types.js";

const sections = (
  over: Partial<SubmissionSections> = {},
): SubmissionSections => ({
  I: "",
  II: "",
  III: "",
  IV: "",
  V: "",
  VI: "",
  VII: "",
  VIII: "",
  ...over,
});

describe("firstParagraph", () => {
  it("빈 줄 앞의 첫 문단을 돌려준다", () => {
    expect(firstParagraph("첫 줄\n둘째 줄\n\n다음 문단")).toBe(
      "첫 줄\n둘째 줄",
    );
  });

  it("빈 줄이 없으면 전체를 trim 해서 돌려준다", () => {
    expect(firstParagraph("  하나뿐인 문단\n이어짐  ")).toBe(
      "하나뿐인 문단\n이어짐",
    );
  });

  it("앞쪽 빈 줄은 건너뛰고 공백뿐이면 빈 문자열", () => {
    expect(firstParagraph("\n\n  본문\n\n뒤")).toBe("본문");
    expect(firstParagraph("   \n\n  ")).toBe("");
    expect(firstParagraph("")).toBe("");
  });

  it("공백이 든 빈 줄도 문단 경계로 본다", () => {
    expect(firstParagraph("가\n   \n나")).toBe("가");
  });
});

describe("firstItem (No.104, 174)", () => {
  it("여러 줄이면 첫 줄이고 앞의 번호와 기호를 걷어 낸다", () => {
    expect(firstItem("1. 표본이 작다.\n2. 기간이 짧다.")).toBe("표본이 작다.");
    expect(firstItem("- 표본이 작다.\n- 기간이 짧다.")).toBe("표본이 작다.");
    expect(firstItem("1) 표본이 작다.\n2) 기간")).toBe("표본이 작다.");
    const dot = String.fromCharCode(0xb7);
    expect(firstItem(`${dot} 표본이 작다.\n${dot} 기간`)).toBe("표본이 작다.");
  });

  it("앞쪽 빈 줄과 기호만 있는 줄은 건너뛴다", () => {
    expect(firstItem("\n\n-\n  - 표본이 작다.\n둘째")).toBe("표본이 작다.");
  });

  it("한 줄뿐이면 다. 로 끝나는 첫 문장만 쓴다", () => {
    expect(firstItem("표본이 작다. 기간도 짧다. 그래서 일반화 어렵다.")).toBe(
      "표본이 작다.",
    );
  });

  it("한 줄이고 다. 가 없으면 그 줄 전체", () => {
    expect(firstItem("표본이 작음")).toBe("표본이 작음");
  });

  it("숫자로 시작하는 본문은 번호로 오인해 지우지 않는다", () => {
    expect(firstItem("3.5% 늘었다는 점이 한계다.\n둘째")).toBe(
      "3.5% 늘었다는 점이 한계다.",
    );
  });

  it("비어 있으면 빈 문자열", () => {
    expect(firstItem("")).toBe("");
    expect(firstItem("  \n  ")).toBe("");
  });
});

describe("sentencesWithNumbers (No.104)", () => {
  it("아라비아 숫자가 든 문장만 문장 단위로 뽑는다", () => {
    const text = "표본은 30명이었다. 숫자 없는 문장. 정답률은 87.5%였다! 끝?";
    expect(sentencesWithNumbers(text)).toEqual([
      "표본은 30명이었다.",
      "정답률은 87.5%였다!",
    ]);
  });

  it("줄바꿈도 경계이고 소수점은 문장 끝으로 보지 않는다", () => {
    expect(sentencesWithNumbers("평균 3.5점\n표는 아래\n최대 10")).toEqual([
      "평균 3.5점",
      "최대 10",
    ]);
  });

  it("한글 숫자만 있으면 뽑지 않는다", () => {
    expect(sentencesWithNumbers("삼십 명이었다.")).toEqual([]);
  });

  it("상한을 넘기면 앞에서부터 자른다", () => {
    const text = Array.from(
      { length: MAX_EXTRACTED_NUMBERS + 3 },
      (_, i) => `값 ${i}.`,
    ).join(" ");
    const out = sentencesWithNumbers(text);
    expect(out).toHaveLength(MAX_EXTRACTED_NUMBERS);
    expect(out[0]).toBe("값 0.");
  });

  it("빈 입력은 빈 배열", () => {
    expect(sentencesWithNumbers("")).toEqual([]);
    expect(sentencesWithNumbers("   \n ")).toEqual([]);
  });
});

describe("sourceLines", () => {
  it("비어 있지 않은 줄만 trim 해서 돌려준다", () => {
    expect(sourceLines(" 통계청 자료 \n\n   \n교육부 보고서\n")).toEqual([
      "통계청 자료",
      "교육부 보고서",
    ]);
    expect(sourceLines("")).toEqual([]);
  });
});

describe("extractActivityFields (No.104, 173)", () => {
  it("절에서 7항목을 뽑는다", () => {
    const { fields, missing } = extractActivityFields({
      topicTitle: " 수질 지표 재검토 ",
      concepts: ["pH", " 용존산소 ", "", "탁도"],
      sections: sections({
        III: "설문과 측정을 했다.\n두 번째 줄\n\n뒤 문단",
        IV: "평균 12.3 이었다.\n\n뒤",
        V: "표본 40명 기준이다. 해석은 이렇다.",
        VI: "1. 표본이 작다.\n2. 기간이 짧다.",
        VIII: "통계청\n\n환경부",
      }),
    });
    expect(fields).toEqual({
      topic: "수질 지표 재검토",
      concept: "pH, 용존산소, 탁도",
      method: "설문과 측정을 했다.\n두 번째 줄",
      result: "평균 12.3 이었다.",
      limitation: "표본이 작다.",
      numbers: ["평균 12.3 이었다.", "표본 40명 기준이다."],
      sources: ["통계청", "환경부"],
    });
    expect(missing).toEqual([]);
  });

  it("빈 텍스트 항목은 missing 에 넣고 numbers 와 sources 는 비어도 넣지 않는다", () => {
    const { fields, missing } = extractActivityFields({
      topicTitle: "제목",
      concepts: [],
      sections: sections(),
    });
    expect(fields.numbers).toEqual([]);
    expect(fields.sources).toEqual([]);
    expect(missing).toEqual(["concept", "method", "result", "limitation"]);
  });

  it("주제 제목이 비어도 missing 으로 알린다", () => {
    const { missing } = extractActivityFields({
      topicTitle: "  ",
      concepts: ["a"],
      sections: sections({ III: "m", IV: "r", VI: "l" }),
    });
    expect(missing).toEqual(["topic"]);
  });

  it("numbers 는 Ⅳ 먼저 Ⅴ 다음 순서로 합치고 합쳐도 상한을 지킨다", () => {
    const many = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix} ${i}.`).join(" ");
    const { fields } = extractActivityFields({
      topicTitle: "t",
      concepts: ["c"],
      sections: sections({ IV: many("가", 7), V: many("나", 7) }),
    });
    expect(fields.numbers).toHaveLength(MAX_EXTRACTED_NUMBERS);
    expect(fields.numbers[0]).toBe("가 0.");
    expect(fields.numbers[7]).toBe("나 0.");
  });
});

describe("validateFinalFields (No.104, 174)", () => {
  const valid = {
    topic: "주제",
    concept: "개념",
    method: "방법",
    result: "결과",
    limitation: "한계",
    numbers: ["12명"],
    sources: ["통계청"],
  };

  it("7항목이 맞으면 trim 한 값으로 통과한다", () => {
    expect(validateFinalFields({ ...valid, topic: "  주제 " })).toEqual({
      ok: true,
      fields: valid,
    });
  });

  it("numbers 와 sources 가 없으면 빈 배열", () => {
    const { numbers: _n, sources: _s, ...rest } = valid;
    expect(validateFinalFields(rest)).toEqual({
      ok: true,
      fields: { ...rest, numbers: [], sources: [] },
    });
  });

  it("text 항목이 비었거나 공백이거나 문자열이 아니면 missing 으로 모두 알린다", () => {
    expect(
      validateFinalFields({ ...valid, limitation: "  ", method: 3, topic: "" }),
    ).toEqual({ ok: false, missing: ["topic", "method", "limitation"] });
  });

  it("numbers 가 배열이 아니거나 문자열 아닌 원소가 있으면 missing", () => {
    expect(validateFinalFields({ ...valid, numbers: "12" })).toEqual({
      ok: false,
      missing: ["numbers"],
    });
    expect(validateFinalFields({ ...valid, sources: ["a", 1] })).toEqual({
      ok: false,
      missing: ["sources"],
    });
  });

  it("배열 안의 빈 문자열은 버린다", () => {
    const result = validateFinalFields({
      ...valid,
      numbers: [" ", "3개"],
      sources: [""],
    });
    expect(result).toEqual({
      ok: true,
      fields: { ...valid, numbers: ["3개"], sources: [] },
    });
  });

  it("객체가 아니면 text 5항목 전부 missing", () => {
    const expected = {
      ok: false,
      missing: ["topic", "concept", "method", "result", "limitation"],
    };
    expect(validateFinalFields(null)).toEqual(expected);
    expect(validateFinalFields("x")).toEqual(expected);
    expect(validateFinalFields([])).toEqual(expected);
  });
});
