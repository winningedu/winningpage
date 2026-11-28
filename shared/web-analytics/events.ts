// 방문 분석이 읽는 이벤트와 속성(분석 grill Q12, 속성 최대 2개). 화면 표 순서이기도 하다.
// 수집 쪽 src/lib/analytics.ts 가 허용 목록으로 이 목록을 쓰고, 서버(api/_lib/web-analytics/report.ts)가 Vercel 에서 읽는 이름으로 쓴다.
// 속성 값의 타입은 수집 쪽 AnalyticsEventMap 이 정하고, api/_lib/web-analytics/report.test.ts 가 이 목록과 맞춰 잠근다.

export const WEB_ANALYTICS_EVENTS = [
  { name: "signup_complete", properties: ["member_type"] },
  { name: "service_start", properties: ["service"] },
  { name: "diagnosis_complete", properties: [] },
  { name: "checkout_start", properties: ["method"] },
  { name: "payment_complete", properties: ["method"] },
  { name: "consult_apply", properties: [] },
  { name: "kakao_inquiry_click", properties: ["location"] },
  { name: "report_export", properties: ["service", "method"] },
  { name: "paywall_cta_click", properties: ["service", "location"] },
  { name: "ai_regenerate", properties: ["service", "step"] },
] as const;
