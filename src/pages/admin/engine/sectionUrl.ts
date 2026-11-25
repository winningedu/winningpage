// 엔진 섹션의 주소 규칙. 화면 모양(목록, 등록, 수정)과 목록 상태(쪽, 검색어, 필터)를 주소로 옮기고 읽는다.

import {
  DEFAULT_REVIEW_STALE_MONTHS,
  REVIEW_STALE_MONTH_OPTIONS,
  type ReviewStaleMonths,
} from "../knowledge/review/cycle";
import { parseListPageAndQ } from "./sectionList";

export type SectionView =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "edit"; id: string };

export function sectionPath(
  key: string,
  view?: "new" | { id: string | number },
) {
  const base = `/admin/${key}`;
  if (view === undefined) return base;
  if (view === "new") return `${base}/new`;
  return `${base}/${encodeURIComponent(String(view.id))}`;
}

// 라우트 표(adminRoutes)가 정한 모양을 경로에서 되읽는다. 섹션 화면은 어느 라우트로 왔는지 모르고 경로만 안다.
export function parseSectionView(pathname: string, key: string): SectionView {
  const base = sectionPath(key);
  if (!pathname.startsWith(base)) return { kind: "list" };
  const rest = pathname.slice(base.length).replace(/\/+$/, "");
  if (rest === "/new") return { kind: "new" };
  const match = /^\/([^/]+)$/.exec(rest);
  if (!match?.[1]) return { kind: "list" };
  try {
    return { kind: "edit", id: decodeURIComponent(match[1]) };
  } catch {
    return { kind: "list" };
  }
}

export type ListUrlState = {
  page: number;
  q: string;
  filter: string;
  stale: boolean;
  months: ReviewStaleMonths;
};

// 알아볼 수 없는 값은 없는 것으로 친다(기본값). 기본값은 주소에 쓰지 않는다.
export function parseListSearch(params: URLSearchParams): ListUrlState {
  const months = Number(params.get("months"));
  return {
    ...parseListPageAndQ(params),
    filter: params.get("filter") ?? "",
    stale: params.get("stale") === "1",
    months:
      REVIEW_STALE_MONTH_OPTIONS.find((option) => option === months) ??
      DEFAULT_REVIEW_STALE_MONTHS,
  };
}

export function withListState(
  prev: URLSearchParams,
  patch: Partial<ListUrlState>,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const put = (name: string, value: string, isDefault: boolean) => {
    if (isDefault) next.delete(name);
    else next.set(name, value);
  };
  if (patch.page !== undefined)
    put("page", String(patch.page), patch.page === 1);
  if (patch.q !== undefined) put("q", patch.q, patch.q === "");
  if (patch.filter !== undefined)
    put("filter", patch.filter, patch.filter === "");
  if (patch.stale !== undefined) put("stale", "1", !patch.stale);
  if (patch.months !== undefined)
    put(
      "months",
      String(patch.months),
      patch.months === DEFAULT_REVIEW_STALE_MONTHS,
    );
  return next;
}
