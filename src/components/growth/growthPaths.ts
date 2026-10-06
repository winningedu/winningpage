// 성장설계 앱(/app/growth/*) 경로 상수. 라우트 정의, 사이드바, 단계 유도, 페이지 간 이동이
// 모두 이 한 곳을 읽는다(경로 문자열을 파일마다 흩어 두면 라우트 개편 때 한쪽만 어긋난다).
export const GROWTH_BASE = "/app/growth";

export const GROWTH_PATHS = {
  home: GROWTH_BASE,
  survey: `${GROWTH_BASE}/survey`,
  collect: `${GROWTH_BASE}/collect`,
  generate: `${GROWTH_BASE}/generate`,
  reports: `${GROWTH_BASE}/reports`,
  plan: `${GROWTH_BASE}/plan`,
  /** 완료 리포트 상세. */
  report: (reportId: string) =>
    `${GROWTH_BASE}/reports/${encodeURIComponent(reportId)}`,
} as const;
