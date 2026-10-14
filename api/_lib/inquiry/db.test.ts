// 세션 기본 정보 갱신 테스트. 갱신 때 성장설계 회차 연결도 최신 완료 회차로 다시 채운다.
import { describe, expect, it, vi } from "vitest";
import { updateSessionInfo } from "./db.js";

function updateDb() {
  const maybeSingle = vi.fn(async () => ({ data: { id: "s1" }, error: null }));
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle,
  };
  const update = vi.fn(() => chain);
  const from = vi.fn(() => ({ update }));
  return { db: { from } as never, update, from };
}

const info = {
  gradeLabel: "고2",
  semester: 1,
  career: "의사",
  subject: "생명과학",
} as never;

describe("updateSessionInfo", () => {
  it("최신 완료 회차 id 로 growth_report_id 를 다시 채운다", async () => {
    const { db, update, from } = updateDb();
    await updateSessionInfo(db, "u1", "s1", info, "g9", "2026-10-14T00:00:00Z");
    expect(from).toHaveBeenCalledWith("inquiry_sessions");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        grade_label: "고2",
        subject: "생명과학",
        growth_report_id: "g9",
        last_activity_at: "2026-10-14T00:00:00Z",
      }),
    );
  });

  it("완료 회차가 없으면 growth_report_id 를 null 로 비운다", async () => {
    const { db, update } = updateDb();
    await updateSessionInfo(db, "u1", "s1", info, null, "2026-10-14T00:00:00Z");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ growth_report_id: null }),
    );
  });
});
