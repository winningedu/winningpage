// 심화탐구 세션 목록 조회 조건. 상태, 검색어, 페이지는 주소 검색 파라미터에 둬서 새로고침과 뒤로가기가 유지된다.
import { INQUIRY_STATUS_OPTIONS } from "./row";

export const INQUIRY_SESSIONS_PAGE_SIZE = 20;

export type InquirySessionsParams = {
  status: string;
  q: string;
  page: number;
  pageSize: number;
};

export function parseInquirySessionsParams(
  searchParams: URLSearchParams,
): InquirySessionsParams {
  const status = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page"));
  return {
    status: (INQUIRY_STATUS_OPTIONS as readonly string[]).includes(status)
      ? status
      : "",
    q: searchParams.get("q") ?? "",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: INQUIRY_SESSIONS_PAGE_SIZE,
  };
}

/** 상태나 검색어를 바꾸면 1페이지로 돌아간다. 빈 값과 1페이지는 주소에 남기지 않는다. */
export function patchInquirySessionsParams(
  prev: URLSearchParams,
  patch: { status?: string; q?: string; page?: number },
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const put = (key: string, value: string) => {
    if (value === "") next.delete(key);
    else next.set(key, value);
  };
  if (patch.status !== undefined) put("status", patch.status);
  if (patch.q !== undefined) put("q", patch.q);
  const page =
    patch.page ??
    (patch.status !== undefined || patch.q !== undefined ? 1 : null);
  if (page !== null) put("page", page <= 1 ? "" : String(page));
  return next;
}
