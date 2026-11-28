// 목표관리 학생 현황의 HTTP 호출(/api/goal/admin/...). 요청, 응답 스키마는 서버와 같은 계약(shared/goal/admin-students.ts)을 쓴다.
// 행은 컬럼이 많은 뷰라 계약이 화면이 읽는 필드만 적고 나머지는 열어 둔다.

import { api } from "@/lib/http/client";
import {
  type GoalListParams,
  goalRecordsResponse,
  goalStudentDetailResponse,
  goalStudentsResponse,
  resendReportResponse,
} from "../../../../shared/goal/admin-students.js";

export type {
  GoalListParams,
  GoalStudentFilter,
} from "../../../../shared/goal/admin-students.js";

export const goalStudentKeys = {
  all: ["admin", "goalStudents"] as const,
  list: (params: GoalListParams) =>
    [...goalStudentKeys.all, "list", params] as const,
  detail: (id: string) => [...goalStudentKeys.all, "detail", id] as const,
  records: (id: string, limit: number) =>
    [...goalStudentKeys.all, "records", id, limit] as const,
};

const one = (id: string) => `goal/admin/students/${encodeURIComponent(id)}`;

export function fetchGoalStudents(
  params: GoalListParams,
  signal?: AbortSignal,
) {
  return api
    .get("goal/admin/students", {
      searchParams: { page: params.page, q: params.q, filter: params.filter },
      ...(signal ? { signal } : {}),
    })
    .json(goalStudentsResponse);
}

export function fetchGoalStudentDetail(id: string, signal?: AbortSignal) {
  return api
    .get(one(id), signal ? { signal } : {})
    .json(goalStudentDetailResponse);
}

export function fetchGoalStudentRecords(
  id: string,
  limit: number,
  signal?: AbortSignal,
) {
  return api
    .get(`${one(id)}/records`, {
      searchParams: { limit },
      ...(signal ? { signal } : {}),
    })
    .json(goalRecordsResponse);
}

export function resendGoalReport(body: {
  studentProfileId: string;
  kind: string;
  periodKey: string;
}) {
  return api
    .post("goal/admin/resend-report", { json: body })
    .json(resendReportResponse);
}

export async function resetGoalStudent(profileId: string) {
  await api.post("goal/admin/reset-student", { json: { profileId } });
}
