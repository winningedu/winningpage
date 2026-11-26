// 관리자 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/admin", admin) 으로 붙인다.
// 도메인 하위 앱을 여기서 .route() 로 잇는다. Hono 로 옮긴 경로는 vercel.json 에서 /api/app 진입 함수로 보낸다(api/_routes/app.test.ts 가 본다).

import { createAdminApp } from "../../_lib/hono/admin.js";
import { coupons } from "./coupons.js";
import { me } from "./me.js";
import { students } from "./students.js";

export const admin = createAdminApp()
  .route("/coupons", coupons)
  .route("/me", me)
  .route("/students", students);
