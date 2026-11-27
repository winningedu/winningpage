// 관리자 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/admin", admin) 으로 붙인다.
// 도메인 하위 앱을 여기서 .route() 로 잇는다. Hono 로 옮긴 경로는 vercel.json 에서 /api/app 진입 함수로 보낸다(api/_routes/app.test.ts 가 본다).

import { createAdminApp } from "../../_lib/hono/admin.js";
import { accessLogs } from "./access-logs.js";
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
import { me } from "./me.js";
import { members } from "./members.js";
import { mentorApplications } from "./mentor-applications.js";
import { revenue } from "./revenue.js";
import { roles } from "./roles.js";
import { selfevalGrant } from "./selfeval-grant.js";
import { selfevalRecover } from "./selfeval-recover.js";
import { selfevalSessions } from "./selfeval-sessions.js";
import { sendMessage } from "./send-message.js";
import { serviceCreditAdjust } from "./service-credit-adjust.js";
import { serviceCreditSummary } from "./service-credit-summary.js";
import { staff } from "./staff.js";
import { students } from "./students.js";
import { tenantOptions } from "./tenant-options.js";
import { tenants } from "./tenants.js";
import { tenantsDetail } from "./tenants-detail.js";
import { tenantsPurge } from "./tenants-purge.js";
import { tenantsSchoolAdmins } from "./tenants-school-admins.js";
import { tenantsStudents } from "./tenants-students.js";
import { uploads } from "./uploads.js";
import { webAnalytics } from "./web-analytics.js";

export const admin = createAdminApp()
  .route("/coupons", coupons)
  .route("/tenant-options", tenantOptions)
  .route("/send-message", sendMessage)
  .route("/web-analytics", webAnalytics)
  .route("/invite-member", inviteMember)
  .route("/access-logs", accessLogs)
  .route("/ai-telemetry", aiTelemetry)
  .route("/ai-telemetry-pricing", aiTelemetryPricing)
  .route("/service-credit-adjust", serviceCreditAdjust)
  .route("/service-credit-summary", serviceCreditSummary)
  .route("/growth-grant", growthGrant)
  .route("/growth-recover", growthRecover)
  .route("/inquiry-grant", inquiryGrant)
  .route("/inquiry-recover", inquiryRecover)
  .route("/selfeval-grant", selfevalGrant)
  .route("/selfeval-recover", selfevalRecover)
  .route("/knowledge-bulk", knowledgeBulk)
  .route("/knowledge-dedupe", knowledgeDedupe)
  .route("/knowledge-search", knowledgeSearch)
  .route("/mentor-applications", mentorApplications)
  .route("/revenue", revenue)
  .route("/members", members)
  .route("/staff", staff)
  .route("/roles", roles)
  // /tenants 는 글자 그대로인 경로를 가진 앱을 /:id 가 있는 tenantsDetail 보다 먼저 붙인다. 순서가 바뀌면 /:id 의 405 가 그 경로를 가로챈다(api/_routes/admin/tenants.routing.test.ts).
  .route("/tenants", tenants)
  .route("/tenants", tenantsPurge)
  .route("/tenants", tenantsSchoolAdmins)
  .route("/tenants", tenantsStudents)
  .route("/tenants", tenantsDetail)
  .route("/uploads", uploads)
  .route("/growth-reports", growthReports)
  .route("/home-section-copy", homeSectionCopy)
  .route("/inquiry-sessions", inquirySessions)
  .route("/knowledge-eval", knowledgeEval)
  .route("/knowledge-items", knowledgeItems)
  .route("/selfeval-sessions", selfevalSessions)
  .route("/me", me)
  .route("/students", students);
