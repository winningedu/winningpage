// 관리자 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/admin", admin) 으로 붙인다.
// 도메인 하위 앱을 여기서 .route() 로 잇는다. Hono 로 옮긴 경로는 vercel.json 에서 /api/app 진입 함수로 보낸다(api/_routes/app.test.ts 가 본다).

import { createAdminApp } from "../../_lib/hono/admin.js";
import { accessLogs } from "./access-logs.js";
import { admission } from "./admission.js";
import { aiTelemetry } from "./ai-telemetry.js";
import { aiTelemetryPricing } from "./ai-telemetry-pricing.js";
import { coupons } from "./coupons.js";
import { growthGrant } from "./growth-grant.js";
import { growthRecover } from "./growth-recover.js";
import { growthReports } from "./growth-reports.js";
import { homeSectionCopy } from "./home-section-copy.js";
import { inquiryGrant } from "./inquiry-grant.js";
import { inquiryRecover } from "./inquiry-recover.js";
import { inquirySessions } from "./inquiry-sessions.js";
import { inviteMember } from "./invite-member.js";
import { knowledgeBulk } from "./knowledge-bulk.js";
import { knowledgeDedupe } from "./knowledge-dedupe.js";
import { knowledgeEval } from "./knowledge-eval.js";
import { knowledgeItems } from "./knowledge-items.js";
import { knowledgeSearch } from "./knowledge-search.js";
import { learningDiagnosis } from "./learning-diagnosis.js";
import { members } from "./members.js";
import { mentorApplications } from "./mentor-applications.js";
import { mentorApplicationsDetail } from "./mentor-applications-detail.js";
import { premiumBook } from "./premium-book.js";
import { revenue } from "./revenue.js";
import { revenuePending } from "./revenue-pending.js";
import { revenueServices } from "./revenue-services.js";
import { roles } from "./roles.js";
import { sections } from "./sections.js";
import { selfevalGrant } from "./selfeval-grant.js";
import { selfevalRecover } from "./selfeval-recover.js";
import { selfevalSessions } from "./selfeval-sessions.js";
import { sendMessage } from "./send-message.js";
import { serviceCreditAdjust } from "./service-credit-adjust.js";
import { serviceCreditSummary } from "./service-credit-summary.js";
import { staff } from "./staff.js";
import { tenantOptions } from "./tenant-options.js";
import { tenants } from "./tenants.js";
import { uploads } from "./uploads.js";
import { uploadsPreview } from "./uploads-preview.js";
import { webAnalytics } from "./web-analytics.js";

export const admin = createAdminApp()
  .route("/access-logs", accessLogs)
  .route("/admission", admission)
  .route("/ai-telemetry", aiTelemetry)
  .route("/ai-telemetry-pricing", aiTelemetryPricing)
  .route("/coupons", coupons)
  .route("/growth-grant", growthGrant)
  .route("/growth-recover", growthRecover)
  .route("/growth-reports", growthReports)
  .route("/home-section-copy", homeSectionCopy)
  .route("/inquiry-grant", inquiryGrant)
  .route("/inquiry-recover", inquiryRecover)
  .route("/inquiry-sessions", inquirySessions)
  .route("/invite-member", inviteMember)
  .route("/knowledge-bulk", knowledgeBulk)
  .route("/knowledge-dedupe", knowledgeDedupe)
  .route("/knowledge-eval", knowledgeEval)
  .route("/knowledge-items", knowledgeItems)
  .route("/knowledge-search", knowledgeSearch)
  .route("/learning-diagnosis", learningDiagnosis)
  .route("/members", members)
  .route("/mentor-applications", mentorApplications)
  .route("/mentor-applications", mentorApplicationsDetail)
  .route("/premium-book", premiumBook)
  .route("/revenue", revenue)
  .route("/revenue", revenuePending)
  .route("/revenue", revenueServices)
  .route("/roles", roles)
  .route("/sections", sections)
  .route("/selfeval-grant", selfevalGrant)
  .route("/selfeval-recover", selfevalRecover)
  .route("/selfeval-sessions", selfevalSessions)
  .route("/send-message", sendMessage)
  .route("/service-credit-adjust", serviceCreditAdjust)
  .route("/service-credit-summary", serviceCreditSummary)
  .route("/staff", staff)
  .route("/tenant-options", tenantOptions)
  .route("/tenants", tenants)
  .route("/uploads", uploads)
  .route("/uploads", uploadsPreview)
  .route("/web-analytics", webAnalytics);
