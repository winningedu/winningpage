// 심화탐구 앱(/app/inquiry/*) 경로 상수. 라우트 정의, 사이드바, 단계 유도, 페이지 간 이동이
// 모두 이 한 곳을 읽는다(계약: docs/deep-inquiry-dev-plan.md 부록 C).
export const INQUIRY_BASE = "/app/inquiry";

export const INQUIRY_PATHS = {
  home: INQUIRY_BASE,
  topics: `${INQUIRY_BASE}/topics`,
  design: `${INQUIRY_BASE}/design`,
  write: `${INQUIRY_BASE}/write`,
  evaluate: `${INQUIRY_BASE}/evaluate`,
  finalize: `${INQUIRY_BASE}/finalize`,
  reports: `${INQUIRY_BASE}/reports`,
  /** 완료 리포트 상세. */
  report: (sessionId: string) =>
    `${INQUIRY_BASE}/reports/${encodeURIComponent(sessionId)}`,
} as const;
