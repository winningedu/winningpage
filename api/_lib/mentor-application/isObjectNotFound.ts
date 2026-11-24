// createSignedUrl 이 "객체 없음"으로 실패했는지 판정한다.
//
// dev 실측 응답(2026-08-31, HTTP 400):
//   { statusCode: "404", error: "not_found", message: "Object not found", code: "NoSuchKey" }
// supabase-js 는 이걸 StorageError 로 감싸는데 그 클래스가 노출하는 필드는
// message, status(number), statusCode(string) 뿐이라 code 로는 판정할 수 없다.
// statusCode 를 1순위로 보고, 문구 매칭은 스토리지가 필드 구성을 바꿀 때를 대비한 폴백이다.

export function isObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { statusCode, message } = error as {
    statusCode?: unknown;
    message?: unknown;
  };
  if (String(statusCode ?? "") === "404") return true;
  return String(message ?? "")
    .toLowerCase()
    .includes("not found");
}
