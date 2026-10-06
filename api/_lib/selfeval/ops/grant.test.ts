import { describe, expect, it } from "vitest";
import {
  buildGrantRow,
  SELFEVAL_PROGRAM_KEY,
  validateGrantBody,
} from "./grant.js";

const PID = "123e4567-e89b-42d3-a456-426614174000";
const now = "2026-10-06T00:00:00.000Z";
const base = { profileId: PID, sessionQuota: 5, months: null, endsAt: null };

describe("validateGrantBody", () => {
  it("profileId 와 sessionQuota 만 있으면 기간 없는 부여다", () => {
    expect(validateGrantBody({ profileId: PID, sessionQuota: 3 })).toEqual({
      ok: true,
      body: { profileId: PID, sessionQuota: 3, months: null, endsAt: null },
    });
  });

  it("sessionQuota 가 1 미만이거나 정수가 아니면 거부한다", () => {
    for (const bad of [0, 1.5, "3", undefined]) {
      expect(validateGrantBody({ profileId: PID, sessionQuota: bad }).ok).toBe(
        false,
      );
    }
  });

  it("months 와 endsAt 은 함께 줄 수 없다", () => {
    expect(
      validateGrantBody({
        profileId: PID,
        sessionQuota: 1,
        months: 3,
        endsAt: "2027-01-01T00:00:00Z",
      }).ok,
    ).toBe(false);
  });
});

describe("buildGrantRow", () => {
  it("program_key 는 selfeval 이고 admin 부여에 actor 를 채운다", () => {
    expect(SELFEVAL_PROGRAM_KEY).toBe("selfeval");
    const r = buildGrantRow(base, "admin-1", now);
    expect(r).toMatchObject({
      profile_id: PID,
      program_key: "selfeval",
      granted_by: "admin",
      granted_by_actor: "admin-1",
      granted_sessions: 5,
      expires_at: null,
      validity_days: null,
      starts_at: now,
    });
    expect(r.memo).toContain("자기평가서");
  });

  it("months 는 개월 뒤 만료를 만든다", () => {
    const r = buildGrantRow({ ...base, months: 6 }, "a", now);
    expect(r.granted_months).toBe(6);
    expect(r.expires_at).toBe("2027-04-06T00:00:00.000Z");
  });

  it("endsAt 은 validity_days 를 올림 일수로 채운다", () => {
    const r = buildGrantRow(
      { ...base, endsAt: "2026-10-16T12:00:00.000Z" },
      "a",
      now,
    );
    expect(r.validity_days).toBe(11);
  });
});
