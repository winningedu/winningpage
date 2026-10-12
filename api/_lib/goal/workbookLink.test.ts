// 계획↔문제집 연결(QA 행286-B) — buildPlanTaskPayload의 workbook 필드 매핑과
// nextWorkbookPageAfterTaskDone(진도 전진 계산)은 api/_lib/goal/repo.ts의 계산 없는 순수
// 함수라 DB/네트워크 없이 테스트할 수 있다(goalWorkbookShelve.test.ts와 동일 관례).
import { describe, expect, test } from "vitest";
import { buildPlanTaskPayload, nextWorkbookPageAfterTaskDone } from "./repo.js";

describe("buildPlanTaskPayload — workbook 연결 필드", () => {
  const baseRow = {
    id: 1,
    plan_date: "2026-09-02",
    title: "수학 문제집 20p",
    subject: "math",
    duration_minutes: 60,
    sort_order: 0,
    status: "pending",
    done: false,
  };

  test("연결이 없으면 넷 다 null이다", () => {
    const payload = buildPlanTaskPayload({ ...baseRow });
    expect(payload.workbookId).toBeNull();
    expect(payload.pageFrom).toBeNull();
    expect(payload.pageTo).toBeNull();
    expect(payload.workbookTitle).toBeNull();
  });

  test("workbook_id만 있고 페이지가 없으면 workbookId만 채워진다", () => {
    const payload = buildPlanTaskPayload({ ...baseRow, workbook_id: 7 });
    expect(payload.workbookId).toBe(7);
    expect(payload.pageFrom).toBeNull();
    expect(payload.pageTo).toBeNull();
  });

  test("페이지 범위가 있으면 숫자로 채워진다", () => {
    const payload = buildPlanTaskPayload({
      ...baseRow,
      workbook_id: 7,
      page_from: 10,
      page_to: 20,
    });
    expect(payload.pageFrom).toBe(10);
    expect(payload.pageTo).toBe(20);
  });

  test("fetchPlanTasks 임베드 조인의 workbook.title을 workbookTitle로 옮긴다", () => {
    const payload = buildPlanTaskPayload({
      ...baseRow,
      workbook_id: 7,
      workbook: { title: "수능특강 독서" },
    });
    expect(payload.workbookTitle).toBe("수능특강 독서");
  });

  test("조인 결과가 없는 행(insert/update 단건 등)은 workbookTitle이 null이다", () => {
    const payload = buildPlanTaskPayload({ ...baseRow, workbook_id: 7 });
    expect(payload.workbookTitle).toBeNull();
  });
});

describe("nextWorkbookPageAfterTaskDone — done 전환 시 진도 전진", () => {
  test("기존 진도보다 앞선 페이지면 그 페이지로 전진한다", () => {
    expect(nextWorkbookPageAfterTaskDone(10, 20, 240)).toBe(20);
  });

  test("기존 진도가 이미 더 앞서 있으면 뒤로 밀지 않는다(max)", () => {
    expect(nextWorkbookPageAfterTaskDone(50, 20, 240)).toBe(50);
  });

  test("total_pages를 넘지 않게 상한을 건다", () => {
    expect(nextWorkbookPageAfterTaskDone(10, 300, 240)).toBe(240);
  });
});
