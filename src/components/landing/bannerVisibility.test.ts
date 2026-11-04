import { describe, expect, test } from "vitest";
import { filterBannersByTarget, isBannerInPeriod } from "./bannerVisibility";

describe("isBannerInPeriod", () => {
  const today = "2026-11-04";

  test("시작일 전이면 노출하지 않는다", () => {
    expect(
      isBannerInPeriod({ start_date: "2026-11-05", end_date: null }, today),
    ).toBe(false);
  });

  test("기간 중이면 노출한다(시작일과 종료일 당일 포함)", () => {
    expect(
      isBannerInPeriod(
        { start_date: "2026-11-01", end_date: "2026-11-30" },
        today,
      ),
    ).toBe(true);
    expect(
      isBannerInPeriod(
        { start_date: "2026-11-04", end_date: "2026-11-04" },
        today,
      ),
    ).toBe(true);
  });

  test("종료일이 지났으면 노출하지 않는다", () => {
    expect(
      isBannerInPeriod({ start_date: null, end_date: "2026-11-03" }, today),
    ).toBe(false);
  });

  test("시작일과 종료일이 모두 NULL이면 항상 노출한다", () => {
    expect(isBannerInPeriod({ start_date: null, end_date: null }, today)).toBe(
      true,
    );
    expect(isBannerInPeriod({}, today)).toBe(true);
  });
});

describe("filterBannersByTarget", () => {
  const common = { id: "common", tenant_id: null };
  const mine = { id: "mine", tenant_id: "tenant-a" };
  const other = { id: "other", tenant_id: "tenant-b" };
  const rows = [common, mine, other];

  test("비로그인(매칭 기관 없음)은 공통 배너만 본다", () => {
    expect(filterBannersByTarget(rows, [])).toEqual([common]);
  });

  test("매칭 기관이 있으면 공통과 그 기관 배너를 본다", () => {
    expect(filterBannersByTarget(rows, ["tenant-a"])).toEqual([common, mine]);
  });

  test("다른 기관 배너는 보이지 않는다", () => {
    expect(filterBannersByTarget([other], ["tenant-a"])).toEqual([]);
  });

  test("rpc 실패(빈 목록)에서는 공통 배너만 남는다", () => {
    // useMatchedTenantIds 는 실패 시 ids=[] 로 확정한다(fail-closed).
    expect(filterBannersByTarget(rows, [])).toEqual([common]);
  });

  test("tenant_id 키가 없는 행은 공통으로 본다", () => {
    const legacy: { id: string; tenant_id?: string | null } = { id: "legacy" };
    expect(filterBannersByTarget([legacy], [])).toEqual([legacy]);
  });
});
