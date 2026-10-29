import { describe, expect, it } from "vitest";
import { validateAdjustBody } from "./adjust.js";

const PID = "123e4567-e89b-42d3-a456-426614174000";
const base = {
  profileId: PID,
  programKey: "growth",
  delta: 2,
  reason: "클레임 보상",
};

describe("validateAdjustBody", () => {
  it("회차형 서비스의 추가 요청은 months 없이 통과한다", () => {
    expect(validateAdjustBody(base)).toEqual({
      ok: true,
      body: {
        profileId: PID,
        programKey: "growth",
        delta: 2,
        months: null,
        reason: "클레임 보상",
      },
    });
  });

  it("profileId 가 uuid 가 아니면 거부한다", () => {
    expect(validateAdjustBody({ ...base, profileId: "x" }).ok).toBe(false);
  });

  it("6개 서비스 밖의 programKey 는 거부한다", () => {
    expect(validateAdjustBody({ ...base, programKey: "goal" }).ok).toBe(false);
    expect(validateAdjustBody({ ...base, programKey: "x" }).ok).toBe(false);
  });

  it("delta 는 0 이 아닌 정수여야 한다", () => {
    for (const bad of [0, 1.5, "2", null, undefined]) {
      expect(validateAdjustBody({ ...base, delta: bad }).ok).toBe(false);
    }
    expect(validateAdjustBody({ ...base, delta: -1 }).ok).toBe(true);
  });

  it("reason 은 공백 제거 후 2자 이상이어야 한다", () => {
    expect(validateAdjustBody({ ...base, reason: " a " }).ok).toBe(false);
    expect(validateAdjustBody({ ...base, reason: undefined }).ok).toBe(false);
    expect(validateAdjustBody({ ...base, reason: " 보상 " })).toMatchObject({
      ok: true,
      body: { reason: "보상" },
    });
  });

  it("months 는 1 이상의 정수만 받는다", () => {
    for (const bad of [0, -1, 1.5, "3"]) {
      expect(validateAdjustBody({ ...base, months: bad }).ok).toBe(false);
    }
    expect(validateAdjustBody({ ...base, months: 3 })).toMatchObject({
      ok: true,
      body: { months: 3 },
    });
  });

  it("기간형 target 은 months 가 필수이고 차감할 수 없다", () => {
    const target = { ...base, programKey: "target" };
    expect(validateAdjustBody(target).ok).toBe(false);
    expect(validateAdjustBody({ ...target, months: 1 }).ok).toBe(true);
    expect(validateAdjustBody({ ...target, delta: -1, months: 1 }).ok).toBe(
      false,
    );
  });

  it("차감에는 months 를 줄 수 없다", () => {
    expect(validateAdjustBody({ ...base, delta: -1, months: 1 }).ok).toBe(
      false,
    );
  });
});
