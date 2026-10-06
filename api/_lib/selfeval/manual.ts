// 직접 입력 활동(명세 No.26, No.112, §2 13). 학생이 폼으로 쓴 값을 activity_records 행과 11항목 분석으로 바꾼다.

import { extractNumbers } from "./text.js";
import {
  ANALYSIS_FIELDS,
  type Analysis,
  type AnalysisField,
  type HighGrade,
} from "./types.js";

export type ManualInput = {
  activityName: string;
  subjectOrArea: string;
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  motive: string;
  concept: string;
  action: string;
  method: string;
  result: string;
  role: string;
  limitation: string;
  next: string;
};

export type ManualValidation =
  | { ok: true }
  | {
      ok: false;
      code: "ACTIVITY_NAME_REQUIRED" | "SUBJECT_REQUIRED";
      message: string;
    };

export function validateManualInput(input: ManualInput): ManualValidation {
  if (input.activityName.trim() === "") {
    return {
      ok: false,
      code: "ACTIVITY_NAME_REQUIRED",
      message: "활동 이름을 입력해 주세요.",
    };
  }
  if (input.subjectOrArea.trim() === "") {
    return {
      ok: false,
      code: "SUBJECT_REQUIRED",
      message: "과목이나 영역을 입력해 주세요.",
    };
  }
  return { ok: true };
}

const orNull = (s: string): string | null =>
  s.trim() === "" ? null : s.trim();

export type ManualRecordInsert = {
  profile_id: string;
  source_program: "manual";
  status: "draft";
  grade_label: HighGrade | null;
  semester: 1 | 2 | null;
  subject_group: string | null;
  subject: string | null;
  topic: string | null;
  concept: string | null;
  method: string | null;
  result: string | null;
  limitation: string | null;
  numbers: string[];
  sources: string[];
};

export function manualToRecordInsert(
  input: ManualInput,
  profileId: string,
): ManualRecordInsert {
  return {
    profile_id: profileId,
    source_program: "manual",
    status: "draft",
    grade_label: input.gradeLabel,
    semester: input.semester,
    subject_group: orNull(input.subjectOrArea),
    subject: orNull(input.subjectOrArea),
    topic: orNull(input.activityName),
    concept: orNull(input.concept),
    method: orNull(input.method),
    result: orNull(input.result),
    limitation: orNull(input.limitation),
    // 수치는 결과 문장에서만 뽑는다. 따로 입력받지 않는 항목이라 자동 추출이 유일한 경로다.
    numbers: extractNumbers(input.result),
    // 직접 입력은 학생 본인이 출처라 자료 목록이 없다.
    sources: [],
  };
}

export function manualToAnalysis(input: ManualInput): Analysis {
  const raw: Record<AnalysisField, string> = {
    motive: input.motive,
    concept: input.concept,
    action: input.action,
    method: input.method,
    result: input.result,
    role: input.role,
    // 폼에 없는 3항목은 비워 두고 학생이 분석 화면에서 채운다.
    collaboration: "",
    learning: "",
    career: "",
    limitation: input.limitation,
    next: input.next,
  };
  const values = {} as Analysis["values"];
  const sources = {} as Analysis["sources"];
  for (const f of ANALYSIS_FIELDS) {
    values[f] = raw[f];
    sources[f] = raw[f].trim() === "" ? "empty" : "student";
  }
  return { values, sources, conflicts: [] };
}
