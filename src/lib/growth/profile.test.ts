import { beforeEach, describe, expect, test, vi } from "vitest";

const { maybeSingleMock, eqMock, selectMock, fromMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { maybeSingleMock, eqMock, selectMock, fromMock };
});

vi.mock("../supabase", () => ({ supabase: { from: fromMock } }));

import {
  fetchStudentName,
  growthProfileNameQuery,
  pickGradeLabel,
} from "./profile";

beforeEach(() => {
  maybeSingleMock.mockReset();
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
});

describe("pickGradeLabel", () => {
  test("알려진 학년 라벨만 돌려준다", () => {
    expect(pickGradeLabel({ grade: "고2" })).toBe("고2");
    expect(pickGradeLabel({ grade: "N수" })).toBe("N수");
  });

  test("프로필이 없거나 학년이 없거나 모르는 값이면 null 이다", () => {
    expect(pickGradeLabel(null)).toBeNull();
    expect(pickGradeLabel({})).toBeNull();
    expect(pickGradeLabel({ grade: "중3" })).toBeNull();
    expect(pickGradeLabel({ grade: 2 })).toBeNull();
  });
});

describe("fetchStudentName", () => {
  test("profiles 본인 행의 이름을 돌려준다", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { name: " QA학생 " },
      error: null,
    });
    expect(await fetchStudentName("u1")).toBe("QA학생");
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(eqMock).toHaveBeenCalledWith("id", "u1");
  });

  test("행이 없거나 이름이 비어 있으면 null 이다(지어내지 않는다)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await fetchStudentName("u1")).toBeNull();
    maybeSingleMock.mockResolvedValue({ data: { name: "  " }, error: null });
    expect(await fetchStudentName("u1")).toBeNull();
  });

  test("조회 오류도 null 이다(사이드바 이름 줄만 빠지고 화면은 계속 뜬다)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await fetchStudentName("u1")).toBeNull();
  });
});

describe("growthProfileNameQuery", () => {
  test("userId 가 키에 들어가고 없으면 조회하지 않는다", () => {
    expect(growthProfileNameQuery("u1").queryKey).toContain("u1");
    expect(growthProfileNameQuery(null).enabled).toBe(false);
    expect(selectMock).not.toHaveBeenCalled();
  });
});
