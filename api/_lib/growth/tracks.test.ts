// 성장설계 트랙 규칙 테스트(명세 No.40, 44, 45, 50, 51, 96, 98~100, 164).
// 순수 함수만 다루므로 DB/네트워크 없이 검증한다.
import { describe, expect, test } from "vitest";
import {
  analysisRange,
  capPlanItems,
  deadlineState,
  firstYearSufficiency,
  monthlyPlan,
  omittedSections,
  orderPlanPeriods,
  semesterNotice,
  sufficiency,
  sufficiencyLabel,
} from "./tracks.js";

describe("analysisRange (No.50)", () => {
  test("고1은 current 가 없으면 고1-1, 고1-2 와 안내 문구를 돌려준다", () => {
    expect(analysisRange("고1")).toEqual({
      semesters: ["고1-1", "고1-2"],
      description: "1학년 현재까지가 분석 범위예요.",
    });
  });

  test("고2는 1학년 전체와 2학년 현재까지, 시안 문구를 그대로 쓴다", () => {
    expect(analysisRange("고2")).toEqual({
      semesters: ["고1-1", "고1-2", "고2-1", "고2-2"],
      description:
        "1학년 전체와 2학년 현재까지가 분석 범위예요. 리포트는 1학년 평가, 2학년 보완 방향, 3학년 콘셉트 순으로 짜여요.",
    });
  });

  test("고3은 1, 2학년 전체와 3학년 현재까지, 실행계획 월 단위 문구를 쓴다", () => {
    expect(analysisRange("고3")).toEqual({
      semesters: ["고1-1", "고1-2", "고2-1", "고2-2", "고3-1", "고3-2"],
      description:
        "1학년과 2학년 전체, 3학년 현재까지가 분석 범위예요. 실행계획은 월 단위로 나눠요.",
    });
  });

  test.each(["졸업", "N수"] as const)(
    "%s 는 3개 학년 전체이고 로드맵 없이 진단만 나온다고 알린다",
    (t) => {
      const r = analysisRange(t);
      expect(r.semesters).toEqual([
        "고1-1",
        "고1-2",
        "고2-1",
        "고2-2",
        "고3-1",
        "고3-2",
      ]);
      expect(r.description).toContain(
        "씨앗, 꽃, 만개 로드맵 없이 진단만 나와요",
      );
    },
  );

  test("current 가 있으면 현재 학기까지만 포함한다", () => {
    expect(analysisRange("고2", { grade: 2, semester: 1 }).semesters).toEqual([
      "고1-1",
      "고1-2",
      "고2-1",
    ]);
    expect(analysisRange("고1", { grade: 1, semester: 1 }).semesters).toEqual([
      "고1-1",
    ]);
  });
});

describe("omittedSections (No.45, 50, 51)", () => {
  test("졸업과 N수는 3부 로드맵 항목 3-1~3-4 를 제외하고 사유를 채운다", () => {
    for (const t of ["졸업", "N수"] as const) {
      const r = omittedSections(t, {});
      expect(r.ids).toEqual(["3-1", "3-2", "3-3", "3-4"]);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });

  test("고1 은 3-2, 3-3 을 제외한다", () => {
    const r = omittedSections("고1", {});
    expect(r.ids).toEqual(["3-2", "3-3"]);
    expect(r.reasons.length).toBe(1);
  });

  test("1학년 자료 없이 진행하면 3-2 를 제외하고 3-1 은 유지하며 사유를 표시한다", () => {
    const r = omittedSections("고2", { noFirstYearData: true });
    expect(r.ids).toEqual(["3-2"]);
    expect(r.reasons).toContain("성장 흐름은 2학년부터");
  });

  test("제외할 것이 없으면 빈 목록이다", () => {
    expect(omittedSections("고3", {})).toEqual({ ids: [], reasons: [] });
  });

  test("고1 이면서 자료 없음이어도 id 는 중복되지 않는다", () => {
    expect(omittedSections("고1", { noFirstYearData: true }).ids).toEqual([
      "3-2",
      "3-3",
    ]);
  });
});

describe("monthlyPlan (No.50)", () => {
  test("고3 만 월 단위 실행계획이다", () => {
    expect(monthlyPlan("고3")).toBe(true);
    for (const t of ["고1", "고2", "졸업", "N수"] as const)
      expect(monthlyPlan(t)).toBe(false);
  });
});

const T = { enough: 3 };

describe("sufficiency (No.44)", () => {
  test.each([
    [0, "none", "없음"],
    [1, "insufficient", "부족"],
    [2, "insufficient", "부족"],
    [3, "enough", "있음"],
    [10, "enough", "있음"],
  ] as const)("건수 %i 는 %s(%s)", (count, level, label) => {
    expect(sufficiency(count, T)).toBe(level);
    expect(sufficiencyLabel(level)).toBe(label);
  });

  test("임계값을 인자로 받아 판정한다", () => {
    expect(sufficiency(4, { enough: 5 })).toBe("insufficient");
    expect(sufficiency(3, { enough: 5 })).toBe("insufficient");
    expect(sufficiency(5, { enough: 5 })).toBe("enough");
  });
});

describe("firstYearSufficiency (No.44)", () => {
  test("1학년 두 학기 합계로 판정한다", () => {
    expect(firstYearSufficiency({ "고1-1": 1, "고1-2": 1 }, T)).toEqual({
      count: 2,
      level: "insufficient",
      label: "부족",
    });
    expect(firstYearSufficiency({ "고1-1": 2, "고1-2": 2 }, T)).toEqual({
      count: 4,
      level: "enough",
      label: "있음",
    });
  });

  test("기록이 없으면 없음이고 다른 학년 건수는 무시한다", () => {
    expect(firstYearSufficiency({ "고2-1": 9 }, T)).toEqual({
      count: 0,
      level: "none",
      label: "없음",
    });
  });
});

describe("semesterNotice (No.40)", () => {
  test("기록 없는 학기는 업로드 권장 라벨이다", () => {
    expect(semesterNotice(0)).toBe("자료 없음, 업로드 권장");
    expect(semesterNotice(2)).toBeNull();
  });
});

type Item = {
  id: string;
  period: "course_selection" | "semester" | "vacation";
  deadline?: string | null;
  priority: "required" | "recommended";
};
const item = (
  id: string,
  period: Item["period"],
  priority: Item["priority"] = "required",
  deadline: string | null = null,
): Item => ({ id, period, priority, deadline });

describe("orderPlanPeriods (No.98, 99)", () => {
  test("과목 선택(마감 빠른 순), 남은 학기, 방학 순으로 배치한다", () => {
    const out = orderPlanPeriods([
      item("v", "vacation"),
      item("s", "semester"),
      item("c2", "course_selection", "required", "2026-11-20"),
      item("c1", "course_selection", "required", "2026-11-05"),
    ]);
    expect(out.map((i) => i.id)).toEqual(["c1", "c2", "s", "v"]);
  });

  test("같은 묶음 안에서는 required 가 recommended 보다 앞서고 나머지는 입력 순서를 지킨다", () => {
    const out = orderPlanPeriods([
      item("s1", "semester", "recommended"),
      item("s2", "semester", "required"),
      item("s3", "semester", "recommended"),
      item("s4", "semester", "required"),
    ]);
    expect(out.map((i) => i.id)).toEqual(["s2", "s4", "s1", "s3"]);
  });

  test("입력 배열을 바꾸지 않는다", () => {
    const input = [item("v", "vacation"), item("s", "semester")];
    orderPlanPeriods(input);
    expect(input.map((i) => i.id)).toEqual(["v", "s"]);
  });
});

describe("capPlanItems (No.96, 164)", () => {
  test("required 는 상위 3건만 남기고 초과분은 recommended 로 내린다", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => item(id, "semester"));
    const r = capPlanItems(items);
    expect(r.required.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(r.recommended.map((i) => i.id)).toEqual(["d", "e"]);
    expect(r.recommended.every((i) => i.priority === "recommended")).toBe(true);
    expect(r.dropped).toEqual([]);
  });

  test("recommended 도 3건 상한이고 초과분은 dropped 로 돌려준다", () => {
    const items = [
      ...["r1", "r2", "r3", "r4"].map((id) => item(id, "semester")),
      ...["x1", "x2", "x3"].map((id) => item(id, "semester", "recommended")),
    ];
    const r = capPlanItems(items);
    expect(r.required.map((i) => i.id)).toEqual(["r1", "r2", "r3"]);
    expect(r.recommended.map((i) => i.id)).toEqual(["r4", "x1", "x2"]);
    expect(r.dropped.map((i) => i.id)).toEqual(["x3"]);
  });

  test("상한 이내면 그대로 둔다", () => {
    const r = capPlanItems([
      item("a", "semester"),
      item("b", "semester", "recommended"),
    ]);
    expect(r.required.map((i) => i.id)).toEqual(["a"]);
    expect(r.recommended.map((i) => i.id)).toEqual(["b"]);
    expect(r.dropped).toEqual([]);
  });
});

describe("deadlineState (No.100)", () => {
  test("남은 일수로 D-n 라벨을 만든다", () => {
    expect(deadlineState("2026-10-11", "2026-10-06")).toEqual({
      dday: 5,
      urgent: true,
      label: "D-5",
    });
  });

  test("D-7 은 긴급이고 D-8 은 아니다", () => {
    expect(deadlineState("2026-10-13", "2026-10-06").urgent).toBe(true);
    expect(deadlineState("2026-10-14", "2026-10-06")).toMatchObject({
      dday: 8,
      urgent: false,
    });
  });

  test("당일은 D-0 이고 지난 마감은 D+n 이며 둘 다 긴급이다", () => {
    expect(deadlineState("2026-10-06", "2026-10-06")).toEqual({
      dday: 0,
      urgent: true,
      label: "D-0",
    });
    expect(deadlineState("2026-10-04", "2026-10-06")).toEqual({
      dday: -2,
      urgent: true,
      label: "D+2",
    });
  });

  test("마감이 없으면 전부 null 이다", () => {
    expect(deadlineState(null, "2026-10-06")).toEqual({
      dday: null,
      urgent: false,
      label: null,
    });
  });
});
