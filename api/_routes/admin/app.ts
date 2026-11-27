// 관리자 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/admin", admin) 으로 붙인다.
// 도메인 하위 앱을 여기서 .route() 로 잇는다. Hono 로 옮긴 경로는 vercel.json 에서 /api/app 진입 함수로 보낸다(api/_routes/app.test.ts 가 본다).

import { createAdminApp } from "../../_lib/hono/admin.js";
import { coupons } from "./coupons.js";
import { tenants } from "./tenants.js";
import { tenantsPurge } from "./tenants-purge.js";
import { tenantsSchoolAdmins } from "./tenants-school-admins.js";
import { tenantsStudents } from "./tenants-students.js";

// /tenants 는 글자 그대로인 경로를 가진 앱을 /:id 가 있는 tenants 보다 먼저 붙인다. 순서가 바뀌면 /:id 의 405 가 그 경로를 가로챈다(api/_routes/admin/tenants.routing.test.ts).
export const admin = createAdminApp()
  .route("/coupons", coupons)
  .route("/tenants", tenantsPurge)
  .route("/tenants", tenantsSchoolAdmins)
  .route("/tenants", tenantsStudents)
  .route("/tenants", tenants);
