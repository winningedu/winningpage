// Supabase 서명 업로드 주소로 파일을 PUT 하는 브라우저 공용 도우미.
// 토큰이 주소에 들어 있어 Authorization 이 필요 없고, 그래서 api 인스턴스(/api 접두와 bearer)를 쓰지 않는다.

import ky, { isHTTPError, isNetworkError } from "ky";
import { ApiError } from "../http/client";

const FAILED = "파일을 올리지 못했어요.";

export async function putSignedUpload(
  uploadUrl: string,
  file: File,
  options: { cacheControl?: string; signal?: AbortSignal } = {},
): Promise<void> {
  try {
    await ky.put(uploadUrl, {
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "cache-control": `max-age=${options.cacheControl ?? "3600"}`,
      },
      // 재시도는 호출부 몫이고, 큰 파일은 15초 기본 제한에 걸리면 안 된다.
      retry: 0,
      timeout: false,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (isHTTPError(error)) {
      throw new ApiError({
        status: error.response.status,
        code: `HTTP_${error.response.status}`,
        detail: FAILED,
      });
    }
    if (isNetworkError(error)) {
      throw new ApiError({ status: null, code: "NETWORK", detail: FAILED });
    }
    throw error;
  }
}
