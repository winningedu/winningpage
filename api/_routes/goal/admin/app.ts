// 목표관리 관리자 앱. goal 영역 앱(api/_routes/goal/app.ts)이 .route("/admin", goalAdmin) 으로 붙인다.
// createAdminApp 이 감사 미들웨어를 한 번 건다. 경로는 vercel.json 에서 /api/app(백필은 /api/app-60)으로 보낸다.

import { createAdminApp } from "../../../_lib/hono/admin.js";
import { cuts } from "./cuts.js";
import { resendReport } from "./resend-report.js";
import { resetStudent } from "./reset-student.js";
import { students } from "./students.js";

export const goalAdmin = createAdminApp()
  .route("/cuts", cuts)
  .route("/resend-report", resendReport)
  .route("/reset-student", resetStudent)
  .route("/students", students);
