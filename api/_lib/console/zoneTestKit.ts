// 보는 사람의 시간대(X-Time-Zone 헤더)를 실어 핸들러를 부르는 테스트 도우미. 테스트 파일에서만 import 한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

/** zone 이 null 이면 헤더 없이 부른다(TIME_ZONE_REQUIRED 확인용). */
export function withTimeZone(handler: Handler, zone: string | null): Handler {
  return (req, res) =>
    handler(
      zone === null
        ? req
        : ({
            ...req,
            headers: { ...req.headers, "x-time-zone": zone },
          } as unknown as VercelRequest),
      res,
    );
}
