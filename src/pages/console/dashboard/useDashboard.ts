// GET /api/console/dashboard. 조회 조건이 바뀌면 다시 읽는다.

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "../api";

export type ServiceKey =
  | "diagnosis"
  | "goal"
  | "growth"
  | "performance"
  | "selfeval"
  | "inquiry";

export interface DashboardStats {
  asOf: string;
  usage: { usingCount: number; totalCount: number };
  goal: {
    userCount: number;
    average: number | null;
    buckets: { low: number; mid: number; high: number };
  };
  services: { key: ServiceKey; count: number }[];
}

export interface DashboardFilterValue {
  grade: string;
  groupId: string;
  classId: string;
}

function queryString(filter: DashboardFilterValue): string {
  const params = new URLSearchParams();
  if (filter.grade) params.set("grade", filter.grade);
  if (filter.groupId) params.set("groupId", filter.groupId);
  if (filter.classId) params.set("classId", filter.classId);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function useDashboard(filter: DashboardFilterValue) {
  return useQuery({
    queryKey: ["console", "dashboard", filter],
    queryFn: async () => {
      const res = await consoleRequest(
        `/api/console/dashboard${queryString(filter)}`,
      );
      if (res.status !== 200) throw new Error(`dashboard ${res.status}`);
      return res.body as DashboardStats;
    },
    retry: false,
  });
}
