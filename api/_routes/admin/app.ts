// 관리자 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/admin", admin) 으로 붙인다.
// 도메인 하위 앱을 여기서 .route() 로 잇는다. Hono 로 옮긴 경로는 vercel.json 에서 /api/app 진입 함수로 보낸다(api/_routes/app.test.ts 가 본다).

import { createAdminApp } from "../../_lib/hono/admin.js";
import { admission } from "./admission.js";
import { coupons } from "./coupons.js";
import { growthReports } from "./growth-reports.js";
import { homeSectionCopy } from "./home-section-copy.js";
import { inquirySessions } from "./inquiry-sessions.js";
import { knowledgeEval } from "./knowledge-eval.js";
import { knowledgeItems } from "./knowledge-items.js";
import { learningDiagnosis } from "./learning-diagnosis.js";
import { mentorApplicationsDetail } from "./mentor-applications-detail.js";
import { premiumBook } from "./premium-book.js";
import { revenuePending } from "./revenue-pending.js";
import { revenueServices } from "./revenue-services.js";
import { sections } from "./sections.js";
import { selfevalSessions } from "./selfeval-sessions.js";
import { uploadsPreview } from "./uploads-preview.js";

export const admin = createAdminApp()
  .route("/admission", admission)
  .route("/coupons", coupons)
  .route("/growth-reports", growthReports)
  .route("/home-section-copy", homeSectionCopy)
  .route("/inquiry-sessions", inquirySessions)
  .route("/knowledge-eval", knowledgeEval)
  .route("/knowledge-items", knowledgeItems)
  .route("/learning-diagnosis", learningDiagnosis)
  .route("/mentor-applications", mentorApplicationsDetail)
  .route("/premium-book", premiumBook)
  .route("/revenue", revenuePending)
  .route("/revenue", revenueServices)
  .route("/sections", sections)
  .route("/selfeval-sessions", selfevalSessions)
  .route("/uploads", uploadsPreview);
