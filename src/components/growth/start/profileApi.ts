// 시작 화면의 student_profiles 쓰기. RLS 가 본인 insert, update 만 허용한다(20261006035037_student_profiles.sql).
import { supabase } from "@/lib/supabase";
import type { ProfileSavePayload } from "./startLogic";

export type WriteResult = { ok: true } | { ok: false };

export async function saveStudentProfile(
  userId: string,
  payload: ProfileSavePayload,
): Promise<WriteResult> {
  const { error } = await supabase
    .from("student_profiles")
    .upsert({ profile_id: userId, ...payload }, { onConflict: "profile_id" });
  return error ? { ok: false } : { ok: true };
}

/** 새 학년도 승급. 학년과 학기만 바꾸고 나머지 칸은 건드리지 않는다. */
export async function promoteGrade(
  userId: string,
  next: { grade: 2 | 3; semester: 1 },
): Promise<WriteResult> {
  const { error } = await supabase
    .from("student_profiles")
    .update({ grade: `고${next.grade}`, semester: next.semester })
    .eq("profile_id", userId);
  return error ? { ok: false } : { ok: true };
}
