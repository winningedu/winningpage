import { describe, expect, it } from "vitest";
import {
  buildGrantRow,
  INQUIRY_PROGRAM_KEY,
  validateGrantBody,
} from "./grant.js";

const PID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = "2026-10-06T00:00:00.000Z";

describe("validateGrantBody", () => {
  it("profileId 와 sessionQuota 만 있으면 기간 없는 부여다", () => {
    expect(validateGrantBody({ profileId: PID, sessionQuota: 3 })).toEqual({
      ok: true,
      body: {
        profileId: PID,
        sessionQuota: 3,
        startsAt: null,
        endsAt: null,
      },
    });
  });

  it("profileId 가 uuid 가 아니면 거부한다", () => {
    expect(validateGrantBody({ profileId: "x", sessionQuota: 1 }).ok).toBe(
      false,
    );
    expect(validateGrantBody({ sessionQuota: 1 }).ok).toBe(false);
  });

  it("sessionQuota 는 1 이상의 정수 또는 null(무제한)이어야 한다", () => {
    for (const bad of [0, -1, 1.5, "3", undefined]) {
      expect(validateGrantBody({ profileId: PID, sessionQuota: bad }).ok).toBe(
        false,
      );
    }
  });

  it("무제한(null)은 만료일이 있어야 한다", () => {
    expect(validateGrantBody({ profileId: PID, sessionQuota: null }).ok).toBe(
      false,
    );
    const r = validateGrantBody({
      profileId: PID,
      sessionQuota: null,
      endsAt: "2027-01-01T00:00:00Z",
    });
    expect(r.ok && r.body.sessionQuota).toBeNull();
  });

  it("startsAt 과 endsAt 은 ISO 시각이어야 하고 endsAt 이 더 늦어야 한다", () => {
    const ok = validateGrantBody({
      profileId: PID,
      sessionQuota: 1,
      startsAt: "2026-10-01T00:00:00Z",
      endsAt: "2027-01-01T00:00:00Z",
    });
    expect(ok.ok && ok.body.startsAt).toBe("2026-10-01T00:00:00.000Z");
    expect(ok.ok && ok.body.endsAt).toBe("2027-01-01T00:00:00.000Z");
    expect(
      validateGrantBody({ profileId: PID, sessionQuota: 1, endsAt: "내일" }).ok,
    ).toBe(false);
    expect(
      validateGrantBody({ profileId: PID, sessionQuota: 1, startsAt: "내일" })
        .ok,
    ).toBe(false);
    expect(
      validateGrantBody({
        profileId: PID,
        sessionQuota: 1,
        startsAt: "2027-01-01T00:00:00Z",
        endsAt: "2026-10-01T00:00:00Z",
      }).ok,
    ).toBe(false);
  });

  it("바디가 객체가 아니면 거부한다", () => {
    expect(validateGrantBody(null).ok).toBe(false);
    expect(validateGrantBody("x").ok).toBe(false);
  });
});

describe("buildGrantRow", () => {
  const base = {
    profileId: PID,
    sessionQuota: 5,
    startsAt: null,
    endsAt: null,
  };

  it("기간이 없으면 만료와 기간 컬럼이 모두 null 이다(세션 수만 한정)", () => {
    expect(buildGrantRow(base, "admin-1", NOW)).toMatchObject({
      profile_id: PID,
      program_key: INQUIRY_PROGRAM_KEY,
      granted_by: "admin",
      granted_by_actor: "admin-1",
      granted_sessions: 5,
      granted_months: null,
      validity_days: null,
      expires_at: null,
      paid_amount: 0,
      starts_at: NOW,
    });
    expect(INQUIRY_PROGRAM_KEY).toBe("inquiry");
  });

  it("endsAt 은 validity_days 를 올림 일수로 채우고 expires_at 을 그대로 쓴다", () => {
    const r = buildGrantRow(
      { ...base, endsAt: "2026-10-16T12:00:00.000Z" },
      "a",
      NOW,
    );
    expect(r.granted_months).toBeNull();
    expect(r.validity_days).toBe(11);
    expect(r.expires_at).toBe("2026-10-16T12:00:00.000Z");
  });

  it("startsAt 이 있으면 그 시각부터이고 기간은 startsAt 기준으로 센다", () => {
    const r = buildGrantRow(
      {
        ...base,
        startsAt: "2026-11-01T00:00:00.000Z",
        endsAt: "2026-11-11T00:00:00.000Z",
      },
      "a",
      NOW,
    );
    expect(r.starts_at).toBe("2026-11-01T00:00:00.000Z");
    expect(r.validity_days).toBe(10);
  });

  it("무제한은 granted_sessions null 이고 제약 때문에 granted_months 를 올림 개월로 채운다", () => {
    const r = buildGrantRow(
      { ...base, sessionQuota: null, endsAt: "2027-01-20T00:00:00.000Z" },
      "a",
      NOW,
    );
    expect(r.granted_sessions).toBeNull();
    expect(r.granted_months).toBe(4);
    expect(r.validity_days).toBeNull();
    expect(r.expires_at).toBe("2027-01-20T00:00:00.000Z");
  });

  it("endsAt 이 시작 시각 이전이면 만들지 않는다", () => {
    expect(() => buildGrantRow({ ...base, endsAt: NOW }, "a", NOW)).toThrow();
  });

  it("무제한인데 endsAt 이 없으면 만들지 않는다", () => {
    expect(() =>
      buildGrantRow({ ...base, sessionQuota: null }, "a", NOW),
    ).toThrow();
  });
});
