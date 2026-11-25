// 목표관리 학생 현황의 HTTP 호출(/api/goal/admin/...). 행 모양은 컬럼이 많은 뷰라 느슨하게 받고
// 화면이 읽는 필드의 타입은 GoalStudentsAdmin.tsx 가 정한다(검증은 서버 몫).

import { z } from "zod";
import { api } from "@/lib/http/client";
import type {
  GoalDailyRecordRow,
  GoalListRow,
  GoalProbabilityLogRow,
  GoalProfileRow,
  GoalStateRow,
  GoalStudentRow,
  GoalUniversityCutRow,
  ResendReportResult,
} from "./GoalStudentsAdmin";

export type GoalStudentFilter =
  | "all"
  | "awaiting_cuts"
  | "noSubmitToday"
  | "noRecord"
  | "paused";

export type GoalListParams = {
  page: number;
  q: string;
  filter: GoalStudentFilter;
};

const listSchema = z.object({
  items: z.array(z.custom<GoalListRow>()),
  total: z.number(),
  searchTruncated: z.boolean(),
});

const detailSchema = z.object({
  student: z.custom<GoalStudentRow>(),
  state: z.custom<GoalStateRow>().nullable(),
  profile: z.custom<GoalProfileRow>().nullable(),
  logs: z.array(z.custom<GoalProbabilityLogRow>()),
  cuts: z.record(z.string(), z.custom<GoalUniversityCutRow>().nullable()),
});

const recordsSchema = z.object({
  items: z.array(z.custom<GoalDailyRecordRow>()),
  total: z.number(),
});

const resendSchema = z.custom<ResendReportResult>();

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
    .json(listSchema);
}

export function fetchGoalStudentDetail(id: string, signal?: AbortSignal) {
  return api.get(one(id), signal ? { signal } : {}).json(detailSchema);
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
    .json(recordsSchema);
}

export function resendGoalReport(body: {
  studentProfileId: string;
  kind: string;
  periodKey: string;
}) {
  return api
    .post("goal/admin/resend-report", { json: body })
    .json(resendSchema);
}

export async function resetGoalStudent(profileId: string) {
  await api.post("goal/admin/reset-student", { json: { profileId } });
}
