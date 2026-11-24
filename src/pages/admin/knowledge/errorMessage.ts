// 서버 호출 실패를 화면 문구로 바꾼다. ApiError 의 message 는 서버가 준 detail 이다.

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
