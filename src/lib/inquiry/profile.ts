// 심화탐구 셸과 정보 입력이 쓰는 학생 표시, 저장 정보.
// 이름은 성장설계와 같은 profiles 본인 행에서 읽는다(growth/profile.ts fetchStudentName 재사용).
// student_profiles 는 RLS 가 본인 insert, update 를 허용하므로 클라이언트가 직접 upsert 한다(부록 C).
import { queryOptions } from "@tanstack/react-query";
import { fetchStudentName } from "@/lib/growth/profile";
import { supabase } from "@/lib/supabase";
import type { GradeLabel, Semester } from "./types";

export type StudentProfileInput = {
  gradeLabel: GradeLabel;
  semester: Semester;
  career: string;
};

export type ProfileWriteResult = { ok: true } | { ok: false };

export async function upsertStudentProfile(
  userId: string,
  input: StudentProfileInput,
): Promise<ProfileWriteResult> {
  const { error } = await supabase.from("student_profiles").upsert(
    {
      profile_id: userId,
      grade: input.gradeLabel,
      semester: input.semester,
      career: input.career,
      updated_by: userId,
    },
    { onConflict: "profile_id" },
  );
  return error ? { ok: false } : { ok: true };
}

export function inquiryProfileNameQuery(userId: string | null) {
  return queryOptions({
    queryKey: ["inquiry", "profile-name", userId] as const,
    queryFn: () => (userId ? fetchStudentName(userId) : Promise.resolve(null)),
    staleTime: 5 * 60_000,
    enabled: !!userId,
    retry: 0,
  });
}
