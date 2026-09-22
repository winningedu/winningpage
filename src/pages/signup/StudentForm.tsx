// [C-1] 학생 14세 이상 회원가입 폼 — docs/login-signup-renewal-spec.md §3.3 C-1,
// 노드 2393-7825(빈)/2393-8057(에러)/2393-8293·2393-8526(입력완료).
// 상태 매트릭스(기본/에러/완료)는 별도 화면 분기 없이 이 컴포넌트 하나가 실제 입력값·
// 인증 플래그에 따라 스스로 표현한다 — 에러 상태에서도 필드 테두리는 border-line 그대로
// 유지하고(§3.3 C-1 명세) 하단 helperText만 상태별 색으로 바뀐다("완료"는 canSubmit이
// true가 되는 시점 = 버튼 활성).
//
// 가입 시퀀스는 기존 src/pages/Signup.jsx와 동일한 호출 순서를 그대로 보존한다
// (§5.3: "가입 시퀀스(중복확인→signUp→OTP검증→RPC저장)는 서버 계약이므로 호출 순서는
// 보존"): 이메일 상태 확인 → OTP 발송 → OTP 검증 → complete_signup_profile RPC.
//
// 앞의 세 단계는 src/lib/signupEmailAuth.js로 옮겼다. 가입 중단 계정을 이어서
// 가입시키려면 상태에 따라 signUp / signInWithOtp를 갈라 써야 하는데, 세 가입
// 화면이 같은 시퀀스를 복제하고 있어 분기가 어긋날 위험이 컸다.
//
// 전화번호 인증은 src/lib/phoneVerification.js를 거쳐 실제 서버가 판정한다
// (발송 /api/send-phone-code, 검증 /api/verify-phone-code). 예전 스텁처럼
// "6자리 입력 = 통과"가 아니며, 가입 RPC도 인증 여부를 다시 확인한다
// (sql/40_auth_signup.sql [15]).
//
// 2026-08-07 변경 3건
//  1. 이메일 인증에 걸려 있던 "비밀번호 먼저" 선행 조건을 없앴다. 비밀번호 필드가
//     이메일보다 아래에 있어서 사용자가 내려갔다 되돌아와야 했다. 계정 비밀번호는
//     가입 완료 직전 applySignupPassword가 맞춘다(src/lib/signupEmailAuth.js).
//  2. 이메일 인증코드도 휴대폰과 똑같이 6자리가 채워지면 자동 검증한다. "확인"
//     버튼을 없앴다.
//  3. 이미 가입에 쓰인 전화번호는 "인증번호 보내기" 단계에서 걸러낸다
//     (/api/send-phone-code reason:'phone_taken'). 경합으로 뚫린 경우는 가입 RPC의
//     duplicate_phone이 잡는다(sql/40_auth_signup.sql [16]).
import { Check } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import {
  AgreementList,
  AuthLayout,
  AuthTitle,
  PrimaryButton,
  SelectField,
  TextField,
} from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import { useCooldown } from "@/hooks/useCooldown";
import type { SignupProfileRpcResult } from "@/lib/parentLink";
import {
  DUPLICATE_PHONE_MESSAGE,
  formatPhoneInput,
  isValidMobile,
  normalizePhone,
  PHONE_RESEND_COOLDOWN_SECONDS,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/phoneVerification";
import {
  applySignupPassword,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  MESSAGES,
  sendSignupEmailCode,
  toErrorMessage,
  verifySignupEmailCode,
} from "@/lib/signupEmailAuth";
import { supabase } from "@/lib/supabase";
import { isValidTenantCodeFormat, normalizeTenantCode } from "@/lib/tenantCode";

// Under14Form(D-2)도 동일 지역 목록(17개 시도 + '기타')을 쓰므로 이 상수를 공유한다.
export const REGION_OPTIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "기타",
];

const SCHOOL_TYPES = ["초등학교", "중학교", "고등학교", "N수생", "기타"];

// T8(QA 2026-08-22): 성별 필수 필드 — 전용 라디오 컴포넌트가 없어(공통 컴포넌트는
// TextField/SelectField뿐) SelectField로 통일한다. mentor_applications 성별 값 규약과
// 동일하게 '남'/'여' 두 값만 쓴다(supabase/migrations/20260821000006_mentor_apply_gender.sql).
const GENDER_OPTIONS = ["남", "여"];

// 'YYYYMMDD' 8자리 → 'YYYY.MM.DD' 표시용 변환. StudentBirth(B-2)가 SignupContext에
// 저장한 원시 문자열을 그대로 읽기 전용으로 보여줄 때만 쓴다.
function formatBirthDateDisplay(birthDate8: string) {
  if (birthDate8?.length !== 8) return "";
  return `${birthDate8.slice(0, 4)}.${birthDate8.slice(4, 6)}.${birthDate8.slice(6, 8)}`;
}

// §3.3 C-1 약관 6행 중 "모두 동의합니다"를 제외한 개별 5항목.
// identityRequired 키는 스펙 7825(정본) 채택 — 8057/8293의 중복 "개인정보 수집 및 이용"
// 표기는 오류로 간주(T1 계약 주석 참고).
const STUDENT_AGREEMENT_ITEMS = [
  {
    key: "service",
    label: "위닝에듀 이용약관",
    required: true,
    to: "/terms/student/service",
  },
  {
    key: "privacyRequired",
    label: "개인정보 수집 및 이용",
    required: true,
    to: "/terms/student/privacy",
  },
  {
    key: "identityRequired",
    label: "본인 인증을 위한 정보 수집",
    required: true,
    to: "/terms/student/identity",
  },
  {
    key: "marketing",
    label: "마케팅 목적의 개인정보 수집 및 이용",
    required: false,
    to: "/terms/student/marketing",
  },
  {
    key: "ads",
    label: "광고성 정보 수신 동의",
    required: false,
    to: "/terms/student/promotion",
  },
];

const STUDENT_AGREEMENT_KEYS = STUDENT_AGREEMENT_ITEMS.map((item) => item.key);
const REQUIRED_AGREEMENT_KEYS = [
  "service",
  "privacyRequired",
  "identityRequired",
];

type FieldStatus = "default" | "error" | "success";
interface FieldMessage {
  text: string;
  status: FieldStatus;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value: string) {
  return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(value);
}

// 하이픈 유무와 무관하게 판정한다. 서버(api/_lib/phoneCode.js)와 같은 규칙을 쓰려고
// lib에 위임한다 — 프론트만 느슨하면 발송 단계에서 invalid_phone으로 되돌아온다.
function isValidPhone(value: string) {
  return isValidMobile(value);
}

function getFriendlyError(errorMessage?: string) {
  if (!errorMessage) return "회원가입 중 문제가 발생했습니다.";

  if (errorMessage.includes("User already registered")) {
    return "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.";
  }

  if (errorMessage.includes("Password should be at least")) {
    return "비밀번호는 최소 6자 이상으로 입력해 주세요.";
  }

  if (errorMessage.includes("Invalid email")) {
    return "이메일 형식이 올바르지 않습니다.";
  }

  return errorMessage;
}

// T3(2026-09-03): "학생 명의의 핸드폰이 없어요" 단독 체크 문구 전용 — Under14Form.tsx의
// 동명 컴포넌트와 동일 스펙(16px 아이콘/12px 텍스트)이지만 그쪽은 다른 executor 소유
// 파일이라 import할 수 없어 최소한으로 인라인 복제한다(Under14Form 파일 상단 주석의
// "공용 컴포넌트로 승격하지 않는다" 판단과 같은 이유).
function InlineCheckbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-11 items-center gap-2 text-left"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          checked
            ? "border-primary bg-primary text-white"
            : "border-line bg-white text-transparent"
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </span>
      <span className="text-xs text-ink-sub">{children}</span>
    </button>
  );
}

export default function StudentForm() {
  const navigate = useNavigate();
  const {
    memberType,
    birthDate,
    isUnder14,
    formData,
    updateFormData,
    agreements,
    updateAgreements,
    setAllAgreements,
    verification,
    updateVerification,
    setSignupCompleted,
    setLinkCode,
  } = useSignup();

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [phoneMessage, setPhoneMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [phoneSending, setPhoneSending] = useState(false);
  const phoneCooldown = useCooldown(PHONE_RESEND_COOLDOWN_SECONDS);
  // 서버가 시도를 세므로 같은 코드를 두 번 보내지 않는다.
  const lastPhoneAttempt = useRef("");
  // T3(2026-09-03): 학부모 핸드폰 인증 — 학생 본인 phone 상태와 같은 패턴을 그대로
  // 복제한다. 인증코드 입력값(guardianCode)은 phoneCode/emailCode와 같은 이유로
  // SignupContext에 두지 않는다(SENSITIVE_FORM_KEYS 관례 — OTP 입력값은 새로고침 시
  // 어차피 초기화 대상이라 context에 넣어도 영속되지 않는다).
  const [guardianCode, setGuardianCode] = useState("");
  const [guardianMessage, setGuardianMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [guardianSending, setGuardianSending] = useState(false);
  const guardianCooldown = useCooldown(PHONE_RESEND_COOLDOWN_SECONDS);
  const lastGuardianAttempt = useRef("");
  const [emailMessage, setEmailMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [emailSending, setEmailSending] = useState(false);
  const emailCooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
  // 이메일 OTP도 1회용이라 같은 코드를 두 번 검증하면 403이 난다. 휴대폰과 동일하게
  // 마지막 시도값을 기억해 자동 검증이 같은 값으로 재시도하지 않게 한다.
  const lastEmailAttempt = useRef("");

  // B-1(회원유형 선택)을 건너뛰고 직접 진입한 경우의 가드 — SignupContext 계약 주석
  // ("memberType===null인데 폼 단계 라우트에 직접 진입 시 /signup으로 redirect") 참고.
  // memberType===null(직접 진입) 또는 14세 미만(isUnder14!==false, 즉 true/null 미확정 포함)인
  // 경우에도 이 화면(14세 이상 전용)에 머무르지 않도록 함께 막는다.
  useEffect(() => {
    if (memberType !== "student" || isUnder14 !== false) {
      navigate("/signup", { replace: true });
    }
  }, [memberType, isUnder14, navigate]);

  const passwordValid = formData.password
    ? isValidPassword(formData.password)
    : null;
  const allRequiredAgreed = REQUIRED_AGREEMENT_KEYS.every(
    (key) => agreements[key],
  );
  const allAgreed = STUDENT_AGREEMENT_KEYS.every((key) => agreements[key]);

  const agreementItems = STUDENT_AGREEMENT_ITEMS.map((item) => ({
    ...item,
    checked: agreements[item.key],
  }));

  // AS-IS(구 Signup.jsx updateForm) 동작 복원: 이메일/전화번호 값이 바뀌면 이미 진행된 인증
  // 상태가 더 이상 유효하지 않으므로 해당 인증 플래그를 초기값으로 되돌린다. updateVerification은
  // SignupContext state를 갱신하고 그 즉시 sessionStorage('signup-flow')에도 반영되므로(§5.3)
  // 새로고침 후에도 리셋된 상태 그대로 복구된다.
  function handleField(key: string) {
    return (value: string) => {
      // 전화번호는 자동 하이픈 포맷(010-1234-5678)을 적용한다(QA 지시 2026-08-21) —
      // 멘토신청·프리미엄이용 문의 폼과 같은 src/lib/phoneVerification.ts 유틸을 공유한다.
      // 서버로 보낼 때는 normalizePhone이 다시 숫자만 남기므로 여기서는 표시용으로만 쓴다.
      // guardianPhone(T3)도 같은 자동 하이픈 대상이다.
      const nextValue =
        key === "phone" || key === "guardianPhone"
          ? formatPhoneInput(value)
          : value;
      updateFormData({ [key]: nextValue });

      if (key === "email") {
        lastEmailAttempt.current = "";
        updateVerification("email", {
          requested: false,
          verified: false,
          checked: false,
          available: false,
        });
      }

      if (key === "phone") {
        lastPhoneAttempt.current = "";
        updateVerification("phone", { requested: false, verified: false });
        setPhoneMessage({ text: "", status: "default" });
      }

      // T3: 학부모 핸드폰 값이 바뀌면 진행 중이던 인증이 더 이상 유효하지 않다 —
      // 학생 본인 phone 필드와 동일한 이유(§파일 상단 handleField 주석).
      if (key === "guardianPhone") {
        lastGuardianAttempt.current = "";
        updateVerification("guardianPhone", {
          requested: false,
          verified: false,
        });
        setGuardianMessage({ text: "", status: "default" });
        setGuardianCode("");
      }
    };
  }

  function handleToggleAllAgreements() {
    setAllAgreements(!allAgreed, STUDENT_AGREEMENT_KEYS);
  }

  function handleToggleAgreement(key: string) {
    updateAgreements({ [key]: !agreements[key] });
  }

  // T3(2026-09-03): "학생 명의의 핸드폰이 없어요" 체크 토글.
  //  - 체크 시: 학생 본인 전화번호 인증 상태를 초기화한다(더 이상 필수가 아니므로
  //    남아 있는 인증 완료 상태가 canSubmit 판정을 오염시키면 안 된다).
  //  - 해제 시: 학부모 핸드폰 필드값·인증 상태를 초기화한다(다시 체크할 때 이전
  //    입력이 남아 있으면 미인증 상태의 번호가 그대로 제출될 위험이 있다).
  function handleToggleNoOwnPhone() {
    const next = !formData.noOwnPhone;
    updateFormData({ noOwnPhone: next });

    if (next) {
      lastPhoneAttempt.current = "";
      updateVerification("phone", { requested: false, verified: false });
      setPhoneMessage({ text: "", status: "default" });
    } else {
      lastGuardianAttempt.current = "";
      updateVerification("guardianPhone", {
        requested: false,
        verified: false,
      });
      setGuardianMessage({ text: "", status: "default" });
      setGuardianCode("");
      updateFormData({ guardianPhone: "" });
    }
  }

  // --- 전화번호 인증(알림톡/SMS) ---
  // 발송은 /api/send-phone-code, 검증은 /api/verify-phone-code가 담당한다.
  // 판정을 서버가 하므로 예전 스텁처럼 "6자리 입력 = 통과"가 아니다.
  //
  // ⚠️ 서버가 시도를 5회로 끊는다. 같은 코드를 두 번 보내지 않도록 마지막 시도값을
  //   기억한다 — 지웠다 다시 입력하는 것만으로 기회가 깎이면 안 된다.
  async function requestPhoneCode() {
    setFormError("");

    if (!isValidPhone(formData.phone)) {
      setPhoneMessage({
        text: "전화번호를 올바르게 입력해 주세요.",
        status: "error",
      });
      return;
    }

    if (phoneCooldown.active) {
      setPhoneMessage({
        text: `인증번호는 ${phoneCooldown.remaining}초 후에 다시 보낼 수 있어요.`,
        status: "error",
      });
      return;
    }

    setPhoneSending(true);
    setPhoneMessage({ text: "", status: "default" });

    try {
      const result = await sendPhoneCode(formData.phone, "signup");

      if (!result.ok) {
        // 한도에 걸린 경우 서버가 알려준 대기 시간을 그대로 반영한다.
        if (result.retryAfter) phoneCooldown.start();

        // 이미 가입에 쓰인 번호다. 서버가 문자를 보내지 않았으므로 인증코드
        // 필드를 열어두면 안 된다.
        if (result.reason === "phone_taken") {
          updateVerification("phone", { requested: false, verified: false });
          setPhoneMessage({ text: DUPLICATE_PHONE_MESSAGE, status: "error" });
          return;
        }

        setPhoneMessage({ text: result.message, status: "error" });
        return;
      }

      lastPhoneAttempt.current = "";
      updateVerification("phone", { requested: true, verified: false });
      updateFormData({ phoneCode: "" });
      phoneCooldown.start();
      setPhoneMessage({
        // 운영에서 dryRun이 true면 문자가 실제로 나가지 않은 것이다.
        text: result.dryRun
          ? "테스트 모드입니다 — 실제 문자는 발송되지 않았습니다."
          : "카카오톡으로 인증번호를 발송했습니다.",
        status: "default",
      });
    } finally {
      setPhoneSending(false);
    }
  }

  // OTP 자동검증 — updateVerification 호출이 자기 자신을 다시 트리거해 중복 검증 API 호출·루프로
  // 이어지지 않도록 useEffectEvent로 감싼다. phoneCode 6자리 완성 시에만 실행되어야 한다.
  const onPhoneCodeChange = useEffectEvent((code: string) => {
    if (
      code.length !== 6 ||
      !verification.phone.requested ||
      verification.phone.verified ||
      lastPhoneAttempt.current === code
    ) {
      return;
    }

    lastPhoneAttempt.current = code;

    verifyPhoneCode(formData.phone, code).then((result) => {
      if (result.ok) {
        updateVerification("phone", { verified: true });
        setPhoneMessage({
          text: "전화번호 인증이 완료되었습니다.",
          status: "success",
        });
        return;
      }

      setPhoneMessage({ text: result.message, status: "error" });

      // 시도가 소진되거나 만료되면 재발송 외에 길이 없다. 다음 입력이 다시
      // 시도되도록 잠금을 푼다.
      if (
        result.reason === "too_many_attempts" ||
        result.reason === "code_expired"
      ) {
        lastPhoneAttempt.current = "";
      }
    });
  });

  useEffect(() => {
    onPhoneCodeChange(formData.phoneCode);
  }, [formData.phoneCode]);

  // --- 학부모 핸드폰 인증(T3, 2026-09-03) ---
  // 학생 명의 번호가 없는 경우에만 노출되는 대체 인증 경로. 위 학생 본인 전화번호
  // 인증(requestPhoneCode/onPhoneCodeChange)과 완전히 동일한 패턴이며, 서버 purpose만
  // 'guardian_signup'으로 다르다(guardian_signup은 SIGNUP_PURPOSES가 아니라 phone_taken
  // 중복 차단 대상이 아니다 — api/send-phone-code.ts 참고).
  async function requestGuardianPhoneCode() {
    setFormError("");

    if (!isValidPhone(formData.guardianPhone)) {
      setGuardianMessage({
        text: "학부모 핸드폰을 올바르게 입력해 주세요.",
        status: "error",
      });
      return;
    }

    if (guardianCooldown.active) {
      setGuardianMessage({
        text: `인증번호는 ${guardianCooldown.remaining}초 후에 다시 보낼 수 있어요.`,
        status: "error",
      });
      return;
    }

    setGuardianSending(true);
    setGuardianMessage({ text: "", status: "default" });

    try {
      const result = await sendPhoneCode(
        formData.guardianPhone,
        "guardian_signup",
      );

      if (!result.ok) {
        if (result.retryAfter) guardianCooldown.start();
        setGuardianMessage({ text: result.message, status: "error" });
        return;
      }

      lastGuardianAttempt.current = "";
      updateVerification("guardianPhone", { requested: true, verified: false });
      setGuardianCode("");
      guardianCooldown.start();
      setGuardianMessage({
        text: result.dryRun
          ? "테스트 모드입니다 — 실제 문자는 발송되지 않았습니다."
          : "카카오톡으로 인증번호를 발송했습니다.",
        status: "default",
      });
    } finally {
      setGuardianSending(false);
    }
  }

  const onGuardianCodeChange = useEffectEvent((code: string) => {
    if (
      code.length !== 6 ||
      !verification.guardianPhone.requested ||
      verification.guardianPhone.verified ||
      lastGuardianAttempt.current === code
    ) {
      return;
    }

    lastGuardianAttempt.current = code;

    verifyPhoneCode(formData.guardianPhone, code, "guardian_signup").then(
      (result) => {
        if (result.ok) {
          updateVerification("guardianPhone", { verified: true });
          setGuardianMessage({
            text: "학부모 핸드폰 인증이 완료되었습니다.",
            status: "success",
          });
          return;
        }

        setGuardianMessage({ text: result.message, status: "error" });

        if (
          result.reason === "too_many_attempts" ||
          result.reason === "code_expired"
        ) {
          lastGuardianAttempt.current = "";
        }
      },
    );
  });

  useEffect(() => {
    onGuardianCodeChange(guardianCode);
  }, [guardianCode]);

  // --- 이메일 인증: 기존 Signup.jsx 시퀀스 그대로(중복확인 → signUp으로 OTP 발송) ---
  // 시안(§3.3 C-1 표)에는 이메일 필드 액션이 "인증번호 보내기" 하나뿐이라 중복확인과
  // OTP 발송을 한 번의 클릭으로 묶었다(AS-IS는 중복확인/인증요청 버튼이 분리돼 있었음).
  async function requestEmailCode() {
    if (emailSending) return;

    // Supabase Auth가 서버에서 같은 간격으로 막고 있다. 여기서 먼저 잡아주지
    // 않으면 연타가 전부 실패 응답으로 돌아오면서 시간당 발송 할당량만 태운다.
    if (emailCooldown.active) {
      setEmailMessage({
        text: MESSAGES.cooldown(emailCooldown.remaining),
        status: "error",
      });
      return;
    }

    const normalizedEmail = formData.email.trim().toLowerCase();

    setFormError("");

    if (!normalizedEmail) {
      setEmailMessage({
        text: "이메일을 먼저 입력해 주세요.",
        status: "error",
      });
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setEmailMessage({
        text: "이메일 형식이 올바르지 않습니다.",
        status: "error",
      });
      return;
    }

    setEmailSending(true);
    setEmailMessage({
      text: "이메일 중복 여부를 확인하는 중입니다.",
      status: "default",
    });

    try {
      // 비밀번호는 여기서 요구하지 않는다(파일 상단 2026-08-07 변경 1번).
      // 아직 비어 있으면 임시 비밀번호로 계정이 만들어지고, 실제 값은
      // 가입 완료 직전 applySignupPassword가 채운다.
      const { state, mode, resumed, error } = await sendSignupEmailCode({
        email: normalizedEmail,
        password: formData.password,
        name: formData.name.trim(),
        memberType: "student",
      });

      if (error) {
        console.error("이메일 인증코드 발송 오류:", error);
        updateVerification("email", { checked: false, available: false });
        setEmailMessage({
          // state가 없으면 상태 조회 자체가 실패한 것이고, 있으면 발송이 실패한 것이다.
          text: state ? getFriendlyError(error.message) : MESSAGES.checkFailed,
          status: "error",
        });
        return;
      }

      if (state === EMAIL_STATE.TAKEN) {
        updateVerification("email", { checked: true, available: false });
        setEmailMessage({ text: MESSAGES.taken, status: "error" });
        return;
      }

      // 이어가기(resumed)도 진행 가능한 상태이므로 available로 표시한다.
      lastEmailAttempt.current = "";
      updateVerification("email", {
        checked: true,
        available: true,
        requested: true,
        verified: false,
        mode,
        resumed,
      });
      updateFormData({ emailCode: "" });
      emailCooldown.start();
      setEmailMessage({
        text: resumed ? MESSAGES.resumed : MESSAGES.sent,
        status: "default",
      });
    } finally {
      setEmailSending(false);
    }
  }

  // 6자리가 채워지면 곧바로 검증한다 — 휴대폰(알림톡) 인증과 같은 방식이라
  // 별도 "확인" 버튼을 두지 않는다(파일 상단 2026-08-07 변경 2번).
  // ParentForm(E-1)이 이미 쓰던 패턴이다.
  // OTP 자동검증 — updateVerification 호출이 자기 자신을 다시 트리거해 중복 검증 API 호출·루프로
  // 이어지지 않도록 useEffectEvent로 감싼다. emailCode 6자리 완성 시에만 실행되어야 한다.
  const onEmailCodeChange = useEffectEvent((token: string) => {
    if (
      token.length !== 6 ||
      !verification.email.requested ||
      verification.email.verified ||
      lastEmailAttempt.current === token
    ) {
      return;
    }

    lastEmailAttempt.current = token;

    const normalizedEmail = formData.email.trim().toLowerCase();

    verifySignupEmailCode({
      email: normalizedEmail,
      token,
      // verifySignupEmailCode는 담당 파일이 아니라 수정할 수 없다 —
      // exactOptionalPropertyTypes 때문에 값이 null이면 키 자체를 생략해 전달한다
      // (내부에서 `mode || OTP_MODE.SIGNUP`로 처리하므로 동작은 동일하다).
      ...(verification.email.mode !== null && {
        mode: verification.email.mode,
      }),
    }).then(async ({ error }) => {
      if (error) {
        updateVerification("email", { verified: false });
        setEmailMessage({ text: MESSAGES.codeMismatch, status: "error" });
        return;
      }

      // 인증에 성공한 계정이 이미 가입을 끝낸 계정일 수 있다(발송 시점과 지금
      // 사이에 다른 창에서 가입을 마친 경우). 그대로 두면 기존 회원의 프로필을
      // 덮어쓰는 요청으로 이어진다.
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData.user;

      if (currentUser?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, member_type")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (profile?.email && profile?.member_type) {
          updateVerification("email", { verified: false });
          setEmailMessage({
            text: "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.",
            status: "error",
          });
          return;
        }
      }

      updateVerification("email", { verified: true });
      setEmailMessage({
        text: "이메일 인증이 완료되었습니다.",
        status: "success",
      });
    });
  });

  useEffect(() => {
    onEmailCodeChange(formData.emailCode);
  }, [formData.emailCode]);

  function validateForm() {
    const normalizedName = formData.name.trim();
    const normalizedPhone = formData.phone.trim();
    const normalizedEmail = formData.email.trim().toLowerCase();

    if (!normalizedName) return "이름을 입력해 주세요.";
    // T8: 이 화면(14세 이상 전용)은 이미 memberType/isUnder14 가드가 birthDate 없이는
    // 진입 자체를 막지만(위 useEffect), 방어적으로 한 번 더 확인한다.
    if (!birthDate) return "생년월일 입력 단계로 돌아가 주세요.";

    // T3(2026-09-03): "학생 명의의 핸드폰이 없어요" 체크 시 학부모 핸드폰 인증이
    // 학생 본인 전화번호 인증을 대체한다.
    if (formData.noOwnPhone) {
      if (!isValidPhone(formData.guardianPhone))
        return "학부모 핸드폰을 올바르게 입력해 주세요.";
      if (!verification.guardianPhone.verified)
        return "학부모 핸드폰 인증을 완료해 주세요.";
    } else {
      if (!isValidPhone(normalizedPhone))
        return "전화번호를 올바르게 입력해 주세요.";
      if (!verification.phone.verified) return "전화번호 인증을 완료해 주세요.";
    }

    if (!normalizedEmail) return "이메일을 입력해 주세요.";

    if (!verification.email.checked || !verification.email.available) {
      return "이메일 중복확인을 완료해 주세요.";
    }

    if (!verification.email.verified) return "이메일 인증을 완료해 주세요.";

    if (!isValidPassword(formData.password)) {
      return "비밀번호는 영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.";
    }

    if (!formData.gender) return "성별을 선택해 주세요.";
    if (!formData.region) return "지역을 선택해 주세요.";
    if (!formData.schoolType) return "재학 구분을 선택해 주세요.";

    if (formData.schoolType !== "N수생" && !formData.schoolName.trim()) {
      return "재학 중인 학교명을 입력해 주세요.";
    }

    if (!allRequiredAgreed)
      return "필수 약관에 동의해야 회원가입을 진행할 수 있습니다.";

    // T8 소속코드는 선택 입력이라 빈 값은 통과시키고, 값이 있을 때만 형식을
    // 본다 — "존재하는 코드인지"는 서버 판정이라 여기서는 형식만 막는다.
    if (formData.orgCode.trim() && !isValidTenantCodeFormat(formData.orgCode)) {
      return "소속코드 형식을 확인해 주세요. (영문·숫자 8자)";
    }

    return "";
  }

  const submitValidationMessage = validateForm();
  const canSubmit = !loading && submitValidationMessage === "";

  async function handleSubmit() {
    setFormError("");

    const validationMessage = validateForm();

    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setLoading(true);

    try {
      const normalizedName = formData.name.trim();
      const normalizedEmail = formData.email.trim().toLowerCase();
      // T3(2026-09-03): "학생 명의의 핸드폰이 없어요" 체크 시 학생 본인 phone은
      // 비워 보낸다 — 서버가 그 경우에만 p_guardian_phone 인증을 대신 요구한다
      // (Under14Form의 noOwnPhone과 동일한 서버 계약).
      const normalizedPhone = formData.noOwnPhone
        ? ""
        : normalizePhone(formData.phone);
      const normalizedSchoolName =
        formData.schoolType === "N수생" ? "" : formData.schoolName.trim();

      const { data: userData, error: getUserError } =
        await supabase.auth.getUser();

      if (getUserError) {
        setFormError(
          `사용자 정보를 불러오지 못했습니다: ${getUserError.message}`,
        );
        return;
      }

      const currentUser = userData.user;

      if (!currentUser?.id) {
        setFormError(
          "이메일 인증 세션을 찾을 수 없습니다. 다시 인증해 주세요.",
        );
        return;
      }

      if ((currentUser.email || "").toLowerCase() !== normalizedEmail) {
        setFormError(
          "인증한 이메일과 입력한 이메일이 다릅니다. 다시 인증해 주세요.",
        );
        return;
      }

      // 계정 비밀번호를 폼에 입력된 값으로 맞춘다. 이메일 인증 시점에는 임시
      // 비밀번호였을 수 있어서(파일 상단 변경 1번) 이 호출을 빠뜨리면 방금 정한
      // 비밀번호로 로그인할 수 없다.
      const { error: passwordError } = await applySignupPassword(
        formData.password,
      );

      if (passwordError) {
        setFormError(
          "비밀번호 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const { data: profileResult, error: profileError } = await supabase.rpc(
        "complete_signup_profile",
        {
          p_name: normalizedName,
          p_username: normalizedEmail,
          p_phone: normalizedPhone,
          p_email: normalizedEmail,
          p_region: formData.region,
          p_school_type: formData.schoolType,
          p_school_name: normalizedSchoolName,
          p_member_type: "student",
          p_terms_service_agreed: agreements.service,
          p_privacy_required_agreed: agreements.privacyRequired,
          // identityRequired("본인 인증을 위한 정보 수집") — sql/40_auth_signup.sql [7]에서
          // 파라미터가 추가되어 GAP 해소됨. 서버가 학생에 한해 필수로 검증하고,
          // 동의 이력은 user_term_agreements에 약관 버전 단위로 기록된다.
          p_identity_required_agreed: agreements.identityRequired,
          p_privacy_optional_agreed: agreements.privacyOptional,
          p_marketing_agreed: agreements.marketing,
          p_ads_agreed: agreements.ads,
          // T8(QA 2026-08-22): birthDate는 SignupContext 최상위 상태(StudentBirth 단계에서
          // 저장한 'YYYYMMDD' 8자리)라 formData가 아니라 여기서 하이픈만 끼워 넣는다.
          p_birth_date: `${birthDate.slice(0, 4)}-${birthDate.slice(4, 6)}-${birthDate.slice(6, 8)}`,
          p_gender: formData.gender,
          // p_org_code는 DEFAULT NULL이 있는 optional 인자다. exactOptionalPropertyTypes
          // 하에서는 undefined 값을 명시적으로 넣는 것도 금지라 키 자체를 조건부로 스프레드한다
          // (인자 생략이 명시적 null과 런타임에서 동일하다).
          ...(formData.orgCode.trim() && {
            p_org_code: normalizeTenantCode(formData.orgCode),
          }),
          // T3(2026-09-03): 학생 명의 번호가 없을 때만 학부모 핸드폰을 보낸다.
          // p_guardian_consent는 항상 false로 고정한다 — 14세 이상은 법정대리인
          // 동의(Under14Form의 guardianConsent) 대상이 아니라 단순 연락처 수집이다.
          ...(formData.noOwnPhone && {
            p_guardian_phone: normalizePhone(formData.guardianPhone),
            p_guardian_consent: false,
          }),
        },
      );

      if (profileError) {
        const errorMessage = String(profileError.message || "").toLowerCase();

        if (errorMessage.includes("duplicate_email")) {
          setFormError(
            "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.",
          );
          return;
        }

        // sql/40 [16]. unique 인덱스 위반(23505)은 [16] 미적용 환경에서 같은 상황이
        // 원문 메시지로 올라오는 경우를 위한 대비다.
        if (
          errorMessage.includes("duplicate_phone") ||
          (errorMessage.includes("duplicate key") &&
            errorMessage.includes("phone"))
        ) {
          setFormError(DUPLICATE_PHONE_MESSAGE);
          return;
        }

        if (errorMessage.includes("not_authenticated")) {
          setFormError(
            "로그인 세션이 만료되었습니다. 이메일 인증을 다시 진행해 주세요.",
          );
          return;
        }

        // T3(2026-09-03): 학부모 핸드폰 인증 경로(guardian_signup) 서버 에러 매핑.
        if (errorMessage.includes("guardian_phone_not_verified")) {
          setFormError(
            "학부모 핸드폰 인증이 확인되지 않았습니다. 인증을 마친 뒤 다시 시도해 주세요.",
          );
          return;
        }

        if (errorMessage.includes("phone_or_guardian_required")) {
          setFormError("전화번호 또는 학부모 핸드폰 중 하나는 입력해 주세요.");
          return;
        }

        if (errorMessage.includes("guardian_phone_required")) {
          setFormError("학부모 핸드폰을 입력해 주세요.");
          return;
        }

        if (errorMessage.includes("terms_service_required")) {
          setFormError("이용약관 필수 동의가 필요합니다.");
          return;
        }

        if (errorMessage.includes("privacy_required")) {
          setFormError("개인정보 필수 동의가 필요합니다.");
          return;
        }

        if (errorMessage.includes("identity_required")) {
          setFormError("본인 인증을 위한 정보 수집 동의가 필요합니다.");
          return;
        }

        if (errorMessage.includes("invalid_member_type")) {
          setFormError(
            "회원 유형이 올바르지 않습니다. 처음부터 다시 시도해 주세요.",
          );
          return;
        }

        if (errorMessage.includes("name_required")) {
          setFormError("이름을 입력해 주세요.");
          return;
        }

        if (errorMessage.includes("region_required")) {
          setFormError("지역을 선택해 주세요.");
          return;
        }

        if (errorMessage.includes("school_type_required")) {
          setFormError("재학 구분을 선택해 주세요.");
          return;
        }

        // T8(QA 2026-08-22): 서버가 최종 판정하는 생년월일·성별 필수 검증 —
        // 프런트 validateForm이 먼저 막지만, 서버 스키마가 최신이 아닌 배포 대비.
        if (errorMessage.includes("birth_date_required")) {
          setFormError("생년월일 입력 단계로 돌아가 주세요.");
          return;
        }

        if (errorMessage.includes("invalid_gender")) {
          setFormError("성별 값이 올바르지 않습니다. 다시 선택해 주세요.");
          return;
        }

        if (errorMessage.includes("gender_required")) {
          setFormError("성별을 선택해 주세요.");
          return;
        }

        // WC073(tenant_required, 2026-09-22 tenant 전환) — 소속 코드가 필수인
        // 서비스(스쿨멘토)에서 코드가 비었거나 존재하지 않을 때. 위닝에듀는
        // app_settings.require_tenant_on_signup=false 라 현재는 발생하지 않지만
        // 서버 스키마 선반영 대비 매핑해 둔다.
        if (errorMessage.includes("tenant_required")) {
          setFormError("소속 코드를 확인해 주세요.");
          return;
        }

        setFormError(
          `회원 정보 저장 중 문제가 발생했습니다: ${profileError.message}`,
        );
        return;
      }

      // 생성 타입은 RPC 반환을 Json으로만 표현한다 — 실제 payload 모양은
      // SignupProfileRpcResult(src/lib/parentLink.ts) 참고.
      const signupResult = profileResult as unknown as SignupProfileRpcResult;

      if (!signupResult?.ok) {
        setFormError(
          "회원 정보 저장 결과를 확인할 수 없습니다. 다시 시도해 주세요.",
        );
        return;
      }

      // 연결코드는 RPC가 발급해 응답에 담아준다(sql/40_auth_signup.sql [7] link_code).
      // 이걸 넘기지 않으면 C-2가 화면용 코드를 따로 만들어 보여주게 되는데, 그 코드는
      // DB에 없어서 학부모가 입력해도 link_code_not_found가 난다.
      if (signupResult.link_code) {
        setLinkCode(signupResult.link_code);
      }

      // C-2(StudentComplete) 진입 가드용 완료 플래그 — RPC 성공 직후에만 true로 설정한다.
      setSignupCompleted(true);

      // ⚠️ 가입 완료 후 signOut 하지 않는다 (2026-08-06 정책 확정)
      //   예전에는 AS-IS를 따라 여기서 세션을 파기했다. 그런데 다음 화면(C-2)의
      //   "학습 진단 시작하기" CTA가 바로 진단으로 들어가는 시안이라, 로그아웃된
      //   상태로 넘어가면 사용자가 방금 만든 계정으로 다시 로그인해야 했다.
      //   ParentForm도 같은 이유로 세션을 유지한다(그쪽은 자녀 연결 조회가 로그인을
      //   요구해서 더 강하게 필요하다).
      navigate("/signup/student/complete");
    } catch (error) {
      // toErrorMessage 를 거친다 — error.message 를 그대로 붙이면 auth-js 가
      // 폴백으로 넣은 "{}" 가 화면에 그대로 나간다(QA 33, 그 함수 위 주석).
      setFormError(
        `가입 처리 중 오류가 발생했습니다: ${toErrorMessage(error, "잠시 후 다시 시도해 주세요.")}`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      {/* TODO: C-1 자체 타이틀 문구는 시안 데이터에 없음(§3.3 C-1) — 동일 톤인 E-1 문구로
          임시 대체. 디자이너 확인 후 확정 문구로 교체 필요. */}
      <AuthTitle
        line1={
          <span className="sm:whitespace-nowrap">
            회원가입 정보를 입력해주세요
          </span>
        }
        line1Color="ink"
      />

      {formError && (
        <p role="alert" className="w-full text-sm text-error">
          {formError}
        </p>
      )}

      <section className="flex w-full flex-col gap-4">
        <h2 className="w-full text-lg font-semibold text-ink">
          학생정보 (필수)
        </h2>

        <TextField
          label="이름"
          id="student-name"
          name="name"
          size="lg"
          value={formData.name}
          onChange={handleField("name")}
          placeholder="이름을 입력 해주세요"
          autoComplete="name"
          required
        />

        {/* T8(QA 2026-08-22): 생년월일은 StudentBirth(B-2) 단계에서 이미 입력받았으므로
            이 화면에서는 읽기 전용으로만 보여준다 — 재입력을 요구하지 않는다. */}
        <TextField
          label="생년월일"
          id="student-birth-date"
          name="birthDate"
          size="lg"
          value={formatBirthDateDisplay(birthDate)}
          disabled
          readOnly
        />

        <SelectField
          label="성별"
          id="student-gender"
          name="gender"
          size="lg"
          value={formData.gender}
          onChange={handleField("gender")}
          placeholder="성별을 선택해주세요"
          options={GENDER_OPTIONS}
          required
        />

        <TextField
          label="전화번호"
          id="student-phone"
          name="phone"
          type="tel"
          size="lg"
          value={formData.phone}
          onChange={handleField("phone")}
          placeholder="전화번호를 입력 해주세요"
          actionLabel={
            phoneCooldown.active
              ? `${phoneCooldown.remaining}초 후 다시 보내기`
              : "인증번호 보내기"
          }
          onAction={requestPhoneCode}
          actionDisabled={
            phoneSending ||
            phoneCooldown.active ||
            verification.phone.verified ||
            formData.noOwnPhone
          }
          // 발송·검증 상태 메시지가 없을 때는 하이픈 자동 포맷 안내를 기본으로 보여준다
          // (QA 지시 2026-08-21, password 필드의 정적 helperText 관례와 동일).
          // 체크 시(noOwnPhone)에는 학부모 핸드폰 대체 안내로 바뀐다(T3 요구사항).
          helperText={
            formData.noOwnPhone
              ? "학생 명의의 핸드폰이 없어요 - 학부모 핸드폰을 기재해 주세요"
              : phoneMessage.text || "하이픈은 자동으로 입력돼요."
          }
          status={phoneMessage.status}
          disabled={formData.noOwnPhone}
          autoComplete="tel"
          required={!formData.noOwnPhone}
        />

        <TextField
          label="전화번호 인증번호"
          id="student-phone-code"
          name="phoneCode"
          size="lg"
          value={formData.phoneCode}
          onChange={(value) =>
            updateFormData({ phoneCode: value.replace(/\D/g, "").slice(0, 6) })
          }
          placeholder="카카오톡으로 보낸 인증번호를 입력 해주세요"
          actionLabel={
            phoneCooldown.active
              ? `${phoneCooldown.remaining}초 후 다시 보내기`
              : "인증번호 다시 보내기"
          }
          onAction={requestPhoneCode}
          actionDisabled={
            !verification.phone.requested ||
            phoneSending ||
            phoneCooldown.active ||
            verification.phone.verified ||
            formData.noOwnPhone
          }
          helperText={phoneMessage.text}
          status={verification.phone.verified ? "success" : phoneMessage.status}
          disabled={
            !verification.phone.requested ||
            verification.phone.verified ||
            formData.noOwnPhone
          }
        />

        <InlineCheckbox
          checked={formData.noOwnPhone}
          onToggle={handleToggleNoOwnPhone}
        >
          학생 명의의 핸드폰이 없어요
        </InlineCheckbox>

        {/* T3(2026-09-03): noOwnPhone 체크 시에만 노출되는 학부모 핸드폰 인증 그룹 —
            학생 본인 전화번호 인증(위 student-phone/student-phone-code)과 동일한
            UX(자동 하이픈·쿨타임·6자리 자동검증)를 purpose만 'guardian_signup'으로
            바꿔 그대로 복제한다. */}
        {formData.noOwnPhone && (
          <>
            <TextField
              label="학부모 핸드폰"
              id="student-guardian-phone"
              name="guardianPhone"
              type="tel"
              size="lg"
              value={formData.guardianPhone}
              onChange={handleField("guardianPhone")}
              placeholder="학부모 핸드폰을 입력 해주세요"
              actionLabel={
                guardianCooldown.active
                  ? `${guardianCooldown.remaining}초 후 다시 보내기`
                  : "인증번호 보내기"
              }
              onAction={requestGuardianPhoneCode}
              actionDisabled={
                guardianSending ||
                guardianCooldown.active ||
                verification.guardianPhone.verified
              }
              helperText={guardianMessage.text || "하이픈은 자동으로 입력돼요."}
              status={guardianMessage.status}
              autoComplete="tel"
              required
            />

            <TextField
              label="학부모 핸드폰 인증번호"
              id="student-guardian-phone-code"
              name="guardianPhoneCode"
              size="lg"
              value={guardianCode}
              onChange={(value) =>
                setGuardianCode(value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="카카오톡으로 보낸 인증번호를 입력 해주세요"
              actionLabel={
                guardianCooldown.active
                  ? `${guardianCooldown.remaining}초 후 다시 보내기`
                  : "인증번호 다시 보내기"
              }
              onAction={requestGuardianPhoneCode}
              actionDisabled={
                !verification.guardianPhone.requested ||
                guardianSending ||
                guardianCooldown.active ||
                verification.guardianPhone.verified
              }
              helperText={guardianMessage.text}
              status={
                verification.guardianPhone.verified
                  ? "success"
                  : guardianMessage.status
              }
              disabled={
                !verification.guardianPhone.requested ||
                verification.guardianPhone.verified
              }
            />
          </>
        )}

        <TextField
          label="아이디(이메일)"
          id="student-email"
          name="email"
          type="email"
          size="lg"
          value={formData.email}
          onChange={handleField("email")}
          placeholder="이메일을 입력 해주세요"
          actionLabel={
            emailCooldown.active
              ? `${emailCooldown.remaining}초 후 재발송`
              : verification.email.requested
                ? "인증번호 다시 보내기"
                : "인증번호 보내기"
          }
          onAction={requestEmailCode}
          actionDisabled={
            emailSending || emailCooldown.active || verification.email.verified
          }
          // 발송 이후의 안내·에러는 인증코드 필드 쪽에서 보여준다. 두 필드가 같은
          // 문구를 동시에 띄우면 어느 쪽 이야기인지 알기 어렵다. status도 함께
          // 내려야 한다 — 문구 없이 status만 error면 이 입력만 이유 없이 흔들린다.
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          helperText={verification.email.requested ? "" : emailMessage.text}
          status={
            verification.email.requested ? "default" : emailMessage.status
          }
          autoComplete="email"
          required
        />

        {/* 6자리가 채워지면 자동 검증한다 — 휴대폰 인증번호 필드와 동일하게 "확인"
            버튼이 없다. 검증 결과는 아래 helperText로 나온다. */}
        <TextField
          label="이메일 인증코드"
          id="student-email-code"
          name="emailCode"
          size="lg"
          value={formData.emailCode}
          onChange={(value) =>
            updateFormData({ emailCode: value.replace(/\D/g, "").slice(0, 6) })
          }
          placeholder="이메일 인증코드 6자리를 입력해주세요"
          helperText={emailMessage.text}
          status={verification.email.verified ? "success" : emailMessage.status}
          disabled={
            !verification.email.requested || verification.email.verified
          }
        />

        <TextField
          label="비밀번호"
          id="student-password"
          name="password"
          type="password"
          size="lg"
          value={formData.password}
          onChange={handleField("password")}
          placeholder="비밀번호를 입력 해주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
          status={
            passwordValid === null
              ? "default"
              : passwordValid
                ? "success"
                : "error"
          }
          autoComplete="new-password"
          required
        />

        <SelectField
          label="지역"
          id="student-region"
          name="region"
          size="lg"
          value={formData.region}
          onChange={handleField("region")}
          placeholder="지역을 선택해주세요"
          options={REGION_OPTIONS}
          required
        />

        <SelectField
          label="재학 구분 선택"
          id="student-school-type"
          name="schoolType"
          size="lg"
          value={formData.schoolType}
          onChange={handleField("schoolType")}
          placeholder="재학 구분 선택"
          options={SCHOOL_TYPES}
          required
        />

        <TextField
          label="재학 중인 학교"
          id="student-school-name"
          name="schoolName"
          size="lg"
          value={formData.schoolName}
          onChange={handleField("schoolName")}
          placeholder="학교명 입력"
          disabled={formData.schoolType === "N수생"}
        />

        {/* T8(QA 2026-08-22): 소속코드 — 선택 입력. 2026-09-22 tenant 전환으로
            8자 코드 형식 검증이 생겼다(validateForm). "존재하는 코드인지"는
            서버(fn_resolve_tenant_code)만 판정하므로 여기서는 형식만 막는다. */}
        <TextField
          label="소속코드 (선택)"
          id="student-org-code"
          name="orgCode"
          size="lg"
          value={formData.orgCode}
          onChange={handleField("orgCode")}
          placeholder="소속코드가 없으면 입력하지 마세요"
          helperText="소속코드가 없으면 입력하지 마세요 (영문·숫자 8자)"
        />
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="w-full text-lg font-semibold text-ink">약관 동의</h2>

        <AgreementList
          items={agreementItems}
          allChecked={allAgreed}
          onToggleAll={handleToggleAllAgreements}
          onToggleItem={handleToggleAgreement}
        />
      </section>

      {!canSubmit && !loading && submitValidationMessage && (
        <p role="status" className="w-full text-xs text-ink-sub">
          {submitValidationMessage}
        </p>
      )}

      <PrimaryButton
        size="lg"
        radius="default"
        disabled={!canSubmit}
        loading={loading}
        onClick={handleSubmit}
      >
        {loading ? "가입 처리 중..." : "가입 완료하기"}
      </PrimaryButton>
    </AuthLayout>
  );
}
