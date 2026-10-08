// goal_workbooks "책장에 꽂기" 수동 전이 — computeWorkbookStatus/canShelveWorkbook/
// buildWorkbookPayload는 계산만 하고 DB/네트워크를 쓰지 않아 순수 함수처럼 테스트할 수
// 있다(api/_lib/goalPlanTaskStatus.test.ts와 동일 관례).
import { describe, expect, test } from "vitest";
import {
  buildWorkbookPayload,
  canShelveWorkbook,
  computeWorkbookStatus,
} from "./repo.js";

describe("computeWorkbookStatus", () => {
  test("현재 페이지가 전체 페이지에 못 미치면 reading이다", () => {
    expect(computeWorkbookStatus(59, 240)).toBe("reading");
  });

  test("현재 페이지가 전체 페이지 이상이면 done이다", () => {
    expect(computeWorkbookStatus(240, 240)).toBe("done");
    expect(computeWorkbookStatus(300, 240)).toBe("done");
  });
});

describe("canShelveWorkbook — PUT {shelve:true} 검증", () => {
  test("status='done'인 문제집만 책장에 꽂을 수 있다", () => {
    expect(canShelveWorkbook("done")).toBe(true);
  });

  test("reading·null·undefined·예상 밖 값은 전부 거부한다", () => {
    expect(canShelveWorkbook("reading")).toBe(false);
    expect(canShelveWorkbook(null)).toBe(false);
    expect(canShelveWorkbook(undefined)).toBe(false);
    expect(canShelveWorkbook("archived")).toBe(false);
  });
});

describe("buildWorkbookPayload — shelvedAt 매핑", () => {
  const baseRow = {
    id: 1,
    subject: "korean",
    title: "수능특강 독서",
    total_pages: 240,
    current_page: 240,
    status: "done",
  };

  test("shelved_at이 있으면 그대로 실어 보낸다", () => {
    const payload = buildWorkbookPayload({
      ...baseRow,
      shelved_at: "2026-09-02T00:00:00.000Z",
    });
    expect(payload.shelvedAt).toBe("2026-09-02T00:00:00.000Z");
  });

  test("shelved_at이 없으면 null이다(완독했지만 아직 안 꽂은 상태)", () => {
    const payload = buildWorkbookPayload({ ...baseRow, shelved_at: null });
    expect(payload.shelvedAt).toBeNull();

    const payloadMissing = buildWorkbookPayload({ ...baseRow });
    expect(payloadMissing.shelvedAt).toBeNull();
  });
});
