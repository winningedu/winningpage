// 브라우저 전용 HTTP 클라이언트. 재시도는 react-query가 맡으므로 ky retry 는 끈다.

import ky from "ky";
import { supabase } from "../supabase";
import { browserTimeZone, isValidTimeZone } from "../time/zone";

export const api = ky.create({
  prefix: "/api",
  timeout: 15_000,
  retry: 0,
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        // 세션이 없으면 헤더만 생략한다. 인증 여부 판단은 서버 몫이다.
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.user && session.access_token)
          request.headers.set(
            "Authorization",
            `Bearer ${session.access_token}`,
          );

        // 호출부가 정한 값이 우선이다. 올바르지 않은 브라우저 값은 서버가 400 으로 막으므로 생략한다.
        const zone = browserTimeZone();
        if (!request.headers.has("X-Time-Zone") && isValidTimeZone(zone))
          request.headers.set("X-Time-Zone", zone);
      },
    ],
  },
});
