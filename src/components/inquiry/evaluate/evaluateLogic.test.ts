import { describe, expect, test } from "vitest";
import type { RubricItemResult } from "@/lib/inquiry/types";
import {
  buildChecklistSummary,
  buildCoreErrorRows,
  buildFixRows,
  buildPlaceholderLines,
  buildRubricRows,
  buildSourceRows,
  levelTone,
  remainingReevaluations,
  summaryLine,
} from "./evaluateLogic";

function item(over: Partial<RubricItemResult> = {}): RubricItemResult {
  return {
    id: "method",
    level: 3,
    score: 18.8,
    met: ["a", "b", "c"],
    unmet: ["규모 보정 과정이 한 줄뿐"],
    evidence: "근거",
    capReason: null,
    ...over,
  };
}

describe("summaryLine", () => {
  test("핵심 오류가 있으면 총점과 관계없이 고치라고 안내한다", () => {
    expect(summaryLine(2)).toBe(
      "핵심 오류 2건이 있어요. 총점과 관계없이 제출 전에 반드시 고쳐야 해요",
    );
  });
  test("핵심 오류가 없으면 보완 후 제출 가능 안내와 내부 기준 고지", () => {
    expect(summaryLine(0)).toBe(
      "핵심 오류가 없어요. 먼저 고칠 것을 보완하면 제출할 수 있어요. 점수는 서비스 내부 기준이에요",
    );
  });
});

describe("levelTone", () => {
  test("수준 4는 good, 3은 mid, 2 이하는 low", () => {
    expect(levelTone(4)).toBe("good");
    expect(levelTone(3)).toBe("mid");
    expect(levelTone(2)).toBe("low");
    expect(levelTone(0)).toBe("low");
  });
});

describe("buildRubricRows", () => {
  test("항목명, 점수 / 배점, 수준 문구를 만든다", () => {
    const [row] = buildRubricRows([item()]);
    expect(row?.label).toBe("탐구 방법과 학생의 분석");
    expect(row?.scoreText).toBe("18.8 / 25");
    expect(row?.levelText).toBe("수준 3");
    expect(row?.tone).toBe("mid");
  });
  test("미충족이 없으면 요건 모두 충족, 있으면 미충족 목록", () => {
    const rows = buildRubricRows([
      item({ unmet: [], met: ["a", "b", "c", "d"], level: 4, score: 25 }),
      item(),
    ]);
    expect(rows[0]?.metText).toBe("요건 4개 모두 충족");
    expect(rows[1]?.metText).toBe("미충족: 규모 보정 과정이 한 줄뿐");
  });
  test("상한 사유를 그대로 싣고 없으면 null", () => {
    const rows = buildRubricRows([
      item({ capReason: "핵심 오류로 수준 2 이하로 제한" }),
      item(),
    ]);
    expect(rows[0]?.capReason).toBe("핵심 오류로 수준 2 이하로 제한");
    expect(rows[1]?.capReason).toBeNull();
  });
  test("점수 소수는 한 자리까지만 보이고 정수는 그대로", () => {
    expect(buildRubricRows([item({ score: 20 })])[0]?.scoreText).toBe(
      "20 / 25",
    );
  });
});

describe("buildFixRows", () => {
  test("위치를 절 이름 앞부분으로 바꾼다", () => {
    const [row] = buildFixRows([
      {
        location: "III",
        problem: "p",
        impact: "i",
        action: "a",
        check: "c",
      },
    ]);
    expect(row).toEqual({
      location: "Ⅲ절",
      problem: "p",
      impact: "i",
      action: "a",
      check: "c",
    });
  });
});

describe("buildChecklistSummary", () => {
  test("충족 수와 미충족 이름을 센다", () => {
    const list = Array.from({ length: 13 }, (_, i) => ({
      id: `c${String(i + 1).padStart(2, "0")}`,
      met: i !== 11,
    }));
    const s = buildChecklistSummary(list);
    expect(s.metCount).toBe(12);
    expect(s.total).toBe(13);
    expect(s.unmetNames).toEqual(["한계 두 가지 이상"]);
  });
});

describe("buildSourceRows", () => {
  test("사용자 제공 미확인은 직접 확인 안내를 붙인다", () => {
    const rows = buildSourceRows([
      { text: "자료 A", status: "supplied_unverified" },
      { text: "자료 B", status: "search_target" },
    ]);
    expect(rows[0]).toEqual({
      text: "자료 A",
      statusLabel: "사용자 제공 미확인",
      note: "직접 확인해 주세요",
    });
    expect(rows[1]?.note).toBeNull();
    expect(rows[1]?.statusLabel).toBe("검색 예정");
  });
});

describe("buildPlaceholderLines", () => {
  test("개수가 있는 절만 절 순서대로 한 줄씩", () => {
    expect(buildPlaceholderLines({ IV: 2, I: 1, II: 0 })).toEqual([
      "Ⅰ절 탐구 동기 1개",
      "Ⅳ절 탐구 결과 2개",
    ]);
    expect(buildPlaceholderLines({})).toEqual([]);
  });
});

describe("remainingReevaluations", () => {
  test("첫 평가 뒤 3회, 상한이면 0", () => {
    expect(remainingReevaluations(1)).toBe(3);
    expect(remainingReevaluations(3)).toBe(1);
    expect(remainingReevaluations(4)).toBe(0);
    expect(remainingReevaluations(9)).toBe(0);
  });
});

describe("buildCoreErrorRows", () => {
  test("라벨과 위치 절 이름을 붙인다", () => {
    const [row] = buildCoreErrorRows([
      { id: "overclaim", location: "V", detail: "d", effect: "e" },
    ]);
    expect(row).toMatchObject({
      label: "증거를 넘어선 단정이 있어요",
      location: "Ⅴ절 해석",
      detail: "d",
      effect: "e",
    });
  });
});
