import { afterEach, describe, expect, test, vi } from "vitest";
import { HANDOFF_STORAGE_KEY } from "../../components/growth/plan/planLogic";
import { clearGrowthHandoff, readGrowthHandoff } from "./handoff";

const handoff = {
  reportId: "r1",
  itemId: "item-1",
  program: "deep",
  theme: "생명",
  currentGrade: "고2",
  stage: "flower",
  subtheme: null,
  condition: { title: "t", description: null, axis: null, category: null },
};

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("readGrowthHandoff", () => {
  test("성장설계가 저장한 키와 모양을 읽어 planItemId 와 원본을 돌려준다", () => {
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    expect(readGrowthHandoff()).toEqual({
      planItemId: "item-1",
      raw: handoff,
    });
  });

  test("키가 정확히 growth:handoff 다", () => {
    expect(HANDOFF_STORAGE_KEY).toBe("growth:handoff");
  });

  test("저장분이 없으면 null 이다", () => {
    expect(readGrowthHandoff()).toBeNull();
  });

  test("JSON 이 깨졌으면 null 이다", () => {
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, "{not json");
    expect(readGrowthHandoff()).toBeNull();
  });

  test("itemId 가 없는 객체는 planItemId 가 null 이다", () => {
    sessionStorage.setItem(
      HANDOFF_STORAGE_KEY,
      JSON.stringify({ reportId: "r1" }),
    );
    expect(readGrowthHandoff()).toEqual({
      planItemId: null,
      raw: { reportId: "r1" },
    });
  });

  test("객체가 아닌 값은 null 이다", () => {
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify("x"));
    expect(readGrowthHandoff()).toBeNull();
  });

  test("저장소 접근이 던져도 null 로 흡수한다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readGrowthHandoff()).toBeNull();
  });
});

describe("clearGrowthHandoff", () => {
  test("저장분을 지운다", () => {
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    clearGrowthHandoff();
    expect(sessionStorage.getItem(HANDOFF_STORAGE_KEY)).toBeNull();
  });

  test("저장소 접근이 던져도 예외를 내지 않는다", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => clearGrowthHandoff()).not.toThrow();
  });
});
