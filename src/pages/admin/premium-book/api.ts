// 프리미엄 책자 화면의 서버 호출. 응답 모양은 서버와 같은 계약(shared/premium-book/contract.ts)의 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/client";
import {
  type ApplyInput,
  type PageInput,
  type PremiumBookPage,
  pageListSchema,
  pageSchema,
} from "../../../../shared/premium-book/contract.js";

export type PremiumBookPageRow = PremiumBookPage;

export const premiumBookKeys = {
  all: ["admin", "premium-book"] as const,
  list: () => [...premiumBookKeys.all, "list"] as const,
  detail: (id: string) => [...premiumBookKeys.all, "detail", id] as const,
};

const PAGES = "admin/premium-book/pages";

/** 서버가 받는 두 컬럼. 이미지는 임시 읽기 URL 이어도 되고 서버가 저장 때 공개 URL 로 바꾼다. */
export type PagePayload = PageInput;

export function usePageList() {
  return useQuery({
    queryKey: premiumBookKeys.list(),
    queryFn: ({ signal }) => api.get(PAGES, { signal }).json(pageListSchema),
  });
}

/** 한 장. id 가 없으면 요청하지 않는다. 새로고침과 수정 폼이 늘 서버 값을 보도록 캐시하지 않는다. */
export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: premiumBookKeys.detail(id ?? ""),
    enabled: id !== undefined,
    gcTime: 0,
    queryFn: ({ signal }) =>
      api
        .get(`${PAGES}/${encodeURIComponent(id ?? "")}`, { signal })
        .json(pageSchema),
  });
}

/** 등록(id 없음)과 수정. 저장하면 목록을 다시 받는다. */
export function useSavePage(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PagePayload) =>
      id === undefined
        ? api.post(PAGES, { json: payload }).json(pageSchema)
        : api
            .patch(`${PAGES}/${encodeURIComponent(id)}`, { json: payload })
            .json(pageSchema),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: premiumBookKeys.list() }),
  });
}

/**
 * 변환한 PDF 와 페이지 이미지를 한 번에 반영한다. 본문은 POST admin/uploads 가 돌려준 임시 객체 이름이다.
 * 끝나면 목록을 다시 받는다.
 */
export function useApplyBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyInput) =>
      api.post("admin/premium-book/apply", { json: body }).json(pageListSchema),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: premiumBookKeys.list() }),
  });
}

export function useDeletePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${PAGES}/${id}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: premiumBookKeys.list() }),
  });
}
