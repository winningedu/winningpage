// 엔진 목록 이동의 시작 시각. 라우트 미들웨어(선받기)와 Admin.tsx 가 같은 값을 본다.
// 가볍게 유지한다: 미들웨어가 초기 번들에서 import 하므로 React 컴포넌트를 끌어오지 않는다.

import {
  hashKey,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { sectionListQueryOptions } from "./sectionList";

const startedAt = new Map<string, number>();
let mountedHash: string | null = null;

/** 이 목록 키의 이번 이동이 시작된 시각. 미들웨어를 거치지 않았으면 undefined. */
export function listNavigationStartedAt(queryKey: QueryKey) {
  return startedAt.get(hashKey(queryKey));
}

/** 목록 화면이 이 키로 떠 있는 동안 등록한다. 돌려주는 함수로 해제한다. */
export function registerMountedList(queryKey: QueryKey) {
  const hash = hashKey(queryKey);
  mountedHash = hash;
  return () => {
    if (mountedHash === hash) mountedHash = null;
  };
}

/**
 * 목록 이동을 시작한다. 이번 이동이 시작된 뒤에 받은 데이터만 새것으로 보고, 그보다 오래된
 * 캐시는 다시 받는다(진행 중인 요청은 한 번만 나간다). 이미 그 키로 목록 화면이 떠 있으면
 * (필터 같은 주소 변경) 같은 이동으로 보고 시작 시각을 올리지 않아 다시 받지 않는다.
 */
export function startListNavigation(
  client: QueryClient,
  options: ReturnType<typeof sectionListQueryOptions>,
) {
  const hash = hashKey(options.queryKey);
  if (mountedHash !== hash) startedAt.set(hash, Date.now());
  const at = startedAt.get(hash);
  void client
    .query({
      ...options,
      staleTime: (query) =>
        at !== undefined && query.state.dataUpdatedAt < at ? 0 : Infinity,
    })
    .catch(() => {});
}
