// 학습진단 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { api } from "@/lib/http/client";
import { toastError } from "@/pages/admin/shared/adminToast";

const BASE = "admin/learning-diagnosis";

// 쓰는 컬럼만 명시하고 나머지는 통과시킨다. 컬럼 대부분이 nullable 이라 화면이 읽을 때 좁힌다.
const questionSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  input_type: z.string(),
  is_required: z.boolean().nullable(),
  is_active: z.boolean().nullable(),
  sort_order: z.number().nullable(),
});
export type QuestionRow = z.infer<typeof questionSchema>;

const optionSchema = z.looseObject({
  id: z.string(),
  question_id: z.string().nullable(),
  label: z.string().nullable(),
  program_ids: z.unknown(),
  is_active: z.boolean().nullable(),
  sort_order: z.number().nullable(),
});
export type OptionRow = z.infer<typeof optionSchema>;

const programSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  badge: z.string().nullable(),
  description: z.string().nullable(),
  primary_button_text: z.string().nullable(),
  primary_button_link: z.string().nullable(),
  secondary_button_text: z.string().nullable(),
  secondary_button_link: z.string().nullable(),
  icon: z.string().nullable(),
  is_active: z.boolean().nullable(),
  sort_order: z.number().nullable(),
});
export type ProgramRow = z.infer<typeof programSchema>;

const keys = {
  all: ["admin", "learning-diagnosis"] as const,
  list: (name: string) => [...keys.all, name] as const,
};

function useList<T extends z.ZodType>(name: string, item: T) {
  const schema = z.object({ items: z.array(item) });
  return useQuery({
    queryKey: keys.list(name),
    queryFn: ({ signal }) =>
      api.get(`${BASE}/${name}`, { signal }).json(schema),
  });
}

/** 세 목록. 새로고침과 쓰기 뒤에 같은 키로 다시 받는다. */
export function useDiagnosisLists() {
  const questions = useList("questions", questionSchema);
  const options = useList("options", optionSchema);
  const programs = useList("programs", programSchema);
  return {
    questions,
    options,
    programs,
    refetchAll: () =>
      Promise.all([questions.refetch(), options.refetch(), programs.refetch()]),
  };
}

export type DiagnosisWrite =
  | { method: "post"; path: string; json: unknown }
  | { method: "patch"; path: string; json: unknown }
  | { method: "delete"; path: string };

/** 등록, 수정, 삭제 한 가지로 모은 쓰기. 끝나면 세 목록을 다시 받는다. */
export function useDiagnosisWrite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (write: DiagnosisWrite) => {
      const path = `${BASE}/${write.path}`;
      if (write.method === "delete") {
        await api.delete(path);
        return;
      }
      await api[write.method](path, { json: write.json }).json(
        z.looseObject({}),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

/** 실패는 콘솔에 남기고 화면에는 서버 원문 없이 공통 문구만 올린다. */
export function reportDiagnosisError(label: string, error: unknown) {
  console.error(label, error);
  toastError(label, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

/** 조회 실패를 한 번 알린다. */
export function useLoadErrorToast(error: unknown) {
  useEffect(() => {
    if (error) reportDiagnosisError("학습진단 데이터 조회 실패", error);
  }, [error]);
}
