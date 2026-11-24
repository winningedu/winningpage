import { hashKey, type QueryKey } from "@tanstack/react-query";
import { useState } from "react";

interface ListQueryState {
  isPending: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
}

// 목록 스켈레톤을 보일지 정한다. 첫 로드와, 지금 키가 활성화된 뒤로 아직 새 응답을 받지 못한
// 재조회(캐시에 있던 키로 돌아온 경우)에는 스켈레톤이다. 이 키가 활성화된 뒤 받은 데이터의
// 창 포커스 재조회와 재조회 없는 선받기 데이터는 행을 그대로 둔다.
export function useListSkeleton(
  query: ListQueryState,
  queryKey: QueryKey,
  activatedAt?: number,
): boolean {
  const hash = hashKey(queryKey);
  const [active, setActive] = useState(() => ({ hash, at: Date.now() }));
  const current = active.hash === hash ? active : { hash, at: Date.now() };
  if (current !== active) setActive(current);
  // 이동 시작 시각을 아는 화면은 그 시각을 활성화 시각으로 쓴다(선받기가 마운트보다 먼저다).
  const at = activatedAt ?? current.at;
  return query.isPending || (query.isFetching && query.dataUpdatedAt < at);
}
