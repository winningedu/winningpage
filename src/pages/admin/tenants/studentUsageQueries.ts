// 스쿨멘토 서비스이용횟수조정의 서버 호출. 실패는 던져서 react-query 가 오류로 받는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/client";
import {
  type PutStudentUsageInput,
  type StudentUsage,
  studentUsageSavedSchema,
  studentUsageSchema,
} from "../../../../shared/tenants/students.js";

export type { StudentUsage };

/** 고친 칸만 담는다. 빠진 열은 서버가 건드리지 않는다. 변경자는 서버가 채운다. */
export type UsageRow = PutStudentUsageInput["rows"][number];

const usageKey = (profileId: string | null) => [
  "admin",
  "student-usage",
  profileId,
];

export function useStudentUsage(profileId: string | null) {
  return useQuery({
    queryKey: usageKey(profileId),
    queryFn: ({ signal }) =>
      api
        .get("admin/tenants/student-usage", {
          searchParams: { profileId: profileId ?? "" },
          signal,
        })
        .json(studentUsageSchema),
    enabled: Boolean(profileId),
  });
}

export function useSaveStudentUsage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rows: UsageRow[]) =>
      api
        .put("admin/tenants/student-usage", { json: { rows } })
        .json(studentUsageSavedSchema),
    // 저장한 값이 화면에 보이도록 보던 학생의 현황을 비우고 스켈레톤 뒤에 다시 읽는다.
    onSettled: () =>
      client.resetQueries({ queryKey: ["admin", "student-usage"] }),
  });
}
