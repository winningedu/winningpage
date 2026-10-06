import { describe, expect, test } from "vitest";
import {
  buildGrantBody,
  type InquiryGrantFormValues,
  validateGrantForm,
} from "./inquiryGrantForm";

const ok: InquiryGrantFormValues = {
  profileId: "p1",
  sessionQuota: "3",
  unlimited: false,
  startsOn: "",
  endsOn: "",
};

describe("validateGrantForm", () => {
  test("세션 수만 있는 입력은 유효", () => {
    expect(validateGrantForm(ok)).toBeNull();
  });
  test("학생 미선택", () => {
    expect(validateGrantForm({ ...ok, profileId: "" })).toBe(
      "학생을 선택해 주세요.",
    );
  });
  test("세션 수는 1 이상 정수", () => {
    for (const v of ["", "0", "-1", "1.5", "abc"]) {
      expect(validateGrantForm({ ...ok, sessionQuota: v })).toBe(
        "세션 수는 1 이상의 정수로 입력해 주세요.",
      );
    }
  });
  test("무제한이면 세션 수를 보지 않고 만료일이 필요하다", () => {
    const u = { ...ok, sessionQuota: "", unlimited: true };
    expect(validateGrantForm(u)).toBe("무제한 부여는 만료일이 필요합니다.");
    expect(validateGrantForm({ ...u, endsOn: "2027-01-01" })).toBeNull();
  });
  test("날짜 형식이 아니면 거부", () => {
    expect(validateGrantForm({ ...ok, startsOn: "2026/10/01" })).toBe(
      "시작일 형식이 올바르지 않습니다.",
    );
    expect(validateGrantForm({ ...ok, endsOn: "내일" })).toBe(
      "만료일 형식이 올바르지 않습니다.",
    );
  });
  test("만료일은 시작일보다 늦어야 한다", () => {
    expect(
      validateGrantForm({
        ...ok,
        startsOn: "2026-10-05",
        endsOn: "2026-10-05",
      }),
    ).toBe("만료일은 시작일보다 늦어야 합니다.");
    expect(
      validateGrantForm({
        ...ok,
        startsOn: "2026-10-05",
        endsOn: "2026-10-06",
      }),
    ).toBeNull();
  });
});

describe("buildGrantBody", () => {
  test("날짜가 없으면 null 로 보낸다", () => {
    expect(buildGrantBody(ok)).toEqual({
      profileId: "p1",
      sessionQuota: 3,
      startsAt: null,
      endsAt: null,
    });
  });
  test("무제한은 sessionQuota null, 날짜는 한국 시각 하루 경계로 바꾼다", () => {
    expect(
      buildGrantBody({
        ...ok,
        unlimited: true,
        startsOn: "2026-10-05",
        endsOn: "2027-01-01",
      }),
    ).toEqual({
      profileId: "p1",
      sessionQuota: null,
      startsAt: "2026-10-05T00:00:00+09:00",
      endsAt: "2027-01-01T23:59:59+09:00",
    });
  });
});
