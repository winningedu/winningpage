// 기본 입력 화면의 student_profiles 쓰기. RLS 가 본인 insert, update 만 허용한다
// (20261006035037_student_profiles.sql). 학년, 학기, 진로, 희망 대학만 올리고 학교 유형과
// 입학 연도는 건드리지 않는다(성장설계 시작 화면의 프로필 폼이 소유한 값이다).
import { supabase } from "@/lib/supabase";
import type { ProfilePayload } from "./basicsLogic";

export type WriteResult = { ok: true } | { ok: false };

export async function saveBasicsProfile(
  userId: string,
  payload: ProfilePayload,
): Promise<WriteResult> {
  const { error } = await supabase
    .from("student_profiles")
    .upsert({ profile_id: userId, ...payload }, { onConflict: "profile_id" });
  return error ? { ok: false } : { ok: true };
}
