import { describe, expect, test, vi } from "vitest";
import { buildGrantBody, validateGrantForm } from "./grantForm";

const zone = vi.hoisted(() => ({ tz: "Asia/Seoul" }));
vi.mock("@/lib/time/zone", () => ({ browserTimeZone: () => zone.tz }));

const ok = { profileId: "p1", sessionQuota: "3", months: "6", endsAt: "" };

describe("validateGrantForm", () => {
  test("개월만 입력하면 유효", () => {
    expect(validateGrantForm(ok)).toBeNull();
  });
  test("종료일만 입력해도 유효", () => {
    expect(
      validateGrantForm({ ...ok, months: "", endsAt: "2027-01-31" }),
    ).toBeNull();
  });
  test("학생 미선택", () => {
    expect(validateGrantForm({ ...ok, profileId: "" })).toBe(
      "학생을 선택해 주세요.",
    );
  });
  test("회차 수는 1 이상 정수", () => {
    for (const v of ["", "0", "1.5", "abc"]) {
      expect(validateGrantForm({ ...ok, sessionQuota: v })).toBe(
        "회차 수는 1 이상의 정수로 입력해 주세요.",
      );
    }
  });
  test("개월과 종료일은 하나만", () => {
    expect(validateGrantForm({ ...ok, endsAt: "2027-01-31" })).toBe(
      "기간은 개월 또는 종료일 중 하나만 입력해 주세요.",
    );
    expect(validateGrantForm({ ...ok, months: "" })).toBe(
      "기간(개월) 또는 종료일을 입력해 주세요.",
    );
  });
  test("개월은 1 이상 정수", () => {
    expect(validateGrantForm({ ...ok, months: "0" })).toBe(
      "기간은 1 이상의 정수(개월)로 입력해 주세요.",
    );
  });
});

describe("buildGrantBody", () => {
  test("개월 본문", () => {
    expect(buildGrantBody(ok)).toEqual({
      profileId: "p1",
      sessionQuota: 3,
      months: 6,
    });
  });
  test("종료일은 브라우저 시간대 다음 날 0시(배타 상한) ISO 로 보낸다", () => {
    zone.tz = "Asia/Seoul";
    expect(buildGrantBody({ ...ok, months: "", endsAt: "2027-01-31" })).toEqual(
      {
        profileId: "p1",
        sessionQuota: 3,
        endsAt: "2027-01-31T15:00:00.000Z",
      },
    );
    zone.tz = "America/Los_Angeles";
    expect(
      buildGrantBody({ ...ok, months: "", endsAt: "2027-01-31" }),
    ).toMatchObject({ endsAt: "2027-02-01T08:00:00.000Z" });
  });
});
