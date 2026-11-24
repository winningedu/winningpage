// 프리미엄 책자 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";

// 쓰는 컬럼만 명시하고 나머지는 통과시킨다. premium_book_pages.id 는 identity 정수다.
export const pageSchema = z.looseObject({
  id: z.number(),
  sort_order: z.number(),
  image_url: z.string(),
});
export type PremiumBookPageRow = z.infer<typeof pageSchema>;

const pageListSchema = z.object({ items: z.array(pageSchema) });

export const premiumBookKeys = {
  all: ["admin", "premium-book"] as const,
  list: () => [...premiumBookKeys.all, "list"] as const,
  detail: (id: string) => [...premiumBookKeys.all, "detail", id] as const,
};

const PAGES = "admin/premium-book/pages";

/** 서버가 받는 두 컬럼. 이미지는 임시 읽기 URL 이어도 되고 서버가 저장 때 공개 URL 로 바꾼다. */
export interface PagePayload {
  sort_order: number;
  image_url: string;
}

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
