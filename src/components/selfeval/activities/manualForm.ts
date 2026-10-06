import {
  AREA_LABELS,
  type Area,
  type HighGrade,
  type ManualInput,
} from "@/lib/selfeval/types";

// 직접 입력 폼 순수 로직(시안 19, 명세 No.26, 102). 필수는 활동명과 과목 또는 영역뿐이고
// 나머지 열 칸은 비워도 된다. 비운 칸은 서버가 분석 단계에서 "비움"으로 다룬다.

export const MANUAL_TEXT_FIELDS = [
  { key: "motive", label: "계기" },
  { key: "concept", label: "교과 개념" },
  { key: "action", label: "한 일" },
  { key: "method", label: "방법" },
  { key: "result", label: "결과와 근거" },
  { key: "role", label: "역할" },
  { key: "limitation", label: "한계" },
  { key: "next", label: "다음 단계" },
] as const;

export type ManualForm = {
  activityName: string;
  subjectOrArea: string;
  gradeLabel: HighGrade | "";
  semester: "1" | "2" | "";
  motive: string;
  concept: string;
  action: string;
  method: string;
  result: string;
  role: string;
  limitation: string;
  next: string;
};

type SessionLike = {
  area: Area | null;
  subject: string | null;
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
};

/** 과목 또는 영역 기본값은 세션의 작성 대상이다. 세션 정보가 없으면 비운다. */
export function initialManualForm(session: SessionLike): ManualForm {
  const subjectOrArea =
    session.area === "subject"
      ? (session.subject ?? "")
      : session.area
        ? AREA_LABELS[session.area]
        : "";
  return {
    activityName: "",
    subjectOrArea,
    gradeLabel: session.gradeLabel ?? "",
    semester: session.semester ? (String(session.semester) as "1" | "2") : "",
    motive: "",
    concept: "",
    action: "",
    method: "",
    result: "",
    role: "",
    limitation: "",
    next: "",
  };
}

export type ManualErrors = Partial<
  Record<"activityName" | "subjectOrArea", string>
>;

export function validateManualForm(form: ManualForm): ManualErrors {
  const errors: ManualErrors = {};
  if (form.activityName.trim() === "") {
    errors.activityName = "활동 이름을 입력해 주세요.";
  }
  if (form.subjectOrArea.trim() === "") {
    errors.subjectOrArea = "과목이나 영역을 입력해 주세요.";
  }
  return errors;
}

export function buildManualInput(form: ManualForm): ManualInput {
  return {
    ...form,
    activityName: form.activityName.trim(),
    subjectOrArea: form.subjectOrArea.trim(),
    gradeLabel: form.gradeLabel === "" ? null : form.gradeLabel,
    semester: form.semester === "" ? null : (Number(form.semester) as 1 | 2),
  };
}
