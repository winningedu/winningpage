import { describe, expect, test } from "vitest";
import { isBannerInPeriod, selectVisibleBanners } from "./bannerVisibility";

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

describe("selectVisibleBanners", () => {
  const today = "2026-11-04";
  const common = { id: "common", tenant_id: null };
  const mine = { id: "mine", tenant_id: "tenant-a" };
  const other = { id: "other", tenant_id: "tenant-b" };

  test("비로그인(매칭 기관 없음)은 공통 배너만 본다", () => {
    expect(selectVisibleBanners([common, mine, other], today, [])).toEqual([
      common,
    ]);
  });

  test("rpc 실패(빈 목록)에서도 공통 배너만 남는다", () => {
    // useMatchedTenantIds 는 실패 시 ids=[] 로 확정한다(fail-closed).
    expect(selectVisibleBanners([mine, common], today, [])).toEqual([common]);
  });

  test("내 기관 배너가 있으면 공통 배너는 빠지고 그 기관 배너만 본다", () => {
    expect(
      selectVisibleBanners([common, mine, other], today, ["tenant-a"]),
    ).toEqual([mine]);
  });

  test("내 기관 배너가 없으면(다른 기관만 있음) 공통 배너를 본다", () => {
    expect(selectVisibleBanners([common, other], today, ["tenant-a"])).toEqual([
      common,
    ]);
  });

  test("내 기관 배너가 기간 밖이면 공통 배너로 돌아간다", () => {
    const expired = { ...mine, start_date: null, end_date: "2026-11-03" };
    expect(
      selectVisibleBanners([common, expired], today, ["tenant-a"]),
    ).toEqual([common]);
  });

  test("tenant_id 키가 없는 행은 공통으로 본다", () => {
    const legacy: { id: string; tenant_id?: string | null } = { id: "legacy" };
    expect(selectVisibleBanners([legacy], today, [])).toEqual([legacy]);
  });
});
