// W9 자료. 학생 목록과 학생 한 명의 코칭 결과를 따로 읽는다(목록이 먼저 와야 처음 열 학생이 정해진다).

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "../api";
import type { Coaching, StudentList } from "./types";

/** q 가 있으면 서버가 실명 부분 일치로 거른 목록이다(학교 관리자 이름 검색). */
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
