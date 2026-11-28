import { describe, expect, test } from "vitest";
import { fakeDb } from "../fakeDb.testkit.js";
import type { SessionRow } from "../rows.js";
import { loadReportInput } from "./load.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

const session = {
  id: "s1",
  academic_year: 2026,
  area: "subject",
  subject: null,
  activity_name: null,
  grade_label: null,
  target_chars: 1500,
  target_chars_mode: "withSpace",
  completed_at: null,
} as unknown as SessionRow;

const isFinal = (eq: Record<string, unknown>) => eq.report_type === "final";
const finalRow = {
  revision: 1,
  sections: [],
  char_count: { withSpace: 1, withoutSpace: 1 },
  created_at: "2026-01-01T00:00:00Z",
};

describe("loadReportInput", () => {
  test("최종본을 읽은 뒤 여섯 읽기를 함께 시작한다", async () => {
    const f = fakeDb((q) =>
      q.table === "selfeval_reports" && isFinal(q.eq)
        ? { data: finalRow }
        : "hold",
    );
    const p = loadReportInput(f.db, "u1", session, "Asia/Test");
    await tick();
    const tables = f.started.map((s) => s.table);
    for (const t of [
      "selfeval_session_activities",
      "activity_records",
      "selfeval_manual_logs",
      "selfeval_record_links",
      "selfeval_sessions",
      "student_profiles",
    ]) {
      expect(tables, t).toContain(t);
    }
    f.release();
    await p;
  });

  test("읽기 오류는 같은 문구로 던진다", async () => {
    const f = fakeDb((q) => {
      if (q.table === "selfeval_reports" && isFinal(q.eq)) {
        return { data: finalRow };
      }
      if (q.table === "activity_records") return { error: { message: "boom" } };
      return { data: [] };
    });
    await expect(
      loadReportInput(f.db, "u1", session, "Asia/Test"),
    ).rejects.toThrow("activity_records 조회 실패: boom");
  });
});
