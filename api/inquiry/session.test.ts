// POST /api/inquiry/session 의 이용 게이트와 새 세션 생성 전 한도 확인.
// 스쿨멘토에서 막히면 기존 코드(403 NO_ENTITLEMENT, 429 QUOTA_EXHAUSTED)에 tenantReason 이 더해진다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fail: vi.fn(),
  readInquiryAccess: vi.fn(),
  readInquiryQuota: vi.fn(),
}));

vi.mock("../_lib/handler.js", () => ({
  defineHandler: (opts: { handler: unknown }) => opts.handler,
  requireUserId: (ctx: { userId: string }) => ctx.userId,
}));
vi.mock("../_lib/inquiry/compose.js", () => ({
  fail: mocks.fail,
  readInquiryAccess: mocks.readInquiryAccess,
  readInquiryQuota: mocks.readInquiryQuota,
  loadHandoffView: vi.fn(),
  loadSessionParts: vi.fn(),
  NO_ENTITLEMENT_MESSAGE: "no-entitlement",
}));
vi.mock("../_lib/inquiry/db.js", () => ({
  createSession: vi.fn(),
  loadAssets: vi.fn(async () => []),
  loadGrowthReports: vi.fn(async () => []),
  loadOpenSession: vi.fn(async () => null),
  loadRecordCandidates: vi.fn(async () => []),
  loadStudentProfile: vi.fn(async () => null),
  replaceAssets: vi.fn(),
  updateSessionInfo: vi.fn(),
}));
vi.mock("../_lib/inquiry/reply.js", () => ({
  resendPendingReplies: vi.fn(async () => false),
}));

import handler from "./session.js";

const INFO = {
  gradeLabel: "고2",
  semester: 1,
  career: "교사",
  area: "subject",
  subject: "수학",
  activityName: null,
};

const run = (body: unknown) =>
  (
    handler as unknown as (
      req: unknown,
      res: unknown,
      ctx: unknown,
    ) => Promise<void>
  )({ body }, {}, { userId: "u1", supabaseAdmin: {} });

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.readInquiryAccess.mockResolvedValue({
    allowed: true,
    tenantReason: null,
  });
  mocks.readInquiryQuota.mockResolvedValue({
    quotaTotal: null,
    quotaUsed: null,
    quotaRemaining: null,
    planEndsAt: null,
    planLabel: null,
  });
});

describe("inquiry/session 이용 게이트", () => {
  it("스쿨멘토 진입 거부는 403 NO_ENTITLEMENT 에 tenantReason 을 싣는다", async () => {
    mocks.readInquiryAccess.mockResolvedValue({
      allowed: false,
      tenantReason: "catch_all",
    });
    await run({ action: "resume" });
    expect(mocks.fail).toHaveBeenCalledWith(
      {},
      403,
      "NO_ENTITLEMENT",
      "no-entitlement",
      { tenantReason: "catch_all" },
    );
  });

  it("위닝 거부는 추가 필드 없이 같은 403 이다", async () => {
    mocks.readInquiryAccess.mockResolvedValue({
      allowed: false,
      tenantReason: null,
    });
    await run({ action: "resume" });
    expect(mocks.fail).toHaveBeenCalledWith(
      {},
      403,
      "NO_ENTITLEMENT",
      "no-entitlement",
      {},
    );
  });
});

describe("inquiry/session 새 세션 한도", () => {
  it("한도가 0 이면 429 QUOTA_EXHAUSTED 에 tenantReason 을 싣는다", async () => {
    mocks.readInquiryQuota.mockResolvedValue({
      quotaTotal: 3,
      quotaUsed: 3,
      quotaRemaining: 0,
      planEndsAt: "2026-12-01",
      planLabel: null,
      capReason: "month_cap",
    });
    await run({ action: "create", info: INFO });
    expect(mocks.fail).toHaveBeenCalledWith(
      {},
      429,
      "QUOTA_EXHAUSTED",
      expect.any(String),
      { tenantReason: "month_cap" },
    );
  });

  it("위닝은 한도 0 이어도 tenantReason 이 없다", async () => {
    mocks.readInquiryQuota.mockResolvedValue({
      quotaTotal: 3,
      quotaUsed: 3,
      quotaRemaining: 0,
      planEndsAt: null,
      planLabel: null,
    });
    await run({ action: "create", info: INFO });
    expect(mocks.fail).toHaveBeenCalledWith(
      {},
      429,
      "QUOTA_EXHAUSTED",
      expect.any(String),
      {},
    );
  });
});
