// Hono 루트 앱의 Vercel 진입 함수(Web 표준 fetch). maxDuration 은 api/router-60.ts 와 같다.
// 어느 경로가 이 함수로 오는지는 vercel.json rewrites 가 정한다(api/_routes/app.test.ts).

import { app } from "./_routes/app.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default { fetch: app.fetch };
