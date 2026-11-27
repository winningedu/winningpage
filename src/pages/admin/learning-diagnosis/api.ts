// 학습진단 화면의 서버 호출. 응답 모양은 서버와 같은 계약(shared/learning-diagnosis/contract.ts)의 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { api } from "@/lib/http/client";
import { toastError } from "@/pages/admin/shared/adminToast";
import {
  type OptionCreateInput,
  type OptionPatchInput,
  optionSchema,
  type ProgramInput,
  programSchema,
  type QuestionInput,
  questionSchema,
} from "../../../../shared/learning-diagnosis/contract.js";

const BASE = "admin/learning-diagnosis";

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
  | { method: "post"; path: "questions"; json: QuestionInput }
  | { method: "patch"; path: `questions/${string}`; json: QuestionInput }
  | { method: "post"; path: "options"; json: OptionCreateInput }
  | { method: "patch"; path: `options/${string}`; json: OptionPatchInput }
  | { method: "post"; path: "programs"; json: ProgramInput }
  | { method: "patch"; path: `programs/${string}`; json: ProgramInput }
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
