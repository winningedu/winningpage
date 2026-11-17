// 가입 라우트 테스트용 호출 도구. 테스트 파일에서만 import 한다.
// 가짜 service_role 클라이언트는 consoleTestKit 것을 그대로 쓴다. 요청 IP 는 x-forwarded-for 로
// 넘기고, 토큰이 필요한 라우트는 headers 에 authorization 을 직접 넣는다(기본값은 토큰 없음).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Captured } from "../console/consoleTestKit.js";

export async function callSignup(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  body: unknown,
  headers: Record<string, string> = { "x-forwarded-for": "9.9.9.9" },
): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined, headers: {} };
  const res = {
    setHeader: (key: string, value: string) => {
      captured.headers[key] = value;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    { method: "POST", headers, body } as unknown as VercelRequest,
    res,
  );
  return captured;
}
