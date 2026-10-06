import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendAndLog: vi.fn(),
  resolveParentRecipients: vi.fn(),
}));
vi.mock("../../alimtalkSend.js", () => ({ sendAndLog: mocks.sendAndLog }));
vi.mock("../../goalReportNotify.js", async (orig) => ({
  ...(await orig<typeof import("../../goalReportNotify.js")>()),
  resolveParentRecipients: mocks.resolveParentRecipients,
}));

import {
  buildGrowthDoneVariables,
  formatIssuedDate,
  notifyGrowthReportDone,
} from "./notify.js";

function fakeDb(
  result: { data: unknown; error: { message: string } | null } = {
    data: { issued_at: "2026-11-14T11:00:00Z" },
    error: null,
  },
) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as never;
}

const recipient = {
  studentProfileId: "s1",
  studentName: "김학생",
  parentProfileId: "p1",
  parentPhone: "01012345678",
};

describe("formatIssuedDate", () => {
  it("KST 날짜를 YYYY.MM.DD 로 만든다", () => {
    expect(formatIssuedDate("2026-11-14T11:00:00Z")).toBe("2026.11.14");
    // UTC 15시 이후는 KST 로 다음 날이다.
    expect(formatIssuedDate("2026-11-14T16:00:00Z")).toBe("2026.11.15");
  });
});

describe("buildGrowthDoneVariables", () => {
  it("학생이름, 발행일, 절대 URL 링크를 만든다", () => {
    const v = buildGrowthDoneVariables({
      studentName: "김학생",
      issuedAt: "2026-11-14T11:00:00Z",
      studentId: "s1",
      reportId: "r1",
    });
    expect(v.학생이름).toBe("김학생");
    expect(v.발행일).toBe("2026.11.14");
    expect(v.링크).toBe(
      "https://www.winningedu.com/mypage/children/s1/growth/r1",
    );
  });
});

describe("notifyGrowthReportDone", () => {
  beforeEach(() => {
    mocks.sendAndLog.mockReset();
    mocks.resolveParentRecipients.mockReset();
  });

  it("연결 학부모가 없으면 조용히 no_parent", async () => {
    mocks.resolveParentRecipients.mockResolvedValue([]);
    expect(await notifyGrowthReportDone(fakeDb(), "s1", "r1")).toEqual({
      sent: false,
      reason: "no_parent",
    });
    expect(mocks.sendAndLog).not.toHaveBeenCalled();
  });

  it("학부모마다 sendAndLog 를 dedupeKey 와 함께 부른다", async () => {
    mocks.resolveParentRecipients.mockResolvedValue([recipient]);
    mocks.sendAndLog.mockResolvedValue({ status: "sent", logId: 1 });
    const out = await notifyGrowthReportDone(fakeDb(), "s1", "r1");
    expect(out).toEqual({ sent: true, count: 1 });
    expect(mocks.sendAndLog).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "growthReportDone",
        phone: "01012345678",
        profileId: "p1",
        dedupeKey: "growth-report-done:r1:p1",
        variables: {
          학생이름: "김학생",
          발행일: "2026.11.14",
          링크: "https://www.winningedu.com/mypage/children/s1/growth/r1",
        },
      }),
    );
  });

  it("회차를 못 찾으면 던진다", async () => {
    mocks.resolveParentRecipients.mockResolvedValue([recipient]);
    await expect(
      notifyGrowthReportDone(fakeDb({ data: null, error: null }), "s1", "r1"),
    ).rejects.toThrow();
  });
});
