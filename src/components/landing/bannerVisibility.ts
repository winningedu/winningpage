// 홈 배너(banners, home_side_banners) 노출 판정. 두 테이블이 같은 규칙을 쓴다(각각 따로 판정).

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

// 노출 판정. 기간 밖 배너를 먼저 걸러낸 뒤 대상을 정한다(기획 #26, 대체 방식).
// 내 기관(matchedTenantIds) 배너가 1개 이상이면 그 배너만, 없으면 공통(tenant_id 없음)
// 배너를 보여준다. 비로그인과 rpc 실패는 호출부(useMatchedTenantIds)가 빈 목록으로
// 확정하므로 공통 배너만 남는다. 표시 전용이며 정본 접근 제어가 아니다.
export function selectVisibleBanners<T extends BannerTarget & BannerPeriod>(
  banners: T[],
  today: string,
  matchedTenantIds: string[],
): T[] {
  const matched = new Set(matchedTenantIds);
  const active = banners.filter((banner) => isBannerInPeriod(banner, today));
  const mine = active.filter(
    (banner) => banner.tenant_id && matched.has(banner.tenant_id),
  );
  if (mine.length > 0) return mine;
  return active.filter((banner) => !banner.tenant_id);
}
