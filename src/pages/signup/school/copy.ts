// 학교 학생 가입 화면 문구. 출처: 사 #98 ~ #108, 결정 r4, r7, r8, 개발 결정 70 ~ 81.
// 명세 문구의 가운뎃점은 쉼표로 쓴다(결정 6, 81).
export const TENANT_MESSAGES = {
  notFound: "소속코드를 다시 확인해 주세요.",
  // 결정 r4: 코드를 비운 학생의 확인 창 문장. 끝에 마침표가 없다.
  askCatchAll: "소속코드를 모르시나요? 담당 선생님께 먼저 확인해 주세요",
  tooMany: "소속코드 확인을 너무 많이 시도했어요. 잠시 후 다시 시도해 주세요.",
};

export const INFO_MESSAGES = {
  classHint: "학년, 반, 번호는 선생님 화면의 학급 편성에 쓰여요.",
  passwordRule: "영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.",
  passwordMismatch: "비밀번호가 서로 달라요.",
  invalidBirthDate: "올바른 생년월일을 입력해 주세요.",
  under14Closed: "만 14세 이상만 가입할 수 있습니다.",
  passGuide: "만 14세 미만은 법정대리인의 본인인증이 필요해요.",
  passDone: "법정대리인 본인인증이 완료되었어요.",
};

export const USERNAME_MESSAGES = {
  available: "사용할 수 있는 아이디입니다.",
  taken: "이미 사용 중인 아이디입니다.",
  invalidFormat: "아이디는 영문 소문자와 숫자 4자에서 20자로 입력해 주세요.",
  failed: "아이디를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
};

export const PHONE_MESSAGES = {
  invalid: "휴대폰번호를 올바르게 입력해 주세요.",
  verified: "전화번호 인증이 완료되었습니다.",
  // 사 #106, 결정 75
  taken: "이미 가입한 번호예요. 아이디 찾기에서 확인해 주세요.",
};

export const NOTICE_MESSAGES = {
  findIdLink: "아이디 찾기",
  // 결정 75: "정보가 맞는데 계속 막히면 온라인문의로 알려 주세요." 중 온라인문의만 링크다.
  inquiryBefore: "정보가 맞는데 계속 막히면 ",
  inquiryLink: "온라인문의",
  inquiryAfter: "로 알려 주세요.",
};

export const GUARDIAN_MESSAGES = {
  // Under14Form 의 같은 문구.
  consent: "법정대리인 정보를 학부모 정보로 수집합니다.",
};

// 제출 오류 코드별로 되돌아갈 단계와 문구(사 #102, #106, 결정 75, 81).
// message가 없으면 칸 안의 표시로 충분해 상자를 띄우지 않는다.
export interface SubmitError {
  step: 3 | 4;
  message?: string;
  hint?: "findId" | "inquiry";
}

export const SUBMIT_ERRORS: Record<string, SubmitError> = {
  NUMBER_TAKEN_SAME_NAME: {
    step: 3,
    message: "이미 가입 내역이 있습니다. 재확인해 주세요",
    hint: "inquiry",
  },
  NUMBER_TAKEN_OTHER: {
    step: 3,
    message:
      "동일한 학년, 반, 번호의 학생이 이미 존재합니다. 학년, 반, 번호를 다시 확인해 주세요",
    hint: "inquiry",
  },
  WC080: { step: 3, message: "등록되지 않은 그룹이에요." },
  USERNAME_TAKEN: { step: 3 },
  PHONE_TAKEN: { step: 3, message: PHONE_MESSAGES.taken, hint: "findId" },
  EMAIL_TAKEN: {
    step: 3,
    message: "이미 가입에 쓰인 이메일이에요. 다른 이메일을 입력해 주세요.",
  },
  SIGNUP_CLOSED: { step: 4, message: "지금은 가입을 받지 않고 있어요." },
};

export const GENERIC_SUBMIT_ERROR: SubmitError = {
  step: 4,
  message: "가입 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
};
