// 멘토 신청 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { api } from "@/lib/http/client";
import { toastError } from "@/pages/admin/shared/adminToast";
import {
  type ApplicationStatusInput,
  proofUrlSchema,
} from "../../../../shared/mentor-application/detail.js";

// 쓰는 컬럼만 명시하고 나머지는 통과시킨다.
const applicationSchema = z.looseObject({
  id: z.string(),
  status: z.string().nullish(),
  proof_file_path: z.string().nullish(),
  proof_file_name: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type MentorApplicationRow = z.infer<typeof applicationSchema>;

const listSchema = z.object({ items: z.array(applicationSchema) });

export const keys = {
  all: ["admin", "mentor-applications"] as const,
  list: () => [...keys.all, "list"] as const,
  detail: (id: string) => [...keys.all, "detail", id] as const,
};

const BASE = "admin/mentor-applications";

export function useMentorApplicationList() {
  return useQuery({
    queryKey: keys.list(),
    queryFn: ({ signal }) => api.get(BASE, { signal }).json(listSchema),
  });
}

/** 신청 한 건. 새로고침과 상세가 늘 서버 값을 보도록 캐시하지 않는다. */
export function useMentorApplication(id: string) {
  return useQuery({
    queryKey: keys.detail(id),
    gcTime: 0,
    queryFn: ({ signal }) =>
      api
        .get(`${BASE}/${encodeURIComponent(id)}`, { signal })
        .json(applicationSchema),
  });
}

/** 목록을 비우고 다시 받는다. 사용자가 직접 누른 초기화는 옛 행 대신 스켈레톤을 거친다. */
export function useResetMentorList() {
  const queryClient = useQueryClient();
  return () => queryClient.resetQueries({ queryKey: keys.list() });
}

/** 상태 저장. 끝나면 목록과 상세를 비우고 다시 받아 스켈레톤 뒤에 새 값을 보인다. */
export function useSaveMentorStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: ApplicationStatusInput["status"]) =>
      api
        .patch(`${BASE}/${encodeURIComponent(id)}`, {
          json: { status } satisfies ApplicationStatusInput,
        })
        .json(applicationSchema),
    onSuccess: () => queryClient.resetQueries({ queryKey: keys.all }),
  });
}

/** 증빙 파일 60초 서명 URL. */
export function useMentorProofUrl(id: string) {
  return useMutation({
    mutationFn: () =>
      api
        .post(`${BASE}/${encodeURIComponent(id)}/proof-url`)
        .json(proofUrlSchema),
  });
}

/** 실패는 콘솔에 남기고 화면에는 서버 원문 없이 공통 문구만 올린다. */
export function reportMentorError(label: string, error: unknown) {
  console.error(label, error);
  toastError(label, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

/** 조회 실패를 한 번 알린다. */
export function useLoadErrorToast(label: string, error: unknown) {
  useEffect(() => {
    if (error) reportMentorError(label, error);
  }, [label, error]);
}
