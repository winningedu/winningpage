// 지식 DB 관리 화면의 서버 호출이 돌려주는 결과 모양. 실패해도 던지지 않고 메시지를 담아 돌려준다.

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };
