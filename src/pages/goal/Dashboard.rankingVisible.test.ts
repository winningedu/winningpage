import { describe, expect, it } from "vitest";
import { shouldShowRankingRail } from "./Dashboard";

// QA 행71, 서버가 visible:false(활성 학생 200명 미만)를 주면 RankingRail을 렌더하지 않는다.
describe("shouldShowRankingRail", () => {
  it("visible:false면 숨긴다", () => {
    expect(
      shouldShowRankingRail({
        kind: "ok",
        visible: false,
        top: [],
        me: null,
      }),
    ).toBe(false);
  });

  it("visible:true면 보인다", () => {
    expect(
      shouldShowRankingRail({ kind: "ok", visible: true, top: [], me: null }),
    ).toBe(true);
  });

  it("로딩 중(null), 오류 등 ok가 아닌 결과는 기존대로 보인다(빈 상태 문구)", () => {
    expect(shouldShowRankingRail(null)).toBe(true);
    expect(shouldShowRankingRail({ kind: "error" })).toBe(true);
  });
});
