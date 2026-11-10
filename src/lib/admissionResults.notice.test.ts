// 입결정보 '자료 없음'(사 #69) - 스쿨멘토만 행이 없는 칸 표기가 바뀌고,
// 대학이 공개하지 않은 칸('미공개')은 그대로다.
import { afterEach, describe, expect, test, vi } from "vitest";

async function loadLib(admissionResultsNotice: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    site: { features: { admissionResultsNotice } },
  }));
  return import("./admissionResults");
}

afterEach(() => {
  vi.doUnmock("@/config/site");
});

describe("EMPTY_CELL", () => {
  test("스쿨멘토는 행이 없는 칸을 '자료 없음'으로 쓴다", async () => {
    const lib = await loadLib(true);
    expect(lib.EMPTY_CELL).toBe("자료 없음");
  });

  test("위닝은 '-'를 유지한다", async () => {
    const lib = await loadLib(false);
    expect(lib.EMPTY_CELL).toBe("-");
  });

  test("대학이 공개하지 않은 칸은 스쿨멘토에서도 '미공개'다", async () => {
    const lib = await loadLib(true);
    expect(lib.UNDISCLOSED_CELL).toBe("미공개");
  });
});

describe("표 셀 표기", () => {
  const base = {
    university_name: "가상대학교",
    department_name: "가상학과",
    main_track: "교과",
    admission_track: "일반전형",
    screening_category: "일반",
    grade_50: null,
    grade_70: null,
    grade_85: null,
    grade_90: null,
  };

  test("행이 없는 연도는 '자료 없음', 등급이 null인 연도는 '미공개'로 나온다", async () => {
    const lib = await loadLib(true);
    const [tableRow] = lib.buildTableRows([
      { ...base, result_year: 2025, grade_50: 2.5 },
      { ...base, result_year: 2026, main_track: "종합" },
    ] as never);
    const displays = tableRow?.cells.map((c) => c.display);
    expect(displays).toContain("자료 없음");
    expect(displays).not.toContain("-");

    const [second] = lib.buildTableRows([
      { ...base, result_year: 2026 },
    ] as never);
    expect(second?.cells.map((c) => c.display)).toContain("미공개");
  });

  test("50% 컷이 없고 70% 컷만 있으면 대체 값을 컷 라벨과 함께 보여준다", async () => {
    const lib = await loadLib(true);
    expect(
      lib.formatGradeCell({ ...base, result_year: 2026, grade_70: 3.1 }),
    ).toBe("3.10 (70)");
  });
});
