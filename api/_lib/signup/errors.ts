// fn_student_signup 의 오류를 가입 화면이 쓰는 { code, message } 응답으로 바꾼다.
// SQLSTATE(WC0xx)는 supabase/migrations/20261106015050_b2b_school_student_signup.sql 이 정한다.
// WC077 의 details 는 그 번호를 쓰는 학생 이름이라 응답에 싣지 않는다(신청자 이름과 같은지만 본다).

export interface SignupFailure {
  status: number;
  code: string;
  message: string;
  field?: string;
}

interface RpcError {
  code?: string;
  message?: string;
  details?: string | null;
}

export const NUMBER_TAKEN_SAME_NAME_MESSAGE =
  "이미 가입 내역이 있습니다. 재확인해 주세요";
export const NUMBER_TAKEN_OTHER_MESSAGE =
  "동일한 학년, 반, 번호의 학생이 이미 존재합니다. 학년, 반, 번호를 다시 확인해 주세요";

// 교착(40P01), 잠금 대기 시간 초과(55P03), statement_timeout(57014, API 역할의 8초)은 명단 적용과 겹친 가입이다. 다시 시도하면 된다.
const TRY_AGAIN: SignupFailure = {
  status: 409,
  code: "TRY_AGAIN",
  message: "잠시 뒤 다시 시도해 주세요.",
};

const BY_SQLSTATE: Record<string, SignupFailure> = {
  WC074: {
    status: 403,
    code: "SIGNUP_CLOSED",
    message: "지금은 가입할 수 없습니다.",
  },
  WC095: {
    status: 409,
    code: "USERNAME_TAKEN",
    message: "이미 사용 중인 아이디입니다.",
  },
  WC096: {
    status: 409,
    code: "PHONE_TAKEN",
    message: "이미 가입한 번호예요. 아이디 찾기에서 확인해 주세요.",
  },
  WC097: {
    status: 404,
    code: "TENANT_NOT_FOUND",
    message: "소속코드를 다시 확인해 주세요.",
  },
  WC080: {
    status: 400,
    code: "WC080",
    message: "등록되지 않은 그룹이에요.",
  },
  "40P01": TRY_AGAIN,
  "55P03": TRY_AGAIN,
  "57014": TRY_AGAIN,
};

const IDENTITY_REQUIRED: SignupFailure = {
  status: 400,
  code: "IDENTITY_REQUIRED",
  message: "보호자 본인확인을 다시 진행해 주세요.",
};

// 일반 예외(P0001)는 raise 한 문구로 가른다.
const BY_MESSAGE: Record<string, SignupFailure> = {
  duplicate_email: {
    status: 409,
    code: "EMAIL_TAKEN",
    message: "이미 가입된 이메일입니다.",
  },
  already_signed_up: {
    status: 409,
    code: "ALREADY_SIGNED_UP",
    message: "이미 가입을 마친 계정입니다.",
  },
  phone_not_verified: {
    status: 400,
    code: "PHONE_NOT_VERIFIED",
    message: "휴대폰 인증을 다시 진행해 주세요.",
  },
  guardian_phone_not_verified: {
    status: 400,
    code: "GUARDIAN_PHONE_NOT_VERIFIED",
    message: "학부모 휴대폰 인증을 다시 진행해 주세요.",
  },
  identity_not_verified: IDENTITY_REQUIRED,
  identity_purpose_mismatch: IDENTITY_REQUIRED,
  guardian_age: IDENTITY_REQUIRED,
};

// 칸 오류. 값은 응답의 field(요청 본문의 칸 이름)다.
const VALIDATION_FIELD: Record<string, string> = {
  name_required: "name",
  email_required: "email",
  grade_required: "grade",
  terms_service_required: "agreeService",
  privacy_required: "agreePrivacy",
  db_transfer_required: "agreeDbTransfer",
  username_invalid: "username",
  invalid_gender: "gender",
  gender_required: "gender",
  birth_date_required: "birthDate",
  phone_required: "phone",
  invalid_guardian_relation: "guardianRelation",
  guardian_phone_required: "guardianPhone",
  guardian_consent_required: "guardianConsent",
};

/** 알려진 오류면 응답 내용, 아니면 null(호출부가 예외로 던진다). name 은 신청자 이름이다. */
export function mapSignupRpcError(
  error: RpcError,
  name: string,
): SignupFailure | null {
  if (error.code === "WC077") {
    const same = (error.details ?? "").trim() === name.trim();
    return {
      status: 409,
      code: same ? "NUMBER_TAKEN_SAME_NAME" : "NUMBER_TAKEN_OTHER",
      message: same
        ? NUMBER_TAKEN_SAME_NAME_MESSAGE
        : NUMBER_TAKEN_OTHER_MESSAGE,
    };
  }
  const bySqlstate = error.code ? BY_SQLSTATE[error.code] : undefined;
  if (bySqlstate) return bySqlstate;
  const message = error.message ?? "";
  if (BY_MESSAGE[message]) return BY_MESSAGE[message];
  const field = VALIDATION_FIELD[message];
  if (field) {
    return {
      status: 400,
      code: "VALIDATION",
      message: "입력한 내용을 확인해 주세요.",
      field,
    };
  }
  return null;
}
