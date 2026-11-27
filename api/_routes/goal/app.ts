// 목표관리 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/goal", goal) 으로 붙인다.
// 라우트마다 하위 앱을 여기서 .route() 로 잇는다. Hono 로 옮긴 경로는 vercel.json 에서 /api/app 진입 함수로 보낸다(api/_routes/app.test.ts 가 본다).

import { baseFactory } from "../../_lib/hono/factory.js";
import { goalAdmin } from "./admin/app.js";

export const goal = baseFactory.createApp().route("/admin", goalAdmin);
