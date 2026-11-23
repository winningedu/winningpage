import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

import { formatBoardDate, incrementBoardView } from "./boardData";

describe("formatBoardDate", () => {
  test("같은 순간을 보는 사람의 시간대 날짜로 표기한다", () => {
    const instant = "2026-11-30T16:00:00Z";
    expect(formatBoardDate(instant, "Asia/Seoul")).toBe("2026-12-01");
    expect(formatBoardDate(instant, "America/Los_Angeles")).toBe("2026-11-30");
  });

  test("파싱 불가 값은 원문 앞 10자를 돌려주고 빈 값은 빈 문자열이다", () => {
    expect(formatBoardDate("not-a-date-value")).toBe("not-a-date");
    expect(formatBoardDate(null)).toBe("");
  });
});

describe("incrementBoardView", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
  });

  test("브라우저 시간대를 p_tz 로 넘긴다", async () => {
    await incrementBoardView("notices", "abc");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(rpc).toHaveBeenCalledWith("increment_board_view", {
      p_source: "notices",
      p_id: "abc",
      p_tz: tz,
    });
  });
});
