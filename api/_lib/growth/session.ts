// 성장설계 세션 규칙 모듈(순수 함수). 리포트 회차, 만료, 진로 변경, 승급 제안.

const DAY_MS = 86_400_000;

/** 리포트 만료 기본 일수(No.115 기본안). */
export const REPORT_EXPIRY_DAYS = 90;

/** 마지막 활동 후 days(기본 90일)가 지나면 만료(No.115, 116, 139). 경계일 당일부터 만료. */
export function isExpired(
  lastActivityAt: string,
  now: string,
  days: number = REPORT_EXPIRY_DAYS,
): boolean {
  return Date.parse(now) - Date.parse(lastActivityAt) >= days * DAY_MS;
}

export type ReportRef = { id: string; status: string; issuedAt: string };

function latestOf<T extends ReportRef>(
  reports: readonly T[],
  match: (r: T) => boolean,
): T | null {
  let found: T | null = null;
  for (const r of reports) {
    if (!match(r)) continue;
    if (!found || Date.parse(r.issuedAt) > Date.parse(found.issuedAt))
      found = r;
  }
  return found;
}

/** 현재 유효한 회차: 가장 최근 completed 1개(No.115, 116). */
export function activeReport<T extends ReportRef>(
  reports: readonly T[],
): T | null {
  return latestOf(reports, (r) => r.status === "completed");
}

/** 진행 중인 회차: draft 또는 in_progress 1개, 여럿이면 최신(No.115, 116). */
export function openReport<T extends ReportRef>(
  reports: readonly T[],
): T | null {
  return latestOf(
    reports,
    (r) => r.status === "draft" || r.status === "in_progress",
  );
}

function normalizeCareer(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** 진로 변경 감지(No.56, 147): 공백 정규화 후 비교. 이전 값이 없으면 변경이 아니다. */
export function careerChanged(
  previous: string | null,
  current: string | null,
): boolean {
  if (previous === null) return false;
  return normalizeCareer(previous) !== normalizeCareer(current);
}

const KST_OFFSET_MS = 9 * 3_600_000;

/** 학년도(3월 1일 KST 전환). 1~2월은 전년도 소속. */
function academicYear(iso: string): number {
  const d = new Date(Date.parse(iso) + KST_OFFSET_MS);
  return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/**
 * 학년도 승급 제안(No.21). 프로필이 이전 학년도에 갱신됐고 고1, 고2 면 다음 학년 1학기를 제안한다.
 * 고3 은 제안하지 않는다(졸업 후 처리는 결정 대기).
 */
export function shouldProposePromotion(
  profile: { grade: 1 | 2 | 3; semester: 1 | 2; updatedAt: string },
  now: string,
): { propose: boolean; next: { grade: 2 | 3; semester: 1 } | null } {
  const stale = academicYear(profile.updatedAt) < academicYear(now);
  if (!stale || profile.grade === 3) return { propose: false, next: null };
  return {
    propose: true,
    next: { grade: profile.grade === 1 ? 2 : 3, semester: 1 },
  };
}
