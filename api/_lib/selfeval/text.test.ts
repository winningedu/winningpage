import { describe, expect, it } from "vitest";
import {
  clicheDensity,
  containsUniversity,
  countByMode,
  countChars,
  extractKeywords,
  extractNumbers,
  fixNominalEndings,
  hasMarkdown,
  normalizeUniversity,
  splitSentences,
} from "./text.js";

describe("splitSentences", () => {
  it("마침표, 물음표, 느낌표로 자르고 앞뒤 공백을 뗀다", () => {
    expect(splitSentences("첫 문장이다. 둘째인가? 셋째다!  ")).toEqual([
      "첫 문장이다.",
      "둘째인가?",
      "셋째다!",
    ]);
  });

  it("소수점은 경계로 보지 않는다", () => {
    expect(splitSentences("상관계수는 0.71이었다. 다음이다.")).toEqual([
      "상관계수는 0.71이었다.",
      "다음이다.",
    ]);
  });

  it("따옴표와 낫표 안의 문장 부호는 경계로 보지 않는다", () => {
    expect(splitSentences('그는 "될까? 된다." 라고 썼다. 끝이다.')).toEqual([
      '그는 "될까? 된다." 라고 썼다.',
      "끝이다.",
    ]);
    expect(splitSentences("「가설이다. 검증한다.」를 읽었다.")).toEqual([
      "「가설이다. 검증한다.」를 읽었다.",
    ]);
  });

  it("빈 조각은 버리고 줄바꿈도 공백으로 본다", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("가다...\n나다.")).toEqual(["가다...", "나다."]);
  });

  it("마침표 없는 끝 문장도 한 문장으로 센다", () => {
    expect(splitSentences("하나다. 둘")).toEqual(["하나다.", "둘"]);
  });
});

describe("글자 수", () => {
  it("공백 포함은 줄바꿈까지 세고 공백 제외는 모든 공백 문자를 뺀다", () => {
    const text = "가 나\n다\t라";
    expect(countChars(text)).toEqual({ withSpace: 7, withoutSpace: 4 });
    expect(countByMode(text, "with_space")).toBe(7);
    expect(countByMode(text, "without_space")).toBe(4);
  });
});

describe("extractNumbers", () => {
  it("정수, 소수, 퍼센트, 천단위, 단위 붙은 수를 중복 없이 세지 않고 그대로 뽑는다", () => {
    expect(
      extractNumbers(
        "0.71로 계산했고 12% 늘어 1,250명이 10일 동안 3개를 봤다. 10일",
      ),
    ).toEqual(["0.71", "12%", "1,250명", "10일", "3개", "10일"]);
  });

  it("조사는 수에 붙이지 않는다", () => {
    expect(extractNumbers("상관계수는 0.71이었다")).toEqual(["0.71"]);
  });
});

describe("clicheDensity", () => {
  it("상투어 횟수를 1000자당 밀도로 환산하고 소수 둘째 자리에서 반올림한다", () => {
    const text = `${"가".repeat(300)}성실 탁월 성실`;
    const r = clicheDensity(text, "with_space");
    expect(r.hits).toEqual(["탁월", "성실", "성실"]);
    // 3 / 308 * 1000 = 9.74
    expect(r.density).toBe(9.74);
  });

  it("글자 수가 0이면 밀도 0", () => {
    expect(clicheDensity("", "with_space")).toEqual({ density: 0, hits: [] });
  });
});

describe("대학 이름", () => {
  it("normalizeUniversity 는 공백과 끝의 대학교, 대학, 대를 뗀다", () => {
    expect(normalizeUniversity("서울 대학교")).toBe("서울");
    expect(normalizeUniversity("연세대")).toBe("연세");
    expect(normalizeUniversity("한양대학")).toBe("한양");
    expect(normalizeUniversity("KAIST")).toBe("KAIST");
  });

  it("containsUniversity 는 본문(공백 제거)에 정규화한 이름이 있으면 그 이름을 돌려준다", () => {
    expect(containsUniversity("나는 서울 대학교 에 간다", ["서울대학교"])).toBe(
      "서울대학교",
    );
    expect(containsUniversity("연세 대에서", ["고려대", "연세대학교"])).toBe(
      "연세대학교",
    );
  });

  it("없거나 빈 배열이면 null", () => {
    expect(containsUniversity("본문", ["서울대학교"])).toBeNull();
    expect(containsUniversity("서울대학교", [])).toBeNull();
    expect(containsUniversity("서울", [""])).toBeNull();
  });
});

describe("extractKeywords", () => {
  it("조사를 떼고 2글자 이상만 등장 순으로 중복 없이 돌려준다", () => {
    expect(
      extractKeywords("환율은 물가를 바꾸고 환율의 변동에서 물가가 움직인다"),
    ).toEqual(["환율", "물가", "바꾸고", "변동", "움직인다"]);
  });

  it("조사를 떼고 남은 글자가 한 글자면 버린다", () => {
    expect(extractKeywords("책을 읽고 수를 센다")).toEqual(["읽고", "센다"]);
  });

  it("minLength 를 바꿀 수 있다", () => {
    expect(extractKeywords("환율은 변동성이", 3)).toEqual(["변동성"]);
  });
});

describe("hasMarkdown", () => {
  it.each([
    "# 제목",
    "- 항목",
    "* 항목",
    "1. 항목",
    "문장 **강조** 이다",
    "`코드`",
    "[링크](http://a.b)",
  ])("%s 는 마크다운이다", (t) => {
    expect(hasMarkdown(t)).toBe(true);
  });

  it("줄 중간의 하이픈과 숫자 마침표는 마크다운이 아니다", () => {
    expect(hasMarkdown("A-B 비교 결과 0.71 이었다.\n다음 줄이다.")).toBe(false);
  });

  it("두 번째 줄 머리의 목록 표시도 잡는다", () => {
    expect(hasMarkdown("첫 줄\n- 둘째 줄")).toBe(true);
  });
});

describe("fixNominalEndings", () => {
  it("못함, 함, 음 을 한 점 꼴로 바꾼다", () => {
    expect(fixNominalEndings("변수를 통제하지 못함")).toBe(
      "변수를 통제하지 못한 점",
    );
    expect(fixNominalEndings("표본을 비교함.")).toBe("표본을 비교한 점.");
    expect(fixNominalEndings("값이 일정하지 않음")).toBe(
      "값이 일정하지 않은 점",
    );
  });

  it("마음, 처음, 걸음 같은 일반 명사는 바꾸지 않는다", () => {
    expect(fixNominalEndings("마음이 처음 걸음을 뗐다")).toBe(
      "마음이 처음 걸음을 뗐다",
    );
  });

  it("없음 은 없는 점 으로, 있음 은 그대로 둔다", () => {
    expect(fixNominalEndings("오차가 없음")).toBe("오차가 없는 점");
    expect(fixNominalEndings("한계가 있음")).toBe("한계가 있음");
  });

  it("명사 포함 은 바꾸지 않는다", () => {
    expect(fixNominalEndings("범위에 포함")).toBe("범위에 포함");
  });

  it("어절 끝에서만 바꾼다", () => {
    expect(fixNominalEndings("함수를 그렸다")).toBe("함수를 그렸다");
    expect(fixNominalEndings("분석함, 정리함")).toBe("분석한 점, 정리한 점");
  });
});
