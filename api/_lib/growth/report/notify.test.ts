import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendAndLog: vi.fn(),
  resolveParentRecipients: vi.fn(),
}));
vi.mock("../../messaging/alimtalkSend.js", () => ({
  sendAndLog: mocks.sendAndLog,
}));
vi.mock("../../goal/reportNotify.js", async (orig) => ({
  ...(await orig<typeof import("../../goal/reportNotify.js")>()),
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
  timeZone = "Asia/Seoul",
) {
  const make = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () =>
        table === "profiles"
          ? { data: { time_zone: timeZone }, error: null }
          : result,
    };
    return chain;
  };
  return { from: make } as never;
}

const recipient = {
  studentProfileId: "s1",
  studentName: "김학생",
  parentProfileId: "p1",
  parentPhone: "01012345678",
};

describe("formatIssuedDate", () => {
  it("수신자 시간대의 날짜를 YYYY.MM.DD 로 만든다", () => {
    expect(formatIssuedDate("2026-11-14T11:00:00Z", "Asia/Seoul")).toBe(
      "2026.11.14",
    );
    // UTC 15시 이후는 서울로 다음 날이다.
    expect(formatIssuedDate("2026-11-14T16:00:00Z", "Asia/Seoul")).toBe(
      "2026.11.15",
    );
    // 같은 순간이 로스앤젤레스(PST)에서는 전날 밤이다.
    expect(
      formatIssuedDate("2026-11-14T05:00:00Z", "America/Los_Angeles"),
    ).toBe("2026.11.13");
  });
});

describe("buildGrowthDoneVariables", () => {
  it("학생이름, 발행일, 학생ID, 리포트ID 를 만든다(승인본 UO_3143 의 경로 변수 둘)", () => {
    const v = buildGrowthDoneVariables({
      studentName: "김학생",
      issuedAt: "2026-11-14T11:00:00Z",
      studentId: "s1",
      reportId: "r1",
      timeZone: "Asia/Seoul",
    });
    expect(v).toEqual({
      학생이름: "김학생",
      발행일: "2026.11.14",
      학생ID: "s1",
      리포트ID: "r1",
    });
  });
});

describe("notifyGrowthReportDone", () => {
  beforeEach(() => {
    mocks.sendAndLog.mockReset();
    mocks.resolveParentRecipients.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
          학생ID: "s1",
          리포트ID: "r1",
        },
      }),
    );
  });

  it("발행일은 학생 프로필 시간대 기준으로 적는다", async () => {
    mocks.resolveParentRecipients.mockResolvedValue([recipient]);
    mocks.sendAndLog.mockResolvedValue({ status: "sent", logId: 1 });
    await notifyGrowthReportDone(
      fakeDb(
        { data: { issued_at: "2026-11-14T05:00:00Z" }, error: null },
        "America/Los_Angeles",
      ),
      "s1",
      "r1",
    );
    expect(mocks.sendAndLog).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ 발행일: "2026.11.13" }),
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
