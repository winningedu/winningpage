// 학습진단 리포트 영속화 클라이언트 — 읽기(RLS select) 계약.
// QA 시트 행 210. 저장은 서버 채점 API(api/_routes/diagnosis/submit.ts)가 맡는다.
//
// public.diagnosis_reports RLS: 본인(profile_id = auth.uid()) · 승인된 연결의
// 학부모 · 관리자만 select 가능하다. 그래서 여기 함수들은 권한 판정을 따로 하지
// 않는다 — 호출부가 권한 없는 attemptId/profileId 로 조회하면 그냥 빈 결과가
// 돌아온다(에러가 아니다). 화면 쪽 "권한없음" 문구는 그 빈 결과를 보고 판단한다.

import type { Database } from "@/types/database.types";
import { supabase } from "./supabase";

export type DiagnosisReportRow =
  Database["public"]["Tables"]["diagnosis_reports"]["Row"];

/** 목록 화면은 payload(전체 리포트 JSON)를 읽지 않는다 — 카드 하나 그리자고 전체
 * 리포트 JSON을 매번 내려받을 이유가 없다. */
export type DiagnosisReportListItem = Pick<
  DiagnosisReportRow,
  "attempt_id" | "diagnosed_at" | "schema_version"
>;

/** attempt_id(PK)로 리포트 한 건을 읽는다. FreeDiagnosisReport/ChildDiagnosisReport의
 * `:attemptId` 라우트가 쓴다. */
export async function fetchDiagnosisReport(
  attemptId: string,
): Promise<DiagnosisReportRow | null> {
  const { data, error } = await supabase
    .from("diagnosis_reports")
    .select("*")
    .eq("attempt_id", attemptId)
    .maybeSingle();

  if (error) {
    console.warn("[diagnosis-report] 단건 조회 실패:", error.message);
    return null;
  }
  return data ?? null;
}

/** 프로필의 리포트 목록(최신순) — payload 제외. ChildDiagnosisReports, MyDiagnosisReports 목록과 MyServicesTab 이 쓴다. */
export async function listDiagnosisReports(
  profileId: string,
): Promise<DiagnosisReportListItem[]> {
  const { data, error } = await supabase
    .from("diagnosis_reports")
    .select("attempt_id, diagnosed_at, schema_version")
    .eq("profile_id", profileId)
    .order("diagnosed_at", { ascending: false });

  if (error) {
    console.warn("[diagnosis-report] 목록 조회 실패:", error.message);
    return [];
  }
  return data ?? [];
}
