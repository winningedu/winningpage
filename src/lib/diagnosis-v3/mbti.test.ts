import { describe, expect, test } from "vitest";
import { mbtiLinks, mbtiPage8, scoreMbti } from "./mbti.js";
import { sheetRows } from "./sheet.js";

describe("MBTI scores (19_MBTI데이터, spec row 111)", () => {
  test("PDF p8 ESTJ: 93 people, 4.6%, top factor 수업태도 (2)", () => {
    expect(scoreMbti("ESTJ")).toEqual({
      type: "ESTJ",
      sampleN: 93,
      sharePct: 4.6,
      topFactors: [2],
      smallSample: false,
    });
  });

  test("ties keep every maximum factor", () => {
    expect(scoreMbti("ISTP")?.topFactors).toEqual([2, 5]);
    expect(scoreMbti("ESTP")?.topFactors).toEqual([2, 5]);
    expect(scoreMbti("ENFP")?.topFactors).toEqual([5]);
  });

  test("a sample under 60 is flagged: INTJ 39, INFJ 47, ENTJ 38", () => {
    expect(scoreMbti("INTJ")).toMatchObject({ sampleN: 39, smallSample: true });
    expect(scoreMbti("INFJ")?.smallSample).toBe(true);
    expect(scoreMbti("ENTJ")?.smallSample).toBe(true);
    expect(scoreMbti("INFP")?.smallSample).toBe(false);
  });

  test("NONE and no answer give no MBTI block", () => {
    expect(scoreMbti("NONE")).toBeNull();
    expect(scoreMbti(undefined)).toBeNull();
  });

  test("the shares are n / 2,042 to one decimal", () => {
    expect(scoreMbti("ENFP")?.sharePct).toBe(15.8);
    expect(scoreMbti("ESFP")?.sharePct).toBe(15.1);
    expect(scoreMbti("ENTJ")?.sharePct).toBe(1.9);
  });
});

describe("links to the diagnosis scores (22 r82, 14 MBTI_LINK_*)", () => {
  const scores = (plan: number, recv: number, patt: number) => ({
    P1_PLAN: plan,
    MIND_RECV: recv,
    P1_PATT: patt,
  });

  test("PDF p8 ESTJ with 계획 수립 65 and 패턴 분석 74: J low, T high", () => {
    expect(mbtiLinks("ESTJ", scores(65, 50, 74))).toEqual([
      { id: "MBTI_LINK_J_LOW", score: 65 },
      { id: "MBTI_LINK_T_HIGH", score: 74 },
    ]);
  });

  test("P and F types use 계획 수립 and 불안 회복: ENFP", () => {
    expect(mbtiLinks("ENFP", scores(70, 59, 0))).toEqual([
      { id: "MBTI_LINK_P_HIGH", score: 70 },
      { id: "MBTI_LINK_F_LOW", score: 59 },
    ]);
    expect(mbtiLinks("ENFP", scores(69, 60, 0))).toEqual([
      { id: "MBTI_LINK_P_LOW", score: 69 },
      { id: "MBTI_LINK_F_HIGH", score: 60 },
    ]);
  });

  test("T switches at 패턴 분석 70", () => {
    expect(mbtiLinks("ISTJ", scores(0, 0, 69))[1]?.id).toBe("MBTI_LINK_T_LOW");
    expect(mbtiLinks("ISTJ", scores(0, 0, 70))[1]?.id).toBe("MBTI_LINK_T_HIGH");
  });

  test("the thresholds are the ones in 22 r82", () => {
    const cell = String(
      sheetRows("22_리포트요소").find((row) => row.r === 82)?.c[3],
    );
    expect(cell).toContain("계획 수립 70 기준");
    expect(cell).toContain("불안\u00b7회복 60 기준");
    expect(cell).toContain("패턴 분석 70 기준");
  });
});

describe("page 8 text (22 r79-r84)", () => {
  const links = { P1_PLAN: 65, MIND_RECV: 50, P1_PATT: 74 };

  test("PDF p8 ESTJ card, poles, factor line, habit and links", () => {
    const page = mbtiPage8("ESTJ", links);
    expect(page.mbti.kind).toBe("type");
    if (page.mbti.kind !== "type") return;
    expect(page.mbti.card).toEqual({
      type: "ESTJ",
      nick: "공부 총괄 매니저",
      style: "실용성을 중시하고 활동을 조직해 이끌어 가는 것을 좋아하는 편",
      share: "연구 대상 고1 2,042명 중 93명 (4.6%)",
    });
    expect(page.mbti.poles.map((p) => p.letter)).toEqual(["E", "S", "T", "J"]);
    expect(page.mbti.poles[0]).toEqual({
      letter: "E",
      name: "외향형 공부 습관",
      habit:
        "어려우면 주변에 물어 빠르게 해결하고, 다양한 공부법을 시도해 보는 편",
      tip: "친구에게 설명하며 복습하기. 단, 공부법을 자주 갈아타지 않기",
    });
    // 22 r81 mbti.top: the tied factor names stay a list, the layout joins them
    expect(page.mbti.factors.lead).toBe("ESTJ 상위권의 차별 포인트: ");
    expect(page.mbti.factors.names).toEqual(["수업태도\u00b7학습행동"]);
    expect(page.mbti.factors.habits).toEqual([
      "수업 전 교재\u00b7필기구를 미리 챙기고 수업에 집중하기",
    ]);
    expect(page.mbti.factors.smallSample).toBeUndefined();
    expect(page.mbti.links).toEqual([
      "J형인데 계획 수립 65점: 계획 성향은 있지만 일정이 겹칠 때 무너지는 패턴이에요. 복구 규칙이 열쇠예요.",
      "T형 + 패턴 분석 74점: 유형의 강점이 그대로 드러나요. 분석한 결과를 다음 주 계획에 바로 반영해 보세요.",
    ]);
    expect(page.disclaimer).toBe(
      "MBTI는 진단 도구가 아닌 선호 경향이며, 다시 검사하면 유형이 바뀌는 경우가 적지 않습니다. 이 내용은 진단 점수에 반영하지 않습니다.",
    );
  });

  test("a small sample adds MBTI_SMALLN, a tie lists every factor", () => {
    const small = mbtiPage8("INTJ", links);
    if (small.mbti.kind !== "type") throw new Error("expected type");
    expect(small.mbti.factors.smallSample).toBe(
      "이 유형은 연구 표본이 적어 차이가 덜 드러났을 수 있어요.",
    );
    const tie = mbtiPage8("ISTP", links);
    if (tie.mbti.kind !== "type") throw new Error("expected type");
    expect(tie.mbti.factors.habits).toHaveLength(2);
    expect(tie.mbti.factors.names).toHaveLength(2);
  });

  test("NONE shows MBTI_NONE and the five common habits", () => {
    const page = mbtiPage8("NONE", links);
    if (page.mbti.kind !== "none") throw new Error("expected none");
    expect(page.mbti.text).toContain("MBTI를 입력하지 않아");
    expect(page.mbti.habits).toHaveLength(5);
    expect(page.disclaimer).toContain("선호 경향");
    expect(mbtiPage8(undefined, links).mbti.kind).toBe("none");
  });
});
