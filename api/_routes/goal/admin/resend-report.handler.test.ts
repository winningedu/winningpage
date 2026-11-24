// POST /api/goal/admin/resend-report 핸들러 계약 검증. 기간 규칙 자체(validateResendPeriod)는
// resend-report.test.ts 가 맡고, 여기서는 권한, 입력 검증, 오류 매핑, 응답 모양만 본다.
// 쓰기는 알림톡 발송(sendXReport)뿐이라 발송 모듈은 가짜로 바꾼다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { seedAdmin } from "../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";
import {
  createGoalAdmin,
  createGoalDb,
  type GoalDb,
} from "../../../_lib/goal/adminStudentsTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as GoalDb,
  sendDaily: vi.fn(),
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createGoalAdmin(kit.state, kit.db),
}));

vi.mock("../../../_lib/goal/reportSend.js", () => ({
  loadDailyReportInputs: vi.fn(async () => new Map()),
  loadWeeklyReportInputs: vi.fn(async () => new Map()),
  loadMonthlyReportInputs: vi.fn(async () => new Map()),
  sendDailyReport: kit.sendDaily,
  sendWeeklyReport: vi.fn(),
  sendMonthlyReport: vi.fn(),
}));

import handler from "./resend-report.js";

const ID = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) => callHandler(handler, body, "POST");
const VALID = { studentProfileId: ID, kind: "daily", periodKey: "2026-09-22" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T03:00:00Z"));
  kit.state = createKitState();
  kit.db = createGoalDb({
    profiles: [{ id: ID, time_zone: "Asia/Seoul" }],
  });
  seedAdmin(kit.state, "edit", "goalStudents");
  kit.sendDaily.mockReset();
  kit.sendDaily.mockResolvedValue({
    studentProfileId: ID,
    noParent: false,
    outcomes: [{ parentProfileId: "p1", phone: "01011112222", status: "sent" }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/goal/admin/resend-report", () => {
  test("edit 권한이면 발송하고 ok 없는 요약을 돌려준다", async () => {
    const r = await post(VALID);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
      recipients: [
        { parentProfileId: "p1", phone: "010****2222", status: "sent" },
      ],
    });
    expect(kit.sendDaily).toHaveBeenCalledTimes(1);
  });

  test("view 권한은 403 이고 발송하지 않는다", async () => {
    seedAdmin(kit.state, "view", "goalStudents");
    const r = await post(VALID);
    expect(r.status).toBe(403);
    expect(kit.sendDaily).not.toHaveBeenCalled();
  });

  test("studentProfileId 가 없으면 400", async () => {
    const r = await post({ kind: "daily", periodKey: "2026-09-22" });
    expect(r.status).toBe(400);
    expect(kit.sendDaily).not.toHaveBeenCalled();
  });

  test("kind 가 틀리면 같은 한글 문구로 400", async () => {
    const r = await post({ ...VALID, kind: "yearly" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      detail: "kind가 올바르지 않습니다.",
    });
  });

  test("2주가 지난 기간은 400", async () => {
    const r = await post({ ...VALID, periodKey: "2026-08-01" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "2주 이내 기간만 다시 보낼 수 있습니다.",
    });
    expect(kit.sendDaily).not.toHaveBeenCalled();
  });

  test("프로필이 없으면 404 NOT_FOUND", async () => {
    kit.db.tables.profiles = [];
    const r = await post(VALID);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "학생을 찾을 수 없습니다.",
    });
  });
});
