// 목표관리 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/goal", goal) 으로 붙인다.
// 라우트마다 하위 앱을 여기서 .route() 로 잇는다. vercel.json 이 /api/goal 아래 경로를 /api/app(관리자 백필만 /api/app-60)으로 보낸다.

import { baseFactory } from "../../_lib/hono/factory.js";
import { goalAdmin } from "./admin/app.js";
import { advice } from "./advice.js";
import { dailyRecord } from "./daily-record.js";
import { grades } from "./grades.js";
import { intake } from "./intake.js";
import { intakeUpdate } from "./intake-update.js";
import { planTasks } from "./plan-tasks.js";
import { ranking } from "./ranking.js";
import { report } from "./report.js";
import { schedules } from "./schedules.js";
import { student } from "./student.js";
import { timer } from "./timer.js";
import { workbooks } from "./workbooks.js";

export const goal = baseFactory
  .createApp()
  .route("/admin", goalAdmin)
  .route("/advice", advice)
  .route("/daily-record", dailyRecord)
  .route("/grades", grades)
  .route("/intake", intake)
  .route("/intake-update", intakeUpdate)
  .route("/plan-tasks", planTasks)
  .route("/ranking", ranking)
  .route("/report", report)
  .route("/schedules", schedules)
  .route("/student", student)
  .route("/timer", timer)
  .route("/workbooks", workbooks);
