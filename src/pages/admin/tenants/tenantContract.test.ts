import { describe, expect, test } from "vitest";
import { deletionDdayText, mouLabel, todayKst } from "./tenantContract";

describe("mouLabel", () => {
  test("pending, signed, ended 를 협약 전, 협약 중, 협약 종료로 보인다", () => {
    expect(mouLabel("pending")).toBe("협약 전");
    expect(mouLabel("signed")).toBe("협약 중");
    expect(mouLabel("ended")).toBe("협약 종료");
  });

  test("값이 없으면 대시다", () => {
    expect(mouLabel(null)).toBe("-");
  });
});

describe("deletionDdayText", () => {
  const base = {
    contractEnd: "2026-09-01",
    graceEnds: "2026-10-01",
    defaultGraceDays: 30,
  };

  test("계약 종료일이 없으면 보이지 않는다", () => {
    expect(
      deletionDdayText({ ...base, contractEnd: null, today: "2026-09-10" }),
    ).toBeNull();
  });

  test("유예 종료 전에는 삭제 가능일 D-n 을 센다(삭제 가능일은 유예 종료 다음 날)", () => {
    expect(deletionDdayText({ ...base, today: "2026-09-21" })).toBe(
      "삭제 가능일 D-11",
    );
    expect(deletionDdayText({ ...base, today: "2026-10-01" })).toBe(
      "삭제 가능일 D-1",
    );
  });

  test("유예 종료 다음 날부터 삭제 가능과 계약 종료 후 지난 날수를 보인다", () => {
    expect(deletionDdayText({ ...base, today: "2026-10-02" })).toBe(
      "삭제 가능, 계약 종료 후 31일 지남",
    );
  });

  test("유예 종료일이 비면 계약 종료일에 기본 유예 일수를 더한다", () => {
    expect(
      deletionDdayText({ ...base, graceEnds: null, today: "2026-09-30" }),
    ).toBe("삭제 가능일 D-2");
  });

  test("유예 종료일도 기본 유예 일수도 없으면 유예 종료일 미정이다", () => {
    expect(
      deletionDdayText({
        ...base,
        graceEnds: null,
        defaultGraceDays: null,
        today: "2026-09-30",
      }),
    ).toBe("유예 종료일 미정");
  });
});

describe("todayKst", () => {
  test("UTC 15:00 이후는 KST 로 다음 날이다", () => {
    expect(todayKst(new Date("2026-11-06T15:30:00Z"))).toBe("2026-11-07");
  });

  test("UTC 14:59 는 KST 로 같은 날이다", () => {
    expect(todayKst(new Date("2026-11-06T14:59:00Z"))).toBe("2026-11-06");
  });
});
