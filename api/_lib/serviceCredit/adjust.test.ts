import { describe, expect, it } from "vitest";
import {
  buildAdjustGrantRow,
  buildDeductArgs,
  checkDeduction,
  isAdjustableProfile,
  validateAdjustBody,
} from "./adjust.js";

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

describe("buildAdjustGrantRow", () => {
  const NOW = "2026-10-29T00:00:00.000Z";
  const ACTOR = "223e4567-e89b-42d3-a456-426614174000";
  const body = {
    profileId: PID,
    programKey: "growth",
    delta: 2,
    months: null,
    reason: "클레임 보상",
  };

  it("회차형 추가는 granted_sessions 만 채우고 기간은 무기한이다", () => {
    expect(buildAdjustGrantRow(body, ACTOR, NOW)).toEqual({
      profile_id: PID,
      program_key: "growth",
      granted_by: "admin",
      granted_by_actor: ACTOR,
      granted_sessions: 2,
      granted_months: null,
      validity_days: null,
      paid_amount: 0,
      starts_at: NOW,
      expires_at: null,
      memo: `관리자 이용횟수 조정: 클레임 보상`,
    });
  });

  it("months 를 주면 granted_months 와 expires_at 을 채운다", () => {
    const row = buildAdjustGrantRow({ ...body, months: 3 }, ACTOR, NOW);
    expect(row.granted_sessions).toBe(2);
    expect(row.granted_months).toBe(3);
    expect(row.expires_at).toBe("2027-01-29T00:00:00.000Z");
  });

  it("기간형 target 은 granted_sessions 가 null 이다", () => {
    const row = buildAdjustGrantRow(
      { ...body, programKey: "target", delta: 1, months: 2 },
      ACTOR,
      NOW,
    );
    expect(row.granted_sessions).toBeNull();
    expect(row.granted_months).toBe(2);
    expect(row.expires_at).toBe("2026-12-29T00:00:00.000Z");
  });
});

describe("checkDeduction", () => {
  it("잔여 이하의 차감은 허용한다", () => {
    expect(
      checkDeduction({ liveCount: 1, quotaTotal: 5, quotaUsed: 2 }, 3),
    ).toEqual({
      ok: true,
    });
  });

  it("잔여보다 많이 차감하면 거부한다", () => {
    const r = checkDeduction({ liveCount: 1, quotaTotal: 5, quotaUsed: 2 }, 4);
    expect(r).toMatchObject({ ok: false, code: "INSUFFICIENT_CREDIT" });
  });

  it("살아있는 이용권이 없으면 거부한다", () => {
    const r = checkDeduction(
      { liveCount: 0, quotaTotal: null, quotaUsed: 0 },
      1,
    );
    expect(r).toMatchObject({ ok: false, code: "NO_ENTITLEMENT" });
  });

  it("회차 무제한 이용권은 차감할 수 없다", () => {
    const r = checkDeduction(
      { liveCount: 1, quotaTotal: null, quotaUsed: 0 },
      1,
    );
    expect(r).toMatchObject({ ok: false, code: "UNLIMITED_SESSIONS" });
  });
});

describe("buildDeductArgs", () => {
  it("차감 RPC 인자는 양수 수량과 행위자가 붙은 사유다", () => {
    expect(
      buildDeductArgs(
        {
          profileId: PID,
          programKey: "growth",
          delta: -2,
          months: null,
          reason: "실수 복구",
        },
        "actor-1",
      ),
    ).toEqual({
      p_profile_id: PID,
      p_program_key: "growth",
      p_amount: 2,
      p_reason: "관리자 이용횟수 조정(actor-1): 실수 복구",
    });
  });
});

describe("isAdjustableProfile", () => {
  it("학생 회원은 조정 대상이다", () => {
    expect(isAdjustableProfile({ member_type: "student", role: null })).toBe(
      true,
    );
  });

  it("관리자 계정은 member_type 과 무관하게 조정 대상이다", () => {
    expect(isAdjustableProfile({ member_type: null, role: "admin" })).toBe(
      true,
    );
  });

  it("학부모 회원은 조정 대상이 아니다", () => {
    expect(isAdjustableProfile({ member_type: "parent", role: null })).toBe(
      false,
    );
  });
});
