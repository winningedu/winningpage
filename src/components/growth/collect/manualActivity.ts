// 활동 직접 입력(시안 646:3001, 명세 No.41). 본인 manual 행은 RLS 로 insert, update, delete 가 허용된다
// (supabase/migrations/20261006035047_activity_records.sql). source_program manual 은 status 가
// planned 또는 draft 여야 해서 draft 로 넣는다. 집계와 판정은 서버 summary 가 다시 계산한다.
import type { HighGrade } from "@/lib/growth/api";
import { supabase } from "@/lib/supabase";

export const GRADE_OPTIONS: readonly HighGrade[] = ["고1", "고2", "고3"];
export const SEMESTER_OPTIONS = ["1", "2"] as const;

export type ManualForm = {
  gradeLabel: HighGrade | "";
  semester: "1" | "2" | "";
  subjectGroup: string;
  topic: string;
  concept: string;
  method: string;
  result: string;
  limitation: string;
};

export const EMPTY_MANUAL_FORM: ManualForm = {
  gradeLabel: "",
  semester: "",
  subjectGroup: "",
  topic: "",
  concept: "",
  method: "",
  result: "",
  limitation: "",
};

export type ManualValue = {
  gradeLabel: HighGrade;
  semester: 1 | 2;
  subjectGroup: string;
  topic: string;
  concept: string | null;
  method: string | null;
  result: string | null;
  limitation: string | null;
};

export type ManualField = keyof ManualForm;

const MAX_SHORT = 100;
const MAX_LONG = 1000;

const REQUIRED_MESSAGE: Partial<Record<ManualField, string>> = {
  gradeLabel: "학년을 골라 주세요.",
  semester: "학기를 골라 주세요.",
  subjectGroup: "과목 또는 영역을 적어 주세요.",
  topic: "주제를 적어 주세요.",
};

export function validateManualForm(
  form: ManualForm,
):
  | { ok: true; value: ManualValue }
  | { ok: false; errors: Partial<Record<ManualField, string>> } {
  const errors: Partial<Record<ManualField, string>> = {};
  const text = (field: ManualField) => form[field].trim();

  for (const [field, message] of Object.entries(REQUIRED_MESSAGE) as [
    ManualField,
    string,
  ][]) {
    if (text(field) === "") errors[field] = message;
  }
  const limits: [ManualField, number][] = [
    ["subjectGroup", MAX_SHORT],
    ["topic", MAX_SHORT],
    ["concept", MAX_LONG],
    ["method", MAX_LONG],
    ["result", MAX_LONG],
    ["limitation", MAX_LONG],
  ];
  for (const [field, max] of limits) {
    if (!errors[field] && text(field).length > max) {
      errors[field] = `${max}자까지 적을 수 있어요.`;
    }
  }
  if (
    Object.keys(errors).length > 0 ||
    form.gradeLabel === "" ||
    form.semester === ""
  ) {
    return { ok: false, errors };
  }
  const optional = (field: ManualField) => text(field) || null;
  return {
    ok: true,
    value: {
      gradeLabel: form.gradeLabel,
      semester: form.semester === "1" ? 1 : 2,
      subjectGroup: text("subjectGroup"),
      topic: text("topic"),
      concept: optional("concept"),
      method: optional("method"),
      result: optional("result"),
      limitation: optional("limitation"),
    },
  };
}

export type MutationResult = { ok: true } | { ok: false; message: string };

export async function insertManualActivity(
  profileId: string,
  value: ManualValue,
): Promise<MutationResult> {
  const { error } = await supabase.from("activity_records").insert({
    profile_id: profileId,
    source_program: "manual",
    status: "draft",
    grade_label: value.gradeLabel,
    semester: value.semester,
    subject_group: value.subjectGroup,
    topic: value.topic,
    concept: value.concept,
    method: value.method,
    result: value.result,
    limitation: value.limitation,
  });
  if (error) {
    return {
      ok: false,
      message: "활동을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    };
  }
  return { ok: true };
}

export async function deleteManualActivity(
  id: string,
): Promise<MutationResult> {
  const { error } = await supabase
    .from("activity_records")
    .delete()
    .eq("id", id)
    .eq("source_program", "manual");
  if (error) {
    return {
      ok: false,
      message: "활동을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    };
  }
  return { ok: true };
}
