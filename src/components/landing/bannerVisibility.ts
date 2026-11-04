// 홈 배너(banners, home_side_banners) 노출 판정. 두 테이블이 같은 규칙을 쓴다.

interface BannerPeriod {
  start_date?: string | null;
  end_date?: string | null;
}

// 노출 기간 판정. today 는 KST 기준 YYYY-MM-DD. 시작일과 종료일 당일은 포함하고,
// 둘 다 비면 항상 노출한다(home_side_banners 조회의 start_date/end_date or 필터와 같은 규칙).
export function isBannerInPeriod(banner: BannerPeriod, today: string): boolean {
  if (banner.start_date && banner.start_date > today) return false;
  if (banner.end_date && banner.end_date < today) return false;
  return true;
}

interface BannerTarget {
  tenant_id?: string | null;
}

// 노출 대상 판정. tenant_id 가 없으면 공통 배너라 모두에게, 있으면 matchedTenantIds 에
// 든 기관 소속만 본다(filterOrgProducts 와 같은 규칙, 표시 전용). 비로그인과 rpc 실패는
// 호출부(useMatchedTenantIds)가 빈 목록으로 확정하므로 공통 배너만 남는다.
export function filterBannersByTarget<T extends BannerTarget>(
  banners: T[],
  matchedTenantIds: string[],
): T[] {
  const matched = new Set(matchedTenantIds);
  return banners.filter(
    (banner) => !banner.tenant_id || matched.has(banner.tenant_id),
  );
}
