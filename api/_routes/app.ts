// 서비스 루트 Hono 앱. 진입 함수 api/app.ts, app-30.ts, app-60.ts 가 이 앱의 fetch 를 내보낸다.
// 공통 층(원문 경로 검사, 요청 로그, JSON charset, notFound, onError)은 createRootApp 이 걸고, 영역 앱은 .route() 로 붙인다.

import { createRootApp } from "../_lib/hono/root.js";
import { admin } from "./admin/app.js";
import { goal } from "./goal/app.js";
import { performance } from "./performance/app.js";
import { selfeval } from "./selfeval/app.js";

export const app = createRootApp()
  .route("/api/admin", admin)
  .route("/api/goal", goal)
  .route("/api/performance", performance)
  .route("/api/selfeval", selfeval);
