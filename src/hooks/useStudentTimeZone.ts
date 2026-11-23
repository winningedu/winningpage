import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthProvider";
import { goalStudentQueryOptions } from "@/lib/queryClient";

/**
 * 학생 시간대(GET /api/goal/student 의 timeZone). 학생 응답이 오기 전이나 온보딩 전에는
 * undefined 다. 대체 시간대는 없으므로 호출부는 undefined 인 동안 "오늘"을 계산하지 않는다.
 */
export function useStudentTimeZone(): string | undefined {
  const { userId } = useAuth();
  const { data } = useQuery(goalStudentQueryOptions(userId));
  return data?.kind === "onboarded" ? data.student.timeZone : undefined;
}
