// 브라우저 전용 HTTP 클라이언트. 재시도는 react-query가 맡으므로 ky retry 는 끈다.

import ky from "ky";

export const api = ky.create({
  prefix: "/api",
  timeout: 15_000,
  retry: 0,
});
