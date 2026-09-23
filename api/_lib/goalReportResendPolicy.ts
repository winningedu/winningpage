// "2주 전까지는 보낼 수 있도록"(고객사 요청) — 관리자가 리포트 알림톡을 다시
// 보낼 수 있는 최대 과거 일수(기간 시작 기준, KST).
//
// 의존이 0인 잎 모듈이다 — api/goal/admin/resend-report.ts(서버 검증)와
// src/components/admin/goalReportResendOptions.ts(관리자 화면의 기간 후보
// 계산) 양쪽이 이 값 하나를 그대로 가져다 쓴다. api/_lib/goalReportSend.ts
// 처럼 sendAndLog(→ aligo.ts → undici)까지 딸려오는 모듈을 프론트 번들에
// 끌고 오지 않기 위해 상수만 따로 뗐다(api/_lib/performance/submission-chars.ts
// 와 같은 원칙).
export const MAX_RESEND_DAYS_AGO = 14;
