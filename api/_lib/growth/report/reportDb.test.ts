import { afterEach, describe, expect, test, vi } from "vitest";
import type { Db } from "../intake/collectDb.js";
import { ADMISSION_PAGE_SIZE, loadAdmissionRows } from "./reportDb.js";

type Call = { method: string; args: unknown[] };

/** 호출 순서를 기록하고 range 마다 준비된 페이지를 돌려주는 supabase 체인 대역. */
function fakeDb(pages: unknown[][]) {
  const calls: Call[] = [];
  let page = 0;
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq", "or", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.range = (...args: unknown[]) => {
    calls.push({ method: "range", args });
    const data = pages[page] ?? [];
    page += 1;
    return Promise.resolve({ data, error: null });
  };
  const db = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return chain;
    },
  } as unknown as Db;
  return { db, calls };
}

const targets = (...names: string[]) =>
  names.map((universityName) => ({
    universityName,
    departmentName: "경영학과",
  }));

describe("loadAdmissionRows", () => {
  test("정규화한 대학 키와 컷 규칙 조건으로 admission_results 를 조회한다", async () => {
    const { db, calls } = fakeDb([[]]);
    await loadAdmissionRows(db, targets("고려대학교", "한양대학교 (ERICA)"));
    expect(calls).toContainEqual({
      method: "from",
      args: ["admission_results"],
    });
    expect(calls).toContainEqual({
      method: "in",
      args: ["university_key", ["고려대", "한양대(ERICA)"]],
    });
    expect(calls).toContainEqual({
      method: "in",
      args: ["screening_category", ["일반", "추천형"]],
    });
    expect(calls).toContainEqual({ method: "eq", args: ["is_active", true] });
    const select = calls.find((c) => c.method === "select")?.args[0] as string;
    for (const col of ["grade_50", "grade_70", "screening_category"]) {
      expect(select).toContain(col);
    }
    expect(select).not.toContain("grade_avg");
  });

  test("학과가 하나도 없으면 조회하지 않는다", async () => {
    const { db, calls } = fakeDb([[]]);
    const rows = await loadAdmissionRows(db, [
      { universityName: "고려대", departmentName: null },
    ]);
    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("페이지가 가득 차면 다음 페이지를 이어서 읽는다", async () => {
    const full = Array.from({ length: ADMISSION_PAGE_SIZE }, (_, i) => ({
      university_name: "가대",
      department_name: "경영학과",
      result_year: 2000 + (i % 30),
      main_track: null,
      grade_50: 2,
      grade_70: null,
      screening_category: "일반",
    }));
    const { db, calls } = fakeDb([full, full.slice(0, 3)]);
    const rows = await loadAdmissionRows(db, targets("가대"));
    expect(rows).toHaveLength(ADMISSION_PAGE_SIZE + 3);
    expect(
      calls.filter((c) => c.method === "range").map((c) => c.args),
    ).toEqual([
      [0, ADMISSION_PAGE_SIZE - 1],
      [ADMISSION_PAGE_SIZE, ADMISSION_PAGE_SIZE * 2 - 1],
    ]);
  });

  test("대학 키는 희망 대학 상한과 같게 2개까지만 보낸다", async () => {
    const { db, calls } = fakeDb([[]]);
    await loadAdmissionRows(db, targets("가대", "나대", "다대", "라대"));
    const keyCall = calls.find(
      (c) => c.method === "in" && c.args[0] === "university_key",
    );
    expect(keyCall?.args[1]).toEqual(["가대", "나대"]);
  });

  describe("페이지 상한", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const fullPage = Array.from({ length: ADMISSION_PAGE_SIZE }, () => ({
      university_name: "가대",
      department_name: "경영학과",
      result_year: 2024,
      main_track: null,
      grade_50: 2,
      grade_70: null,
      screening_category: "일반",
    }));

    test("20페이지 상한에 닿으면 경고를 한 줄 남긴다", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { db } = fakeDb(Array.from({ length: 20 }, () => fullPage));
      const rows = await loadAdmissionRows(db, targets("가대"));
      expect(rows).toHaveLength(ADMISSION_PAGE_SIZE * 20);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    test("상한 전에 끝나면 경고하지 않는다", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { db } = fakeDb([fullPage, fullPage.slice(0, 1)]);
      await loadAdmissionRows(db, targets("가대"));
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
