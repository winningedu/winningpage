// 브라우저 전용 HTTP 클라이언트. 재시도는 react-query가 맡으므로 ky retry 는 끈다.

import ky from "ky";
import { supabase } from "../supabase";

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
      },
    ],
  },
});
