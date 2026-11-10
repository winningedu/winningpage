// 멘토 지원서 폼 컨테이너 — docs/mentor-apply-spec.md §6(6-1 ~ 6-8) / § 폼 명세.
//
// 이 파일이 지는 책임은 네 가지다.
//   ① 폼 상태 단일 소유   — 5개 섹션 컴포넌트는 전부 `{ values, errors, onChange }` 만 받는
//                            제어 컴포넌트라 값을 들고 있는 곳이 정확히 한 군데여야 한다.
//                            폼 라이브러리는 도입하지 않는다(저장소 관례: PremiumApply.jsx:52
//                            `updateField(key, value)`, MyPage.jsx:205 `updateForm`).
//   ② 진행률 사이드바 연동 — 각 섹션이 named export 한 필수 필드 목록을 모아 ProgressSidebar 에
//                            넘긴다. 필수 목록을 이 파일이 새로 쓰지 않는 이유는, 필드가 추가·삭제될
//                            때 섹션 파일과 여기가 어긋나면 카운터만 조용히 틀리기 때문이다.
//   ③ 제출 전 클라이언트 검증 — 섹션 1~3 은 각 파일이 export 한 validate*Section 을 그대로 쓰고,
//                            섹션 4·5 는 검증 함수가 없어 이 파일에서 만든다(아래 사유 주석 참고).
//   ④ 제출 + 결과 처리     — 첨부파일은 2단계 signed upload 로, 나머지 필드는 application/json 으로
//                            보낸다(아래 「제출」 섹션 주석 참고. api/_routes/mentor-apply.js 클라이언트
//                            호출 규약 주석은 이전 base64 단일 요청 방식이라 이 부분만 최신이 아니다 —
//                            그 파일은 API 담당이 갱신 중이다).
//
// ⚠ 필드 name = DB 컬럼(sql/52_mentor_applications.sql) = API 본문 키다. 화면용 camelCase 로
//    바꾸는 순간 제출 직전에 매핑 테이블이 하나 생기고 그게 곧 오타 발원지가 된다 —
//    섹션 컴포넌트들이 이미 snake_case 로 통일해 두었으므로 여기서도 그대로 흘려보낸다.
//
// ⚠ 완료 화면은 **시안에 존재하지 않는다.** 별도 라우트를 만들지 않고 폼 자리를 인라인 완료
//    메시지로 치환한다(지시 사항). 카피도 시안 부재라 파생이며 아래 COMPLETION_COPY 에 모아
//    TODO 로 표시해 두었다.
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { MENTOR_HEADING_LG } from "@/components/services/serviceTokens";
import { FORM_HEADER, PROGRESS_SIDEBAR } from "@/data/mentorApply";
import {
  formatPhoneInput,
  isValidMobile,
  normalizePhone,
} from "@/lib/phoneVerification";
import { supabase } from "@/lib/supabase";
import { isWithinMaxLength } from "@/lib/validators";
import FormSectionApplicant, {
  APPLICANT_FIELDS,
  APPLICANT_REQUIRED_FIELDS,
  APPLICANT_SECTION_ID,
  validateApplicantSection,
} from "./FormSectionApplicant";
import FormSectionCompetency, {
  COMPETENCY_FIELD_NAMES,
  COMPETENCY_MAX_LENGTHS,
  COMPETENCY_MULTI_FIELD_NAMES,
  COMPETENCY_REQUIRED_FIELD_NAMES,
  COMPETENCY_SECTION_ID,
} from "./FormSectionCompetency";
import FormSectionDocuments, {
  DOCUMENTS_AGREEMENT_KEYS,
  DOCUMENTS_REQUIRED_AGREEMENT_KEYS,
  DOCUMENTS_SECTION_ID,
} from "./FormSectionDocuments";
import FormSectionHighschool, {
  HIGHSCHOOL_FIELDS,
  HIGHSCHOOL_REQUIRED_FIELDS,
  HIGHSCHOOL_SECTION_ID,
  validateHighschoolSection,
} from "./FormSectionHighschool";
import FormSectionUniversity, {
  UNIVERSITY_FIELDS,
  UNIVERSITY_REQUIRED_FIELDS,
  UNIVERSITY_SECTION_ID,
  validateUniversitySection,
} from "./FormSectionUniversity";
import { MENTOR_FORM_ANCHOR_ID } from "./MentorHero";
import ProgressSidebar from "./ProgressSidebar";

// ---------------------------------------------------------------------------
// 폼 전체 상태 타입 — 5개 섹션이 공유하는 단일 정본이다(파일 상단 ① 폼 상태 단일 소유 참고).
// 텍스트/단일선택 필드는 string, 칩 복수선택 2종(consult_fields/consult_grades)만 string[] 이다.
// ---------------------------------------------------------------------------

type MentorApplyValues = {
  // 1. 지원자 정보
  name: string;
  birth_date: string;
  // QA 지시(2026-08-21) 추가 필드. DB 컬럼·서버 화이트리스트 배선까지 끝났다
  // (supabase/migrations/20260821000006_mentor_apply_gender.sql, api/_routes/mentor-apply.ts
  // FIELD_SPECS) — 다른 필드와 동일하게 `...values` 스프레드로 그대로 제출된다.
  gender: string;
  phone: string;
  email: string;
  residence_region: string;
  // 2. 대학 및 합격 전형
  university: string;
  major: string;
  admission_year: string;
  enrollment_status: string;
  admission_history: string;
  final_admission_track: string;
  exam_results: string;
  // 3. 출신 고등학교
  highschool_region: string;
  highschool_name: string;
  highschool_type: string;
  gpa_average: string;
  csat_summary: string;
  // 4. 멘토 역량 — 복수선택 2종만 배열이다(COMPETENCY_MULTI_FIELD_NAMES).
  consult_fields: string[];
  strongest_field_reason: string;
  consult_grades: string[];
  weekly_capacity: string;
  available_timeslot: string;
  motivation: string;
  strengths: string;
  ineffective_method: string;
  situation_answer: string;
  tutoring_experience: string;
};

// 업로드가 끝난 파일과 그 Storage 경로 짝 — 재시도 시 재사용 여부 판정에 쓴다.
type UploadedProof = { file: File; path: string };

// ---------------------------------------------------------------------------
// 초기 상태
// ---------------------------------------------------------------------------

// 텍스트/단일선택은 '', 복수선택 칩은 [] 로 시작한다. `undefined` 로 두면 첫 입력에서
// 비제어→제어 전환 경고가 나고, ProgressSidebar.isFieldFilled 의 판정도 흔들린다.
const INITIAL_VALUES: MentorApplyValues = Object.freeze({
  // 1. 지원자 정보
  name: "",
  birth_date: "",
  gender: "",
  phone: "",
  email: "",
  residence_region: "",
  // 2. 대학 및 합격 전형
  university: "",
  major: "",
  admission_year: "",
  enrollment_status: "",
  admission_history: "",
  final_admission_track: "",
  exam_results: "",
  // 3. 출신 고등학교
  highschool_region: "",
  highschool_name: "",
  highschool_type: "",
  gpa_average: "",
  csat_summary: "",
  // 4. 멘토 역량 — 복수선택 2종만 배열이다(COMPETENCY_MULTI_FIELD_NAMES).
  consult_fields: [],
  strongest_field_reason: "",
  consult_grades: [],
  weekly_capacity: "",
  available_timeslot: "",
  motivation: "",
  strengths: "",
  ineffective_method: "",
  situation_answer: "",
  tutoring_experience: "",
});

const INITIAL_AGREEMENTS: Record<string, boolean> = Object.freeze(
  Object.fromEntries(DOCUMENTS_AGREEMENT_KEYS.map((key) => [key, false])),
);

// ---------------------------------------------------------------------------
// 검증 — 섹션 4·5
//
// 섹션 1~3 은 각 파일이 `validate*Section(values)` 를 export 하지만 섹션 4·5 는 없다.
// 섹션 4 는 규칙이 "필수 여부 + 글자수 상한" 두 가지뿐이라 필드별 분기가 필요 없고
// (COMPETENCY_REQUIRED_FIELD_NAMES / COMPETENCY_MAX_LENGTHS 두 상수로 전부 표현된다),
// 섹션 5 는 값이 `values` 가 아니라 file/phoneVerified/agreements 라는 별도 상태에 있어
// `validate(values)` 시그니처로는 표현 자체가 불가능하다. 그래서 여기서 만든다.
//
// ⚠ [시안 부재 — 파생 카피] 에러 상태가 시안에 없다(명세 §6-6 / 확인 항목 ㉕).
//    아래 문구는 섹션 1~3 의 ERROR_MESSAGES 어투에 맞춘 잠정값이다. 다만 섹션 1~3 이
//    `이름을 입력해 주세요.` 처럼 라벨을 문장에 넣는 것과 달리, 여기서는 라벨을 넣지 않는다 —
//    라벨 원문은 FormSectionCompetency.jsx 가 소유하고 있어 여기에 다시 적으면 카피가
//    두 벌이 되고 한쪽만 고쳐지는 드리프트가 생긴다.
// ---------------------------------------------------------------------------

const COMPETENCY_ERROR_MESSAGES = {
  // 칩 복수선택 2종
  multi: "하나 이상 선택해 주세요.",
  // 셀렉트 2종
  select: "선택해 주세요.",
  // 텍스트에어리어
  text: "입력해 주세요.",
  tooLong: (max: number) => `${max}자 이내로 입력해 주세요.`,
};

const COMPETENCY_SELECT_FIELDS = ["weekly_capacity", "available_timeslot"];

function validateCompetencySection(values: Partial<MentorApplyValues> = {}) {
  const errors: Record<string, string> = {};

  COMPETENCY_FIELD_NAMES.forEach((name) => {
    const value = values[name as keyof MentorApplyValues];
    const isRequired = COMPETENCY_REQUIRED_FIELD_NAMES.includes(name);
    const max = (COMPETENCY_MAX_LENGTHS as Record<string, number>)[name];

    if (COMPETENCY_MULTI_FIELD_NAMES.includes(name)) {
      if (isRequired && !(Array.isArray(value) && value.length > 0)) {
        errors[name] = COMPETENCY_ERROR_MESSAGES.multi;
      }
      return;
    }

    const text = String(value ?? "").trim();

    if (isRequired && !text) {
      errors[name] = COMPETENCY_SELECT_FIELDS.includes(name)
        ? COMPETENCY_ERROR_MESSAGES.select
        : COMPETENCY_ERROR_MESSAGES.text;
      return;
    }

    // 선택 항목(4-10)도 값을 채웠으면 상한은 본다.
    if (max && !isWithinMaxLength(value, max)) {
      errors[name] = COMPETENCY_ERROR_MESSAGES.tooLong(max);
    }
  });

  return errors;
}

// ⚠ [시안 부재 — 파생 카피] 위와 같은 사정이다.
const DOCUMENTS_ERROR_MESSAGES = {
  proof_file: "재학 증빙 서류를 첨부해 주세요.",
  phone_required: "휴대폰 번호를 입력해 주세요.",
  phone_format: "휴대폰 번호 형식이 올바르지 않습니다.",
  phone_unverified: "휴대폰 본인인증을 완료해 주세요.",
  agreements: "필수 약관에 모두 동의해 주세요.",
};

function validateDocumentsSection({
  values,
  file,
  phoneVerified,
  agreements,
}: {
  values: Partial<MentorApplyValues>;
  file: File | null;
  phoneVerified: boolean;
  agreements: Record<string, boolean>;
}) {
  const errors: Record<string, string> = {};

  if (!file) errors.proof_file = DOCUMENTS_ERROR_MESSAGES.proof_file;

  // 1-3 휴대폰 번호와 5-2 본인인증은 같은 `phone` 값을 본다(DB 컬럼이 하나뿐이라
  // 섹션 1 담당이 그렇게 맞춰 뒀다). 다만 에러 "키"는 여기서부터 갈라야 한다 —
  // 예전에는 "인증 안 됨"도 errors.phone 에 썼는데, 그러면 값 형식은 멀쩡한데 인증만
  // 안 끝난 경우 이 결과가 섹션 1 형식 에러 자리를 그대로 덮어써서 표시·스크롤이 둘 다
  // 엉뚱하게 섹션 1로 간다(리뷰 WARN #1). 그래서 "인증까지 끝났는가"는 `phone_verified`
  // 라는 별도 키로 낸다 — 형식 검사 자체는 섹션 1 검증이 이미 하므로 여기서 다시 본다.
  const phone = String(values.phone ?? "").trim();
  if (!phone) errors.phone = DOCUMENTS_ERROR_MESSAGES.phone_required;
  else if (!isValidMobile(phone))
    errors.phone = DOCUMENTS_ERROR_MESSAGES.phone_format;
  else if (!phoneVerified)
    errors.phone_verified = DOCUMENTS_ERROR_MESSAGES.phone_unverified;

  const allAgreed = DOCUMENTS_REQUIRED_AGREEMENT_KEYS.every(
    (key) => agreements?.[key] === true,
  );
  if (!allAgreed) errors.agreements = DOCUMENTS_ERROR_MESSAGES.agreements;

  return errors;
}

// ---------------------------------------------------------------------------
// 첫 에러로 스크롤 + 포커스
// ---------------------------------------------------------------------------

// 검사 순서 = 화면에 그려진 순서. 첫 에러 필드를 찾을 때 이 배열 순서로 훑는다.
// `phone`(값 형식·필수)은 섹션 1 과 섹션 5 가 공유하지만 배열에는 한 번만(섹션 1 자리에)
// 들어간다. 섹션 5 의 "인증 여부"는 이제 별도 키 `phone_verified` 라 섹션 5 자리에 따로
// 넣는다(리뷰 WARN #1 — validateDocumentsSection 주석 참고).
const FIELD_ORDER = [
  ...APPLICANT_FIELDS,
  ...UNIVERSITY_FIELDS,
  ...HIGHSCHOOL_FIELDS,
  ...COMPETENCY_FIELD_NAMES,
  "proof_file",
  "phone_verified",
  "agreements",
];

// 필드 이름 → 스크롤·포커스 대상 DOM id.
//
// MentorTextField / TextareaField 는 `fieldId = id || name` 이라 컨트롤 id 가 곧 필드 이름이다.
// 그래서 여기 없는 필드는 이름을 그대로 id 로 쓴다.
//
// 칩 그룹·파일 드롭존·약관 블록은 단일 컨트롤이 아니라 포커스 가능한 노드 id 가 없다.
// 대신 MentorFieldShell 이 **에러가 없을 때도 항상** `${fieldId}-error` 노드를 렌더하므로
// (레이아웃 시프트 방지용 고정 슬롯) 그 노드를 스크롤 앵커로 쓴다. 포커스는 걸지 않는다.
const FIELD_ANCHORS = {
  gender: "mentor-gender-error",
  residence_region: "mentor-residence-region-error",
  enrollment_status: "enrollment_status", // SelectField 실제 컨트롤 id
  admission_history: "mentor-admission-history-error",
  final_admission_track: "mentor-final-admission-track-error",
  highschool_type: "mentor-highschool-type-error",
  consult_fields: "mentor-apply-consult-fields-error",
  consult_grades: "mentor-apply-consult-grades-error",
  weekly_capacity: "mentor-apply-weekly-capacity", // SelectField 실제 컨트롤 id
  available_timeslot: "mentor-apply-available-timeslot",
  proof_file: "mentor-apply-proof-error",
  // 5-2 본인인증 미완료 에러의 스크롤·포커스 대상. PhoneVerifyField 의 번호 인풋 id 이자
  // FormSectionDocuments.jsx PHONE_INPUT_ID 와 같은 문자열이어야 한다(리뷰 WARN #1).
  phone_verified: "mentor-apply-phone",
  agreements: "mentor-apply-agreements-error",
};

// ProgressSidebar 와 같은 값. 전역 헤더(fixed, h-16=4rem) + 시각 여백 2.5rem.
const SCROLL_OFFSET_REM = 6.5;

// 포커스를 걸어도 되는 컨트롤인지. 에러 슬롯(<p>)에 focus() 를 부르면 아무 일도 일어나지
// 않거나(비포커스 요소) 브라우저가 임의로 스크롤을 되돌릴 수 있어 대상을 좁힌다.
const FOCUSABLE_SELECTOR = "input, select, textarea, button, [tabindex]";

function scrollToField(fieldName: string) {
  if (typeof window === "undefined") return;

  const anchorId =
    (FIELD_ANCHORS as Record<string, string>)[fieldName] || fieldName;
  const target = document.getElementById(anchorId);
  if (!target) return;

  const rootFontSize =
    parseFloat(window.getComputedStyle(document.documentElement).fontSize) ||
    16;
  const top =
    target.getBoundingClientRect().top +
    window.scrollY -
    SCROLL_OFFSET_REM * rootFontSize;

  // prefers-reduced-motion 존중 — 저장소 관례(BookViewer.jsx:28, ProgressSidebar.jsx:129).
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  window.scrollTo({
    top: Math.max(top, 0),
    behavior: prefersReduced ? "auto" : "smooth",
  });

  if (
    typeof target.focus === "function" &&
    target.matches(FOCUSABLE_SELECTOR)
  ) {
    // preventScroll — 위에서 계산한 오프셋을 브라우저 기본 스크롤이 덮어쓰지 않게 한다.
    target.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------------------
// 제출 — 2단계 signed upload
//
// Vercel Functions 요청 본문 플랫폼 하드 리밋(4.5MB)이 base64 인코딩(+33%)까지 감안하면
// 원본 파일 기준 약 3.2MB 로 좁혀진다. 시안 문구(FileDropzone.jsx HINT_TEXT)가 원래
// `100MB 이하` 라서 base64 단일 요청으로는 애초에 지킬 수 없는 상한이었다 — 그래서
// 파일은 클라이언트가 Supabase Storage 에 **직접** 업로드하고(서버리스 함수를 거치지
// 않으므로 함수 본문 상한과 무관하다), 지원서 제출 요청에는 업로드된 경로만 싣는다.
// (그 100MB 문구 자체는 이후 Supabase 전역 업로드 상한 실측에 맞춰 50MB 로 재확정됐다
// — api/_routes/mentor-apply.js MAX_FILE_BYTES 주석 참고. 2단계 방식을 쓰는 이유는 무관하다.)
//
// 순서를 "파일 선택 즉시 업로드"가 아니라 "제출 버튼을 눌렀을 때"로 미룬 이유 — 업로드 URL
// 발급(/api/mentor-apply-upload-url)이 휴대폰 인증 완료를 전제로 하므로, 인증 전에 파일을
// 고르면 발급이 실패한다. 제출 시점이면 클라이언트 검증(필수 필드·동의·인증)이 이미 전부
// 끝난 뒤라 업로드 URL 발급이 실패할 조건이 남지 않는다.
const BUCKET = "mentor-applications";

// 업로드 성공 후 제출(3단계)만 실패한 경우 재시도 시 같은 파일을 다시 올리지 않도록
// { file, path } 를 보관해 재사용한다. 파일이 바뀌면(handleFileChange) 폐기한다.
function isSameProof(uploadedProof: UploadedProof | null, file: File | null) {
  return Boolean(uploadedProof && uploadedProof.file === file);
}

// 서버(업로드 URL 발급 / 제출) 응답 형태 — 두 엔드포인트가 공용으로 쓴다(아래
// SERVER_REASON_TO_FIELD 주석 참고). JSON 파싱 실패 시 null 이 올 수 있어 전부 optional 이다.
type SubmitStepResult = {
  ok?: boolean;
  detail?: string;
  reason?: string;
  field?: string;
  path?: string;
  token?: string;
  application_id?: string;
  retry_after?: number;
};

// 3단계(업로드 URL 발급 → Storage 업로드 → 제출) 중 어디서 실패했는지 구분해서 던지는
// 에러. handleSubmit catch 블록이 stage 에 따라 다른 필드·문구로 매핑한다.
class SubmitStepError extends Error {
  stage: "upload" | "submit";
  result: SubmitStepResult | null;

  constructor(stage: "upload" | "submit", result?: SubmitStepResult | null) {
    super(result?.detail || `mentor-apply ${stage} step failed`);
    this.stage = stage; // 'upload' | 'submit'
    this.result = result ?? null;
  }
}

// 진행 단계 문구 — 아래 submitStage 상태의 값과 1:1 이다.
// FileDropzone 은 'idle' | 'uploading' | 'done' uploadStatus prop 을 받아 선택된 파일 옆에
// 업로드 중/완료 배지를 그린다. 이 파일이 FileDropzone 을 직접 렌더하지 않고
// FormSectionDocuments 를 거쳐 렌더하므로, FormSectionDocuments 가 uploadStatus prop 을
// 받아 그대로 FileDropzone 으로 전달한다(FormSectionDocuments.jsx). 이 파일은 submitStage/
// uploadedProof 두 상태를 그 세 값으로 변환만 한다(아래 render 의 uploadStatus 지역변수 —
// 'uploading' 은 submitStage 로, 'done' 은 uploadedProof 가 현재 file 을 가리키는지로 판정).
// 그와 별개로 폼 하단(아래 submitStage 렌더 지점)의 문단은 "지금 몇 단계인지"를 알리는
// 용도라 남겨 둔다 — 배지는 파일 하나에 붙는 상태고, 이 문단은 폼 전체 진행 상태다.
const SUBMIT_STAGE_LABELS = {
  uploading: "증빙 서류를 업로드하고 있습니다...",
  submitting: "지원서를 제출하고 있습니다...",
};

// 서버 실패 응답(reason)을 어느 필드 에러로 흘려보낼지. 서버가 `field` 를 함께 주는 경우는
// 그 값을 그대로 쓰고, 주지 않는 reason 만 여기서 매핑한다.
// ⚠ phone_not_verified / phone_verification_expired 는 `phone` 이 아니라 `phone_verified`
//   로 매핑한다 — `phone` 으로 매핑하면 섹션 1 의 번호 인풋(형식은 멀쩡한 값)에도 이 문구가
//   함께 뜨는 오표시가 재발한다(리뷰 WARN #1, validateDocumentsSection 주석과 동일 사정).
// ⚠ 이 맵은 제출(3단계) 응답과 업로드 URL 발급(1단계) 응답에 공용으로 쓴다 — 발급도 같은
//   휴대폰 인증 검사를 거치므로(팀 계약, api/_routes/mentor-apply-upload-url.js) reason 어휘가
//   겹칠 수 있다. file_* 계열은 이제 제출 요청이 아니라 발급 요청에서 나는 편이 자연스럽지만,
//   두 엔드포인트 모두 결국 proof_file 로 모이므로 매핑을 나눌 실익이 없다.
const SERVER_REASON_TO_FIELD = {
  invalid_phone: "phone",
  phone_not_verified: "phone_verified",
  phone_verification_expired: "phone_verified",
  file_type_not_allowed: "proof_file",
  file_too_large: "proof_file",
  file_required: "proof_file",
  upload_failed: "proof_file",
};

// 서버가 `field` 로 돌려주는 동의 키(agree_terms 등)는 화면에 개별 슬롯이 없다 —
// 약관 블록 하나가 통째로 errors.agreements 를 본다.
function normalizeServerField(reason?: string, field?: string) {
  if (reason === "agreement_required") return "agreements";
  if (field) return field;
  return (
    (SERVER_REASON_TO_FIELD as Record<string, string>)[reason ?? ""] || null
  );
}

// ⚠ [시안 부재 — 파생 카피] 네트워크 실패·서버 미분류 오류용 문구.
const GENERIC_SUBMIT_ERROR = "제출에 실패했습니다. 잠시 후 다시 시도해 주세요.";
// ⚠ [시안 부재 — 파생 카피] 업로드 URL 발급/Storage 업로드(1~2단계) 실패용 문구 —
// 서버가 detail 을 안 주는 네트워크 오류 등에서만 쓰인다.
const UPLOAD_STEP_ERROR =
  "파일 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.";

// ⚠ [시안 부재 — 파생 카피] 완료 화면이 시안에 없다(파일 상단 주석). 확정 문구가 내려오면
//    이 상수만 교체하면 되고, 확정 시 src/data/mentorApply.js 로 옮기는 것이 맞다.
//    TODO(mentor-apply): 제출 완료 카피 확정 필요 — 아래는 잠정 파생 문구다.
const COMPLETION_COPY = {
  title: "지원서가 접수되었습니다",
  body: "작성해 주신 내용을 검토한 뒤 등록하신 연락처로 결과를 안내드립니다.",
  idLabel: "접수번호",
};

// ---------------------------------------------------------------------------

export default function MentorApplyForm() {
  const [values, setValues] = useState<MentorApplyValues>(INITIAL_VALUES);
  const [agreements, setAgreements] =
    useState<Record<string, boolean>>(INITIAL_AGREEMENTS);
  const [file, setFile] = useState<File | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  // '' | 'uploading' | 'submitting' — submitting 이 true 인 동안만 의미가 있다.
  const [submitStage, setSubmitStage] = useState<
    "" | "uploading" | "submitting"
  >("");
  // 업로드까지는 성공했는데 제출(3단계)만 실패해 재시도하는 경우, 같은 파일을 다시
  // Storage 에 올리지 않도록 { file, path } 를 보관한다. { file, path } | null.
  const [uploadedProof, setUploadedProof] = useState<UploadedProof | null>(
    null,
  );
  const [submitError, setSubmitError] = useState("");
  // 접수 성공 시 서버가 돌려주는 uuid. 이 값이 있으면 폼 자리를 완료 메시지로 치환한다.
  const [applicationId, setApplicationId] = useState("");

  function updateField(key: keyof MentorApplyValues, value: string | string[]) {
    // 전화번호(1-3 · 5-2 본인인증이 같은 키를 공유)는 QA 지시(2026-08-21)로 입력 중
    // 자동으로 010-1234-5678 형태 하이픈을 넣는다 — 두 입력이 모두 이 함수를 거치므로
    // 한 곳만 고치면 된다(파일 상단 ⚠ 참고).
    const nextValue =
      key === "phone" && typeof value === "string"
        ? formatPhoneInput(value)
        : value;
    setValues((prev) => ({ ...prev, [key]: nextValue }) as MentorApplyValues);
    // 사용자가 고치기 시작한 필드의 에러는 즉시 지운다 — 고친 뒤에도 빨간 글씨가 남아 있으면
    // 무엇이 아직 문제인지 알 수 없다.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

    // 인증을 마친 뒤 번호를 바꾸면 서버의 인증 레코드와 어긋나므로 인증 상태를 되돌린다.
    // (PhoneVerifyField 는 verified 동안 입력을 잠그지만, 섹션 1 의 휴대폰 번호 인풋은
    //  같은 `phone` 키를 공유하면서 잠기지 않는다.)
    if (key === "phone") {
      setPhoneVerified(false);
      // 번호를 고치는 순간 인증 상태가 초기화되므로, 이전 "본인인증을 완료해 주세요"
      // 에러도 같이 지운다 — 안 지우면 새 번호를 입력하는 중에도 그 문구가 남아 있는다.
      setErrors((prev) =>
        prev.phone_verified ? { ...prev, phone_verified: undefined } : prev,
      );
    }
  }

  function handleFileChange(next: File | null) {
    setFile(next);
    setErrors((prev) =>
      prev.proof_file ? { ...prev, proof_file: undefined } : prev,
    );
    // 파일이 바뀌면 이전에 올려 둔 결과(있다면)는 더 이상 이 파일을 가리키지 않으므로
    // 폐기한다 — 안 지우면 uploadedProof.path 가 옛 파일의 경로인데 새 파일 이름으로
    // 제출되는 상태 불일치가 생긴다.
    setUploadedProof((prev) => (isSameProof(prev, next) ? prev : null));
  }

  function handlePhoneVerified(normalized: string) {
    setPhoneVerified(true);
    // 서버 조회 키와 제출 페이로드를 맞추려고 정규화된 번호로 덮어쓴다.
    // updateField 를 쓰면 phoneVerified 가 곧바로 false 로 되돌아가므로 직접 setValues 한다.
    setValues((prev) => ({ ...prev, phone: normalized }));
    setErrors((prev) =>
      prev.phone || prev.phone_verified
        ? { ...prev, phone: undefined, phone_verified: undefined }
        : prev,
    );
  }

  function handleAgreementToggle(key: string) {
    setAgreements((prev) => ({ ...prev, [key]: !prev[key] }));
    setErrors((prev) =>
      prev.agreements ? { ...prev, agreements: undefined } : prev,
    );
  }

  function handleAgreementToggleAll() {
    // 하나라도 꺼져 있으면 전체 켜기, 전부 켜져 있으면 전체 끄기(MentorAgreementBlock 계약).
    const allChecked = DOCUMENTS_AGREEMENT_KEYS.every((key) => agreements[key]);
    setAgreements(
      Object.fromEntries(
        DOCUMENTS_AGREEMENT_KEYS.map((key) => [key, !allChecked]),
      ),
    );
    setErrors((prev) =>
      prev.agreements ? { ...prev, agreements: undefined } : prev,
    );
  }

  // [시안 부재 — 파생 처리] 업로드/제출 진행 중 이탈 경고.
  // 2단계 signed upload 로 바뀌며 제출이 (특히 큰 파일에서) 수십 초 걸릴 수 있다 — 그 사이
  // 새로고침·탭 닫기·뒤로가기를 하면 폼에 적어 둔 27개 항목이 전부 사라진다. submitting 인
  // 동안만 등록하고 끝나면 즉시 해제한다 — 평상시(작성 중)까지 이탈 경고를 걸면 사용자를
  // 불필요하게 막고 접근성에도 나쁘다(예: 실수로 연 탭을 못 닫음).
  useEffect(() => {
    if (!submitting) return undefined;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Chrome 은 returnValue 세팅을 요구한다(구형 API 잔재, 대부분 브라우저는 값 자체는
      // 무시하고 세팅 여부만 본다).
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [submitting]);

  // 제출 완료 시 스크롤 — QA 지시(2026-08-21)로 고친 버그. 예전에는 handleSubmit 안에서
  // setApplicationId 직후 곧바로 window.scrollTo(top:0) 를 불렀는데, 그 시점엔 아직 리렌더
  // 전이라 CompletionPanel 이 DOM 에 없고 결과적으로 페이지 맨 위(히어로)로 튀었다. applicationId
  // 가 실제로 세워져 이 이펙트가 도는 시점(= 다음 렌더 이후)에 접수 완료 화면 섹션으로
  // scrollIntoView 한다 — 섹션에 이미 `scroll-mt-26`(히어로 CTA 앵커와 같은 값)이 붙어 있어
  // 고정 헤더에 가리지 않는다.
  useEffect(() => {
    if (!applicationId) return;
    if (typeof window === "undefined") return;

    const target = document.getElementById(MENTOR_FORM_ANCHOR_ID);
    if (!target) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "start",
    });
  }, [applicationId]);

  // 진행률 사이드바가 보는 값. 파일·인증·약관은 `values` 밖에 있으므로 여기서 합성한다.
  //
  // 합성 키 3개를 쓰는 이유는 명세 § 필수 항목 카운트(합계 27)를 그대로 재현하기 위해서다.
  //   · `agreements`     — 필수 약관 3종을 각각 세면 합계가 29 가 된다. 시안 사이드바가 섹션 5 를
  //                        3개(증빙서류 / 본인인증 / 약관동의)로 세므로 3종 전부 체크됐을 때만
  //                        **한 개**로 친다.
  //   · `phone_verified` — 섹션 5 의 본인인증 항목을 `phone` 으로 세면 섹션 1 의 휴대폰 번호와
  //                        같은 키라 computeProgress 의 중복 제거에 먹혀 합계가 26 이 된다.
  //                        게다가 섹션 1 에 번호를 적기만 해도 섹션 5 가 완료로 보이는 오표시가
  //                        생긴다. 인증 완료 여부는 별도 항목이므로 별도 키로 센다.
  //   · `proof_file`     — File 객체는 isFieldFilled 가 객체로 판정해 true 를 준다.
  //
  // 섹션 1~3(FormSectionApplicant/University/Highschool)이 export 하는 값 타입은
  // Record<string, string | undefined> — 텍스트/단일선택 필드만 다뤄서다. `values` 전체에는
  // 칩 복수선택 2종(consult_fields/consult_grades, string[])이 섞여 있어 구조적으로 딱
  // 맞지 않지만, 그 두 필드는 섹션 1~3 어느 쪽도 읽지 않으므로 값 손실 없이 캐스팅만 한다.
  const textValues = values as unknown as Record<string, string | undefined>;

  const progressValues = {
    ...values,
    proof_file: file,
    phone_verified: phoneVerified,
    agreements: DOCUMENTS_REQUIRED_AGREEMENT_KEYS.every(
      (key) => agreements[key] === true,
    ),
  };

  // FileDropzone 의 uploadStatus prop 값으로 변환(파일 상단 SUBMIT_STAGE_LABELS 주석 참고).
  // 'uploading' 이 'submitting' 보다 먼저 오는 이유는 값 자체가 submitStage 문자열과 같아서다
  // (제출(3단계) 중에는 이미 업로드가 끝난 뒤라 uploadedProof 가 현재 file 을 가리키므로
  // 'done' 으로 떨어진다 — 별도 분기가 필요 없다).
  const uploadStatus =
    submitStage === "uploading"
      ? "uploading"
      : isSameProof(uploadedProof, file)
        ? "done"
        : "idle";

  // PROGRESS_SIDEBAR.steps는 5개 고정 배열이라 인덱스 0~4 항상 존재한다.
  const sidebarSections = [
    {
      no: 1,
      label: PROGRESS_SIDEBAR.steps[0]!,
      id: APPLICANT_SECTION_ID,
      fields: APPLICANT_REQUIRED_FIELDS,
    },
    {
      no: 2,
      label: PROGRESS_SIDEBAR.steps[1]!,
      id: UNIVERSITY_SECTION_ID,
      fields: UNIVERSITY_REQUIRED_FIELDS,
    },
    {
      no: 3,
      label: PROGRESS_SIDEBAR.steps[2]!,
      id: HIGHSCHOOL_SECTION_ID,
      fields: HIGHSCHOOL_REQUIRED_FIELDS,
    },
    {
      no: 4,
      label: PROGRESS_SIDEBAR.steps[3]!,
      id: COMPETENCY_SECTION_ID,
      fields: COMPETENCY_REQUIRED_FIELD_NAMES,
    },
    {
      no: 5,
      label: PROGRESS_SIDEBAR.steps[4]!,
      id: DOCUMENTS_SECTION_ID,
      fields: ["proof_file", "phone_verified", "agreements"],
    },
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 중복 제출 차단 — 버튼 disabled 만으로는 Enter 연타를 못 막는다.
    if (submitting) return;

    const nextErrors: Record<string, string> = {
      ...validateApplicantSection(textValues),
      ...validateUniversitySection(textValues),
      ...validateHighschoolSection(textValues),
      ...validateCompetencySection(values),
      ...validateDocumentsSection({ values, file, phoneVerified, agreements }),
    };

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      // 필드마다 있던 role="alert" 슬롯을 없앤 대신(리뷰 WARN #2), 제출 실패는 이 한 문단
      // (아래 submitError 렌더 지점, role="alert")에서만 발화한다 — 필드별 에러 문구
      // 자체는 aria-describedby 로 각 인풋에 연결돼 있어 포커스가 옮겨갈 때 함께 읽힌다.
      setSubmitError(
        `${Object.keys(nextErrors).length}개 항목을 확인해 주세요.`,
      );
      const firstField = FIELD_ORDER.find((name) => nextErrors[name]);
      if (firstField) scrollToField(firstField);
      return;
    }

    setErrors({});
    setSubmitError("");
    setSubmitting(true);

    const normalizedPhone = normalizePhone(values.phone);

    try {
      // 1~2단계: 업로드 URL 발급 + Storage 직접 업로드. 재시도로 다시 들어왔고 같은
      // 파일을 이미 올려 뒀다면(uploadedProof) 건너뛴다.
      let proofPath = isSameProof(uploadedProof, file)
        ? uploadedProof!.path // isSameProof가 true면 uploadedProof는 null이 아님
        : null;

      if (!proofPath) {
        setSubmitStage("uploading");

        const issueResponse = await fetch("/api/mentor-apply-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: normalizedPhone,
            // 검증(제출 전 클라이언트 검증, validateDocumentsSection)을 이미 통과했으므로 file != null
            fileName: file!.name,
            contentType: file!.type,
            size: file!.size,
          }),
        });
        const issueResult = await issueResponse.json().catch(() => null);

        if (!issueResponse.ok || !issueResult?.ok) {
          throw new SubmitStepError("upload", issueResult);
        }

        // anon 클라이언트를 그대로 쓴다 — 버킷이 비공개라도 signed upload token 이 이
        // path 하나만 인가하므로 동작한다(팀 계약, api/_routes/mentor-apply-upload-url.js).
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(issueResult.path, issueResult.token, file!); // 위와 동일: 검증 통과 후 file != null

        if (storageError) {
          throw new SubmitStepError("upload", { detail: storageError.message });
        }

        proofPath = issueResult.path;
        setUploadedProof({ file: file!, path: proofPath! }); // file: 위와 동일; proofPath: 바로 위 줄에서 issueResult.path로 할당됨
      }

      // 3단계: 나머지 필드 + 업로드 경로로 제출.
      setSubmitStage("submitting");

      const payload = {
        ...values,
        // 서버가 normalizePhone 을 다시 돌리지만, 인증 레코드 조회 키와 어긋나지 않게
        // 정규화된 값으로 보낸다.
        phone: normalizedPhone,
        // 동의는 DB 의 agree_* boolean 컬럼 5개와 1:1 이다.
        agree_terms: agreements.terms === true,
        agree_privacy: agreements.privacy === true,
        agree_identity: agreements.identity === true,
        agree_marketing: agreements.marketing === true,
        agree_ad: agreements.ad === true,
        // base64 첨부 대신 1~2단계에서 올린 경로만 보낸다(팀 계약, api/_routes/mentor-apply.js).
        proof_file_path: proofPath,
        proof_file_name: file!.name, // 위와 동일: 검증 통과 후 file != null
      };

      const response = await fetch("/api/mentor-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // 플랫폼이 본문 크기 상한 등으로 요청을 끊으면 JSON 이 아닌 응답이 돌아온다.
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new SubmitStepError("submit", result);
      }

      // 페이지 최상단이 아니라 접수 완료 화면으로 스크롤한다 — 아래
      // "제출 완료 시 스크롤" useEffect 가 applicationId 가 세워지는 시점(= CompletionPanel 이
      // 실제로 그려진 다음)에 맞춰 처리한다. setApplicationId 직후 여기서 곧바로 스크롤하면
      // 아직 리렌더 전이라 top:0(히어로)으로 튀어 버린다(QA 지시 2026-08-21로 발견된 버그).
      setApplicationId(result.application_id || "");
    } catch (error) {
      if (error instanceof SubmitStepError) {
        const { stage, result } = error;
        const reason = result?.reason;
        // 화면 문구는 서버 detail 을 그대로 쓴다 — 문구를 새로 지으면 서버 reason 과
        // 표현이 갈라진다(api/_routes/mentor-apply.js 호출 규약 주석).
        const fallbackDetail =
          stage === "upload" ? UPLOAD_STEP_ERROR : GENERIC_SUBMIT_ERROR;
        const detail = result?.detail || fallbackDetail;
        // upload 단계 실패는 reason 이 있어도 결국 증빙 파일 문제이므로 기본값을
        // proof_file 로 둔다 — SERVER_REASON_TO_FIELD 에 없는 새 reason 이 오더라도
        // 사용자가 어느 항목을 다시 봐야 하는지는 알 수 있게 한다.
        const field =
          normalizeServerField(reason, result?.field) ||
          (stage === "upload" ? "proof_file" : null);

        if (field) {
          setErrors({ [field]: detail });
          // 5-2 본인인증 관련 거절은 field 가 이미 `phone_verified` 로 매핑돼 있어(위
          // SERVER_REASON_TO_FIELD) scrollToField(field) 만으로 섹션 1 이 아니라 인증
          // 컨트롤로 정확히 간다 — phoneVerified 상태만 별도로 되돌려 준다.
          const isVerificationIssue =
            reason === "phone_not_verified" ||
            reason === "phone_verification_expired";
          if (isVerificationIssue) setPhoneVerified(false);
          scrollToField(field);
        }

        setSubmitError(detail);
        return;
      }

      // 네트워크 단절·JSON 파싱 실패 등. 콘솔 로그는 저장소 관례(MyPage.jsx:245)를 따른다.
      console.error("멘토 지원서 제출 실패:", error);
      setSubmitError(GENERIC_SUBMIT_ERROR);
    } finally {
      setSubmitting(false);
      setSubmitStage("");
    }
  }

  return (
    // 폼 래퍼 배경 #F9FAFB(§6-1) = tailwind surface.footer 토큰과 같은 값이라 신규 hex 없이 쓴다.
    // 상하 패딩 142(8.875rem)는 시안 y 좌표에서 역산한 값이다(§6 밴드 3638~9141).
    // 히어로 CTA 의 앵커 타깃 id 를 이 래퍼가 진다(MentorHero.jsx MENTOR_FORM_ANCHOR_ID).
    <section
      id={MENTOR_FORM_ANCHOR_ID}
      aria-labelledby="mentor-apply-form-heading"
      className="scroll-mt-26 bg-surface-footer pb-16 pt-16 sm:pb-20 sm:pt-20 lg:pb-35.5 lg:pt-35.5"
    >
      {/* 컨테이너 — 시안은 1155 폭이지만 전역 컨테이너(max-w-content)를 쓴다.
          §2·§3·§5·§7 과 좌우 기준선이 정확히 맞는 쪽이, 이 밴드만 55px 넓은 것보다
          훨씬 눈에 띄는 차이이기 때문이다(러프 구현 방침). */}
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 6-2 폼 헤더 — column, gap 12, 중앙정렬. 캡션은 Medium 14 / #525252(ink). */}
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 id="mentor-apply-form-heading" className={MENTOR_HEADING_LG}>
            {FORM_HEADER.title}
          </h2>
          <p className="break-keep text-sm font-medium leading-[1.4] text-ink">
            {FORM_HEADER.caption}
          </p>
        </div>

        {/* 폼 헤더 ↔ 본문 gap 48(3rem) */}
        {applicationId ? (
          <CompletionPanel applicationId={applicationId} />
        ) : (
          // 2컬럼: 사이드바 307(19.1875rem) + gap 16(1rem) + 폼 나머지.
          // 데스크톱 전환점은 lg 가 아니라 wide(74rem)다 — ProgressSidebar 가 sticky/스텝퍼
          // 전환을 wide 로 잡고 있어 그리드도 같은 지점에서 바뀌어야 어긋나지 않는다.
          // items-start: 사이드바(h≈393)와 폼(h≈5090)의 상단 정렬 + sticky 동작 조건.
          <div className="mt-12 grid grid-cols-1 gap-4 wide:grid-cols-[19.1875rem_minmax(0,1fr)] wide:items-start">
            <ProgressSidebar
              sections={sidebarSections}
              values={progressValues}
              errors={errors}
            />

            {/* noValidate — 검증은 전부 이 컴포넌트가 한다. 브라우저 기본 말풍선이 뜨면
                우리 인라인 에러가 표시되기 전에 제출이 막혀 두 체계가 충돌한다. */}
            <form
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-8"
            >
              <FormSectionApplicant
                values={textValues}
                errors={errors}
                onChange={updateField}
              />
              <FormSectionUniversity
                values={textValues}
                errors={errors}
                onChange={updateField}
              />
              <FormSectionHighschool
                values={textValues}
                errors={errors}
                onChange={updateField}
              />
              <FormSectionCompetency
                values={values}
                errors={errors}
                onChange={updateField}
              />
              {/* onSubmit prop 은 넘기지 않는다 — 제출 버튼이 type="submit" 이라
                  <form onSubmit> 으로 이미 연결돼 있고, 둘 다 주면 한 번 클릭에 두 번 돈다
                  (FormSectionDocuments.jsx 의 onSubmit prop 주석). */}
              <FormSectionDocuments
                values={values}
                errors={errors}
                onChange={updateField}
                file={file}
                onFileChange={handleFileChange}
                uploadStatus={uploadStatus}
                phoneVerified={phoneVerified}
                onPhoneVerified={handlePhoneVerified}
                agreements={agreements}
                onAgreementToggle={handleAgreementToggle}
                onAgreementToggleAll={handleAgreementToggleAll}
                submitting={submitting}
              />

              {/* 제출 진행 단계 문구 — 3단계(업로드 URL 발급 → Storage 업로드 → 제출)를 한
                  덩어리로 묶은 submitting 만으로는 큰 파일에서 수십 초간 화면이 멈춘 것처럼
                  보일 수 있어 지금 뭘 하고 있는지 알려준다. FormSectionDocuments 는 담당
                  파일이 아니라 FileDropzone 내부(선택된 파일 옆)에 직접 꽂을 수 없어
                  버튼 바로 아래, submitError 와 같은 자리에 둔다.
                  role="status"(assertive 아님) — 이 폼의 assertive live region 은 아래
                  submitError 한 곳뿐이어야 한다는 관례(바로 아래 주석)를 지킨다. */}
              {submitting && submitStage && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-sm leading-[1.4] text-ink-sub"
                >
                  {SUBMIT_STAGE_LABELS[submitStage]}
                </p>
              )}

              {/* 제출 실패 요약 — 필드 단위 에러와 별개로, 버튼 바로 아래(사용자가 클릭 직후
                  보고 있는 위치)에 한 줄로 남긴다. 서버 detail 을 그대로 노출한다.
                  ⚠ 폼 전체에서 assertive live region 은 **이 한 곳뿐**이다(리뷰 WARN #2).
                  필드 단위 에러 슬롯(MentorFieldShell)은 role="alert" 를 갖지 않는다 —
                  27개 필드가 동시에 실패하는 폼에서 25개 넘는 assertive 리전이 한꺼번에
                  발화하면 스크린리더가 뒤로 갈수록 큐만 쌓아 수십 초간 에러만 읽는 문제가
                  있었다. 클라이언트 검증 실패 시에는 "N개 항목을 확인해 주세요." 요약을
                  이 문단에 채우고, 실제 필드별 문구는 aria-describedby 로 각 인풋에 연결돼
                  포커스가 옮겨갈 때(scrollToField 의 focus({ preventScroll })) 함께 읽힌다. */}
              {submitError && (
                <p
                  role="alert"
                  className="break-keep text-sm leading-[1.4] text-error"
                >
                  {submitError}
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </section>
  );
}

// 제출 완료 패널.
// ⚠ 시안 부재 — 별도 완료 라우트를 만들지 않고 폼 자리를 이 패널로 치환한다(지시 사항).
//    카드 규격은 폼 섹션 카드(§6-4: 흰 배경 / radius 16 / 그림자 없음)를 그대로 따라
//    같은 페이지 안에서 이질감이 없게 했다.
function CompletionPanel({ applicationId }: { applicationId: string }) {
  return (
    <div className="mt-12 rounded-2xl bg-white px-5 py-12 text-center md:px-10 md:py-16">
      {/* 폼 h2 아래 단계라 h3 로 둔다(폼 섹션 카드 제목과 같은 위계). */}
      <h3 className="break-keep text-xl font-semibold leading-[1.4] text-ink-title md:text-2xl">
        {COMPLETION_COPY.title}
      </h3>
      <p className="mt-3 break-keep text-base font-normal leading-[1.4] text-ink">
        {COMPLETION_COPY.body}
      </p>
      {applicationId && (
        <p className="mt-6 text-sm font-normal leading-[1.4] text-ink-sub">
          {COMPLETION_COPY.idLabel}{" "}
          <span className="text-ink-strong">{applicationId}</span>
        </p>
      )}
    </div>
  );
}
