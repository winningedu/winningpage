// W9 자료. 학생 목록과 학생 한 명의 코칭 결과를 따로 읽는다(목록이 먼저 와야 처음 열 학생이 정해진다).

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "../api";
import type {
  Coaching,
  ReportView,
  ServiceDetail,
  ServiceKey,
  StudentList,
} from "./types";

/** q 가 있으면 서버가 실명으로 거른 목록이다(학교 관리자 이름 검색, 성과 이름 전체 일치). */
export function useCoachingStudents(q = "") {
  return useQuery({
    queryKey: ["console", "coaching", "students", q],
    queryFn: async () => {
      const res = await consoleRequest(
        `/api/console/coaching/students${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      );
      if (res.status !== 200)
        throw new Error(`coaching students ${res.status}`);
      return res.body as StudentList;
    },
    retry: false,
  });
}

export function useCoaching(studentId: string | null) {
  return useQuery({
    queryKey: ["console", "coaching", studentId],
    enabled: studentId !== null,
    queryFn: async () => {
      const res = await consoleRequest(
        `/api/console/coaching?studentId=${encodeURIComponent(studentId as string)}`,
      );
      if (res.status !== 200) throw new Error(`coaching ${res.status}`);
      return res.body as Coaching;
    },
    retry: false,
  });
}

export function useServiceDetail(studentId: string, service: ServiceKey) {
  return useQuery({
    queryKey: ["console", "coaching", studentId, "service", service],
    queryFn: async () => {
      const res = await consoleRequest(
        `/api/console/coaching/service?studentId=${encodeURIComponent(studentId)}&service=${service}`,
      );
      if (res.status !== 200) throw new Error(`service ${res.status}`);
      return (res.body as { detail: ServiceDetail }).detail;
    },
    retry: false,
  });
}

/** 리포트를 열 때마다 서버가 열람 로그를 남기므로 다시 읽어 오지 않고 캐시도 두지 않는다. */
export function useReport(studentId: string, service: ServiceKey) {
  return useQuery({
    queryKey: ["console", "coaching", studentId, "report", service],
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      const res = await consoleRequest(
        `/api/console/coaching/report?studentId=${encodeURIComponent(studentId)}&service=${service}`,
      );
      if (res.status === 404) return null;
      if (res.status !== 200) throw new Error(`report ${res.status}`);
      return res.body as ReportView;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}
