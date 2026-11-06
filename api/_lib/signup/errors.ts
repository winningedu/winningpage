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
  return null;
}
