// 수행평가 영역 앱. 루트 앱(api/_routes/app.ts)이 .route("/api/performance", performance) 로 붙인다.
// 라우트마다 하위 앱을 여기서 .route() 로 잇는다. vercel.json 이 모델을 부르는 경로는 /api/app-60, 나머지는 /api/app 으로 보낸다.
// api/performance/ 아래 크론 함수(cleanup-attachments, embed-session-vectors)는 독립 함수라 여기 없다.

import { baseFactory } from "../../_lib/hono/factory.js";
import { adminEmbed } from "./admin-embed.js";
import { analyzeGuide } from "./analyze-guide.js";
import { bootstrap } from "./bootstrap.js";
import { designReport } from "./design-report.js";
import { discardAttachment } from "./discard-attachment.js";
import { evaluate } from "./evaluate.js";
import { finalize } from "./finalize.js";
import { recommendTopics } from "./recommend-topics.js";
import { reports } from "./reports.js";
import { session } from "./session.js";
import { submission } from "./submission.js";
import { uploadUrl } from "./upload-url.js";

export const performance = baseFactory
  .createApp()
  .route("/admin-embed", adminEmbed)
  .route("/analyze-guide", analyzeGuide)
  .route("/bootstrap", bootstrap)
  .route("/design-report", designReport)
  .route("/discard-attachment", discardAttachment)
  .route("/evaluate", evaluate)
  .route("/finalize", finalize)
  .route("/recommend-topics", recommendTopics)
  .route("/reports", reports)
  .route("/session", session)
  .route("/submission", submission)
  .route("/upload-url", uploadUrl);
