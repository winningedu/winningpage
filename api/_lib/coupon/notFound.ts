// 쿠폰 라우트 공통 404 응답.

import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";

export function sendNotFound(res: VercelResponse, what: string): void {
  sendError(res, "problem", 404, `${what}을 찾을 수 없어요.`, "NOT_FOUND");
}
