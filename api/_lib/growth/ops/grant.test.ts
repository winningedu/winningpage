import { describe, expect, it } from "vitest";
import { buildGrantRow, validateGrantBody } from "./grant.js";

const PID = "123e4567-e89b-42d3-a456-426614174000";

describe("validateGrantBody", () => {
  it("profileId 와 sessionQuota 만 있으면 기간 없는 부여다", () => {
    const r = validateGrantBody({ profileId: PID, sessionQuota: 3 });
    expect(r).toEqual({
      ok: true,
      body: { profileId: PID, sessionQuota: 3, months: null, endsAt: null },
    });
  });

  it("profileId 가 uuid 가 아니면 거부한다", () => {
    expect(validateGrantBody({ profileId: "x", sessionQuota: 1 }).ok).toBe(
      false,
    );
    expect(validateGrantBody({ sessionQuota: 1 }).ok).toBe(false);
  });

  it("sessionQuota 는 1 이상의 정수여야 한다", () => {
    for (const bad of [0, -1, 1.5, "3", null, undefined]) {
      expect(validateGrantBody({ profileId: PID, sessionQuota: bad }).ok).toBe(
        false,
      );
    }
  });

  it("months 는 양의 정수만 받는다", () => {
    expect(
      validateGrantBody({ profileId: PID, sessionQuota: 1, months: 6 }).ok,
    ).toBe(true);
    expect(
      validateGrantBody({ profileId: PID, sessionQuota: 1, months: 0 }).ok,
    ).toBe(false);
    expect(
      validateGrantBody({ profileId: PID, sessionQuota: 1, months: 1.2 }).ok,
    ).toBe(false);
  });

  it("endsAt 은 ISO 시각이어야 하고 months 와 함께 줄 수 없다", () => {
    const ok = validateGrantBody({
      profileId: PID,
      sessionQuota: 1,
      endsAt: "2027-01-01T00:00:00Z",
    });
    expect(ok.ok && ok.body.endsAt).toBe("2027-01-01T00:00:00.000Z");
    expect(
      validateGrantBody({ profileId: PID, sessionQuota: 1, endsAt: "내일" }).ok,
    ).toBe(false);
    expect(
      validateGrantBody({
        profileId: PID,
        sessionQuota: 1,
        months: 3,
        endsAt: "2027-01-01T00:00:00Z",
      }).ok,
    ).toBe(false);
  });

  it("바디가 객체가 아니면 거부한다", () => {
    expect(validateGrantBody(null).ok).toBe(false);
    expect(validateGrantBody("x").ok).toBe(false);
  });
});

describe("buildGrantRow", () => {
  const now = "2026-10-06T00:00:00.000Z";
  const base = { profileId: PID, sessionQuota: 5, months: null, endsAt: null };

  it("기간이 없으면 만료와 기간 컬럼이 모두 null 이다(회차만 한정)", () => {
    const r = buildGrantRow(base, "admin-1", now);
    expect(r).toMatchObject({
      profile_id: PID,
      program_key: "growth",
      granted_by: "admin",
      granted_by_actor: "admin-1",
      granted_sessions: 5,
      granted_months: null,
      validity_days: null,
      expires_at: null,
      paid_amount: 0,
      starts_at: now,
    });
  });

  it("months 는 granted_months 와 같은 날짜 개월 뒤 만료로 만든다", () => {
    const r = buildGrantRow({ ...base, months: 6 }, "a", now);
    expect(r.granted_months).toBe(6);
    expect(r.validity_days).toBeNull();
    expect(r.expires_at).toBe("2027-04-06T00:00:00.000Z");
  });

  it("월말은 다음 달로 넘치지 않고 말일로 맞춘다", () => {
    const r = buildGrantRow(
      { ...base, months: 1 },
      "a",
      "2026-01-31T00:00:00.000Z",
    );
    expect(r.expires_at).toBe("2026-02-28T00:00:00.000Z");
  });

  it("endsAt 은 validity_days 를 올림 일수로 채우고 expires_at 을 그대로 쓴다", () => {
    const r = buildGrantRow(
      { ...base, endsAt: "2026-10-16T12:00:00.000Z" },
      "a",
      now,
    );
    expect(r.granted_months).toBeNull();
    expect(r.validity_days).toBe(11);
    expect(r.expires_at).toBe("2026-10-16T12:00:00.000Z");
  });

  it("endsAt 이 시작 시각 이전이면 만들지 않는다", () => {
    expect(() => buildGrantRow({ ...base, endsAt: now }, "a", now)).toThrow();
  });
});
