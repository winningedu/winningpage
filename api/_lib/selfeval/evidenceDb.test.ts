import { describe, expect, test } from "vitest";
import { loadEvidenceRows } from "./evidenceDb.js";
import { fakeDb } from "./fakeDb.testkit.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("loadEvidenceRows", () => {
  test("세 읽기를 함께 시작한다", async () => {
    const f = fakeDb(() => "hold");
    const p = loadEvidenceRows(f.db, "u1", "s1", ["r1"]);
    await tick();
    expect(f.started.map((s) => s.table).sort()).toEqual([
      "activity_records",
      "selfeval_manual_logs",
      "selfeval_record_links",
    ]);
    f.release();
    await p;
  });

  test("읽기 오류는 같은 문구로 던진다", async () => {
    const f = fakeDb((q) =>
      q.table === "selfeval_record_links"
        ? { error: { message: "boom" } }
        : { data: [] },
    );
    await expect(loadEvidenceRows(f.db, "u1", "s1", ["r1"])).rejects.toThrow(
      "selfeval_record_links 조회 실패: boom",
    );
  });
});
