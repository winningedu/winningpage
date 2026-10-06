// 목표 등급 역산과 입결 대비 테스트(명세 No.80·81·156·157, 시안 1-14·3-10).
import { describe, expect, test } from "vitest";
import {
  ADMISSION_DISCLAIMER,
  backsolveTarget,
  compareWithAdmission,
  targetScheduleRows,
} from "./targetGrade.js";

describe("compareWithAdmission", () => {
  test("입결 2개년 중 최신 연도 컷을 고르고 추정이 컷 이하면 within 이다", () => {
    const r = compareWithAdmission({
      estimate: 2.3,
      cuts: [
        { year: 2024, grade: 2.1 },
        { year: 2025, grade: 2.46 },
      ],
    });
    expect(r.latest).toBe(2.46);
    expect(r.diff).toBe(-0.16);
    expect(r.diffText).toBe("-0.16등급");
    expect(r.status).toBe("within");
  });

  test("추정이 컷보다 높으면 gap 이고 양수 텍스트를 쓴다", () => {
    const r = compareWithAdmission({
      estimate: 3.6,
      cuts: [{ year: 2025, grade: 2.46 }],
    });
    expect(r.diff).toBe(1.14);
    expect(r.diffText).toBe("1.14등급");
    expect(r.status).toBe("gap");
  });

  test("입결이 비었거나 전부 null 이면 no_data 이고 텍스트가 없다", () => {
    for (const cuts of [[], [{ year: 2025, grade: null }]]) {
      const r = compareWithAdmission({ estimate: 2.3, cuts });
      expect(r).toEqual({
        latest: null,
        diff: null,
        diffText: null,
        status: "no_data",
      });
    }
  });

  test("estimate 가 null 이면 no_data 이다", () => {
    const r = compareWithAdmission({
      estimate: null,
      cuts: [{ year: 2025, grade: 2.46 }],
    });
    expect(r.status).toBe("no_data");
    expect(r.diffText).toBeNull();
  });
});

describe("ADMISSION_DISCLAIMER", () => {
  test("고정 고지 문구를 노출한다", () => {
    expect(ADMISSION_DISCLAIMER).toBe(
      "입결은 참고 자료이며 합격 가능성을 뜻하지 않아요.",
    );
  });
});

const done4 = ["1-1", "1-2", "2-1", "2-2"].map((key) => ({
  key,
  average: 2.3,
}));
const left2 = [{ key: "3-1" }, { key: "3-2" }];

describe("backsolveTarget", () => {
  test("완료 4학기 평균 2.3 동일 가중, 남은 2학기, 목표 2.18 이면 1.94 등급이 필요하다", () => {
    const r = backsolveTarget({
      system: "five",
      completed: done4,
      remainingSemesters: left2,
      targetCut: 2.18,
    });
    expect(r.requiredAverage).toBe(1.94);
    expect(r.reachable).toBe(true);
    expect(r.status).toBe("ok");
    expect(r.basis).toContain("1.94등급");
  });

  test("units 가 있으면 이수 단위로 가중한다", () => {
    const r = backsolveTarget({
      system: "five",
      completed: [
        { key: "1-1", average: 2.0, units: 4 },
        { key: "1-2", average: 3.0, units: 2 },
      ],
      remainingSemesters: [{ key: "2-1", units: 3 }],
      targetCut: 2.4,
    });
    // (2.4*9 - (8+6)) / 3 = 2.5333
    expect(r.requiredAverage).toBe(2.53);
  });

  test("countedSemesters 가 있으면 그 학기만 반영한다", () => {
    const completed = [
      { key: "1-1", average: 3.0 },
      { key: "1-2", average: 3.0 },
      { key: "2-1", average: 2.0 },
      { key: "2-2", average: 2.0 },
    ];
    const r = backsolveTarget({
      system: "five",
      completed,
      remainingSemesters: left2,
      targetCut: 2.0,
      countedSemesters: ["2-1", "2-2", "3-1", "3-2"],
    });
    // (2.0*4 - 4) / 2 = 2.0
    expect(r.requiredAverage).toBe(2);
  });

  test("남은 학기가 0개이고 현재 평균이 목표 이하면 already_met 이다", () => {
    const r = backsolveTarget({
      system: "five",
      completed: done4,
      remainingSemesters: [],
      targetCut: 2.5,
    });
    expect(r.status).toBe("already_met");
    expect(r.reachable).toBe(true);
  });

  test("남은 학기가 0개이고 현재 평균이 목표보다 높으면 unreachable 이다", () => {
    const r = backsolveTarget({
      system: "five",
      completed: done4,
      remainingSemesters: [],
      targetCut: 2.0,
    });
    expect(r.status).toBe("unreachable");
    expect(r.reachable).toBe(false);
    expect(r.requiredAverage).toBeNull();
  });

  test("필요 평균이 1 미만이면 unreachable 이고 계산값을 그대로 적는다", () => {
    const r = backsolveTarget({
      system: "five",
      completed: done4,
      remainingSemesters: left2,
      targetCut: 1.5,
    });
    // (1.5*6 - 9.2) / 2 = -0.1
    expect(r.status).toBe("unreachable");
    expect(r.reachable).toBe(false);
    expect(r.requiredAverage).toBe(-0.1);
    expect(r.basis).toContain("-0.1등급");
  });

  test("필요 평균이 체계 최대를 넘으면 reachable 이고 계산값을 그대로 적는다", () => {
    const r = backsolveTarget({
      system: "five",
      completed: done4,
      remainingSemesters: left2,
      targetCut: 4.5,
    });
    // (4.5*6 - 9.2) / 2 = 8.9
    expect(r.status).toBe("ok");
    expect(r.reachable).toBe(true);
    expect(r.requiredAverage).toBe(8.9);
  });

  test("반영할 완료 학기도 남은 학기도 없으면 no_data 이다", () => {
    const r = backsolveTarget({
      system: "nine",
      completed: [],
      remainingSemesters: [],
      targetCut: 2.0,
    });
    expect(r.status).toBe("no_data");
    expect(r.requiredAverage).toBeNull();
    expect(r.reachable).toBeNull();
  });
});

describe("targetScheduleRows", () => {
  test("남은 학기마다 목표 행을 만들고 3학년 2학기에만 고정 문구를 붙인다", () => {
    const rows = targetScheduleRows({
      remainingSemesters: [{ key: "3-1" }, { key: "3-2" }],
      requiredAverage: 1.94,
    });
    expect(rows).toEqual([
      { key: "3-1", target: 1.94, note: null },
      {
        key: "3-2",
        target: 1.94,
        note: "교과전형이나 정시를 함께 볼 때만 반영돼요",
      },
    ]);
  });

  test("필요 평균이 없으면 target 이 null 이다", () => {
    const rows = targetScheduleRows({
      remainingSemesters: [{ key: "3-2" }],
      requiredAverage: null,
    });
    expect(rows[0]?.target).toBeNull();
  });
});

describe("표현 규칙(No.7·78·80)", () => {
  test("모든 출력 문자열에 금지 표현이 없고 고지 문구만 예외로 부정형으로 쓴다", () => {
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(
      compareWithAdmission({
        estimate: 2.3,
        cuts: [{ year: 2025, grade: 2.46 }],
      }),
    );
    walk(
      compareWithAdmission({
        estimate: 3.6,
        cuts: [{ year: 2025, grade: 2.46 }],
      }),
    );
    for (const targetCut of [1.5, 2.18, 4.5]) {
      walk(
        backsolveTarget({
          system: "five",
          completed: done4,
          remainingSemesters: left2,
          targetCut,
        }),
      );
    }
    walk(
      backsolveTarget({
        system: "five",
        completed: done4,
        remainingSemesters: [],
        targetCut: 2.5,
      }),
    );
    walk(
      backsolveTarget({
        system: "five",
        completed: done4,
        remainingSemesters: [],
        targetCut: 2.0,
      }),
    );
    walk(
      backsolveTarget({
        system: "nine",
        completed: [],
        remainingSemesters: [],
        targetCut: 2.0,
      }),
    );
    walk(
      targetScheduleRows({
        remainingSemesters: [{ key: "3-1" }, { key: "3-2" }],
        requiredAverage: 1.9,
      }),
    );
    for (const text of strings) {
      expect(text).not.toMatch(/합격 가능성|합격률|예측/);
    }
    expect(strings.length).toBeGreaterThan(0);
  });
});
