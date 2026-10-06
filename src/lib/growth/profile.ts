// 성장설계 셸이 쓰는 학생 표시 정보(사이드바 "OO의 성장설계 / 고2").
// 이름은 서버 부트스트랩(/api/growth/survey)에 없어 profiles 본인 행에서 읽는다(Header.tsx 와 같은 소스).
// 값이 없으면 null 이다. 가짜 이름이나 기본 학년을 만들지 않는다.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { growthQueryKeys } from "./queries";

const GRADE_LABELS = ["고1", "고2", "고3", "졸업", "N수"] as const;

/** student_profiles 행(부트스트랩 profile)에서 학년 라벨을 꺼낸다. 알 수 없으면 null. */
export function pickGradeLabel(
  profile: Record<string, unknown> | null,
): string | null {
  const grade = profile?.grade;
  return GRADE_LABELS.find((label) => label === grade) ?? null;
}

/** profiles 본인 행의 이름. 행이 없거나 비어 있거나 조회가 실패하면 null. */
export async function fetchStudentName(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name === "" ? null : name;
}

export function growthProfileNameQuery(userId: string | null) {
  return queryOptions({
    queryKey: growthQueryKeys.profileName(userId),
    queryFn: () => (userId ? fetchStudentName(userId) : Promise.resolve(null)),
    staleTime: 5 * 60_000,
    enabled: !!userId,
    retry: 0,
  });
}
