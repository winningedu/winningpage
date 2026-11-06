import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasSelfevalAccess: vi.fn(),
  readSelfevalQuota: vi.fn(),
  consumeCredit: vi.fn(),
  reverseCredit: vi.fn(),
  isSchoolmentorSite: vi.fn(),
  checkTenantStart: vi.fn(),
}));
vi.mock("../../site.js", () => ({
  isSchoolmentorSite: mocks.isSchoolmentorSite,
}));
vi.mock("../../tenantUsage.js", () => ({
  checkTenantStart: mocks.checkTenantStart,
}));
vi.mock("../access.js", () => ({
  hasSelfevalAccess: mocks.hasSelfevalAccess,
  readSelfevalQuota: mocks.readSelfevalQuota,
}));
vi.mock("../db.js", () => ({
  consumeCredit: mocks.consumeCredit,
  reverseCredit: mocks.reverseCredit,
}));

import type { SessionRow } from "../rows.js";
import {
  chargeAfterSuccess,
  checkChargeGate,
  hasActiveCharge,
  needsCharge,
  reverseAfterFailure,
} from "./credit.js";

const db = {} as never;
const row = (p: Partial<SessionRow>) =>
  ({ id: "s1", ledger_id: null, ledger_reversed_at: null, ...p }) as SessionRow;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("차감 상태", () => {
  it("원장이 없거나 되돌려졌으면 차감이 필요하다", () => {
    expect(needsCharge(row({}))).toBe(true);
    expect(
      needsCharge(row({ ledger_id: "l", ledger_reversed_at: "2026-10-06" })),
    ).toBe(true);
    expect(needsCharge(row({ ledger_id: "l" }))).toBe(false);
  });

  it("원장이 있고 되돌리지 않았으면 활성 차감이다", () => {
    expect(hasActiveCharge(row({ ledger_id: "l" }))).toBe(true);
    expect(hasActiveCharge(row({}))).toBe(false);
    expect(
      hasActiveCharge(row({ ledger_id: "l", ledger_reversed_at: "x" })),
    ).toBe(false);
  });
});

describe("checkChargeGate", () => {
  it("이미 차감된 세션은 이용권을 읽지 않고 통과한다", async () => {
    expect(await checkChargeGate(db, "u", row({ ledger_id: "l" }))).toBeNull();
    expect(mocks.hasSelfevalAccess).not.toHaveBeenCalled();
  });

  it("이용권이 없으면 no_entitlement 다", async () => {
    mocks.hasSelfevalAccess.mockResolvedValue(false);
    expect(await checkChargeGate(db, "u", row({}))).toEqual({
      kind: "no_entitlement",
    });
  });

  it("남은 회차가 0 이면 quota_exhausted 다", async () => {
    mocks.hasSelfevalAccess.mockResolvedValue(true);
    mocks.readSelfevalQuota.mockResolvedValue({ quotaRemaining: 0 });
    expect(await checkChargeGate(db, "u", row({}))).toEqual({
      kind: "quota_exhausted",
    });
  });

  it("무제한(null)이거나 남았으면 통과한다", async () => {
    mocks.hasSelfevalAccess.mockResolvedValue(true);
    mocks.readSelfevalQuota.mockResolvedValue({ quotaRemaining: null });
    expect(await checkChargeGate(db, "u", row({}))).toBeNull();
    mocks.readSelfevalQuota.mockResolvedValue({ quotaRemaining: 2 });
    expect(await checkChargeGate(db, "u", row({}))).toBeNull();
  });
});

describe("checkChargeGate 스쿨멘토", () => {
  beforeEach(() => mocks.isSchoolmentorSite.mockReturnValue(true));

  it("selfeval_session 단위로 시작 확인을 하고 통과하면 null 이다", async () => {
    mocks.checkTenantStart.mockResolvedValue(null);
    expect(await checkChargeGate(db, "u", row({}))).toBeNull();
    expect(mocks.checkTenantStart).toHaveBeenCalledWith(db, "u", "selfeval", {
      kind: "selfeval_session",
      id: "s1",
    });
    expect(mocks.hasSelfevalAccess).not.toHaveBeenCalled();
    expect(mocks.readSelfevalQuota).not.toHaveBeenCalled();
  });

  it.each(["month_cap", "term_cap"])(
    "새 세션이 %s 에 걸리면 quota_exhausted 와 tenantReason",
    async (reason) => {
      mocks.checkTenantStart.mockResolvedValue(reason);
      expect(await checkChargeGate(db, "u", row({}))).toEqual({
        kind: "quota_exhausted",
        tenantReason: reason,
      });
    },
  );

  it.each(["catch_all", "disabled", "outside_period", "grace"])(
    "%s 는 no_entitlement 와 tenantReason",
    async (reason) => {
      mocks.checkTenantStart.mockResolvedValue(reason);
      expect(await checkChargeGate(db, "u", row({}))).toEqual({
        kind: "no_entitlement",
        tenantReason: reason,
      });
    },
  );
});

describe("checkChargeGate 위닝은 시작 확인을 하지 않는다", () => {
  it("checkTenantStart 를 부르지 않는다", async () => {
    mocks.isSchoolmentorSite.mockReturnValue(false);
    mocks.hasSelfevalAccess.mockResolvedValue(false);
    expect(await checkChargeGate(db, "u", row({}))).toEqual({
      kind: "no_entitlement",
    });
    expect(mocks.checkTenantStart).not.toHaveBeenCalled();
  });
});

describe("chargeAfterSuccess", () => {
  it.each([
    ["charged", true],
    ["already_charged", true],
    ["quota_exhausted", false],
  ])("차감 상태 %s 는 charged %s 다", async (status, expected) => {
    mocks.consumeCredit.mockResolvedValue({ status, charged: false });
    expect(await chargeAfterSuccess(db, "u", "s1", "selfeval:x")).toBe(
      expected,
    );
    expect(mocks.consumeCredit).toHaveBeenCalledWith(
      db,
      "u",
      "s1",
      "selfeval:x",
    );
  });

  it("차감 호출이 던져도 진행을 막지 않고 false 다", async () => {
    mocks.consumeCredit.mockRejectedValue(new Error("db"));
    expect(await chargeAfterSuccess(db, "u", "s1", "r")).toBe(false);
  });
});

describe("reverseAfterFailure", () => {
  it("활성 차감이 없으면 되돌리지 않고 false 다", async () => {
    expect(await reverseAfterFailure(db, "u", row({}), "r")).toBe(false);
    expect(mocks.reverseCredit).not.toHaveBeenCalled();
  });

  it("활성 차감이 있으면 되돌리고 true 다", async () => {
    mocks.reverseCredit.mockResolvedValue({ reversed: true });
    expect(
      await reverseAfterFailure(db, "u", row({ ledger_id: "l" }), "r"),
    ).toBe(true);
    expect(mocks.reverseCredit).toHaveBeenCalledWith(db, "u", "s1", "r");
  });

  it("되돌림 호출이 던지면 false 다", async () => {
    mocks.reverseCredit.mockRejectedValue(new Error("db"));
    expect(
      await reverseAfterFailure(db, "u", row({ ledger_id: "l" }), "r"),
    ).toBe(false);
  });
});
