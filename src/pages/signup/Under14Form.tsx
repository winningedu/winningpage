// [D-2] 14세 미만 회원가입 폼(학생 정보+학부모 정보+약관 동의) —
// docs/login-signup-renewal-spec.md §3.3 D-2, 노드 2393-8759=2393-9007(중복 프레임).
//
// C-1(14세 이상 폼)과의 차이(§3.3 D-2 "C-1과의 차이"):
//  - 전화번호 필드에 인증 링크 없음. 대신 체크박스 "학생 명의의 핸드폰이 없어요".
//  - 전화번호 인증번호 필드 없음.
//  - "학부모 정보 (필수)" 섹션 추가(전화번호 + 수집 안내 + 법정대리인 동의 체크).
// 약관 동의 항목은 D-2 전용 차이가 스펙에 기록돼 있지 않아 C-1(학생 6항목 중 필수3/선택2 —
// 7825 정본 채택분)과 동일 구성으로 채택한다.

import { Check } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import {
  AgreementList,
  AuthLayout,
  AuthTitle,
  InfoCard,
  PrimaryButton,
  SelectField,
  TextField,
} from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import { useCooldown } from "@/hooks/useCooldown";
import type { SignupProfileRpcResult } from "@/lib/parentLink";
import { formatPhoneInput, normalizePhone } from "@/lib/phoneVerification";
import {
  applySignupPassword,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  MESSAGES,
  sendSignupEmailCode,
  verifySignupEmailCode,
} from "@/lib/signupEmailAuth";
import { supabase } from "@/lib/supabase";
import { isValidTenantCodeFormat, normalizeTenantCode } from "@/lib/tenantCode";
import { fetchIdentityMobile } from "./identityVerification";
// AS-IS Signup.jsx(§2.2)의 17개 시도 + '기타' select 관례를 StudentForm(C-1)과 공유한다
// (§3.3 C-1 예시 데이터 "울산"과 표기 형식 일치 — "울산광역시"가 아닌 "울산").
import { REGION_OPTIONS } from "./StudentForm";

// AS-IS 재학구분 enum(§2.2: "초·중·고·N수생·기타") 그대로 채택.
const SCHOOL_TYPE_OPTIONS = ["초등학교", "중학교", "고등학교", "N수생", "기타"];

// StudentBirth.jsx / Under14Verify.jsx와 동일 플래그. off인 배포에서는 URL 직접 진입도 막는다.
// 백엔드 연동이 없던 시절의 "데드엔드라 기본 off"는 더 이상 사유가 아니다 — 제출까지
// 배선됐다(sql/84_under14_signup.sql). 다만 켜려면 **그 마이그레이션이 먼저 적용**돼야
// 한다. 안 된 환경에서 켜면 RPC 인자 3개가 없어 제출이 통째로 실패한다.
const UNDER14_SIGNUP_ENABLED =
  import.meta.env.VITE_UNDER14_SIGNUP_ENABLED === "true";

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

// complete_signup_profile이 raise 하는 코드를 사용자 문구로 옮긴다.
// 앞 5건은 C-1과 공통이고, guardian_* / identity_* 3건은 D-2에만 해당한다
// (sql/84_under14_signup.sql (3)).
function getSignupRpcMessage(raw?: string) {
  const message = String(raw || "").toLowerCase();

  if (message.includes("duplicate_email")) {
    return "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.";
  }
  if (message.includes("duplicate_phone")) {
    return "이미 가입에 사용된 전화번호입니다.";
  }
  if (message.includes("not_authenticated")) {
    return "로그인 세션이 만료되었습니다. 이메일 인증을 다시 진행해 주세요.";
  }
  if (message.includes("phone_not_verified")) {
    return "휴대폰 인증이 확인되지 않았습니다. 인증을 마친 뒤 다시 시도해 주세요.";
  }
  if (message.includes("identity_required")) {
    return "본인 인증을 위한 정보 수집 동의가 필요합니다.";
  }

  // T8(QA 2026-08-22): 이 화면은 생년월일·성별을 보내지 않는다(PASS 값이 정본이라
  // RPC가 identity_verifications에서 직접 읽는다) — 그래도 서버 스키마가 최신이
  // 아닌 배포이거나 예외적인 경합을 대비해 메시지를 함께 둔다.
  if (message.includes("birth_date_required")) {
    return "생년월일 확인에 실패했습니다. 본인확인을 다시 진행해 주세요.";
  }
  if (message.includes("invalid_gender")) {
    return "성별 값이 올바르지 않습니다. 본인확인을 다시 진행해 주세요.";
  }
  if (message.includes("gender_required")) {
    return "성별 확인에 실패했습니다. 본인확인을 다시 진행해 주세요.";
  }

  // ── D-2 전용 ──
  // 본인확인은 30분이 지나면 소비할 수 없다. 폼을 오래 열어둔 경우가 대부분이라
  // 처음부터가 아니라 D-1으로만 돌려보낸다.
  if (
    message.includes("identity_not_verified") ||
    message.includes("identity_purpose_mismatch")
  ) {
    return "법정대리인 본인확인이 확인되지 않았습니다. 본인확인을 다시 진행해 주세요.";
  }
  if (message.includes("guardian_age")) {
    return "법정대리인 본인확인은 만 14세 이상만 가능합니다.";
  }
  if (message.includes("guardian_phone_required")) {
    return "법정대리인 전화번호를 입력해 주세요.";
  }
  if (message.includes("guardian_consent_required")) {
    return "법정대리인 정보 수집 동의가 필요합니다.";
  }
  if (message.includes("guardian_phone_not_verified")) {
    return "학부모 핸드폰 인증이 확인되지 않았습니다. 인증을 마친 뒤 다시 시도해 주세요.";
  }
  if (message.includes("phone_or_guardian_required")) {
    return "전화번호 또는 학부모 핸드폰 중 하나는 입력해 주세요.";
  }

  // WC073(tenant_required, 2026-09-22 tenant 전환) — StudentForm과 동일 매핑
  // 참고. 위닝에듀는 현재 발생하지 않지만 서버 스키마 선반영 대비.
  if (message.includes("tenant_required")) {
    return "소속 코드를 확인해 주세요.";
  }

  return `회원 정보 저장 중 문제가 발생했습니다: ${raw}`;
}

// StudentForm.jsx의 동명 헬퍼와 동일 — 공유 훅/유틸 추출은 StudentForm 소유권 밖이라
// 최소한의 인라인 복제로 둔다.
function getFriendlyEmailError(errorMessage?: string) {
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

// §3.3 C-1 약관 6행 중 7825 정본 기준(본인 인증을 위한 정보 수집) — §5.2 약관 라우트 표
// (/terms/student/{service|privacy|identity|marketing|promotion}) 그대로 매핑.
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

// "학생 명의의 핸드폰이 없어요"(16px 아이콘/12px 텍스트) / "법정대리인 정보를 학부모 정보로
// 수집합니다"(#7a7a7a) 두 곳에서만 쓰는 단독 체크 문구라 공용 컴포넌트로 승격하지 않고
// 이 파일 안에 비공개로 둔다(AS-IS Signup.jsx의 파일 내부 CheckBox 관례와 동일).
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
      {/* #7a7a7a는 신규 토큰에 없어 가장 근접한 ink-sub(#808080)로 대체 — 임의 hex 금지 규칙 준수. */}
      <span className="text-xs text-ink-sub">{children}</span>
    </button>
  );
}

export default function Under14Form() {
  const navigate = useNavigate();
  const {
    memberType,
    verification,
    formData,
    agreements,
    updateFormData,
    updateAgreements,
    updateVerification,
    setAllAgreements,
    setLinkCode,
    setSignupCompleted,
  } = useSignup();
  const [emailMessage, setEmailMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const emailCooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
  // 이메일 OTP는 1회용이라 같은 코드로 두 번 검증하면 403이 난다. 자동 검증이
  // 같은 값으로 재시도하지 않도록 마지막 시도값을 기억한다(StudentForm과 동일).
  const lastEmailAttempt = useRef("");
  const passwordValid = formData.password
    ? isValidPassword(formData.password)
    : null;

  // §3.2 흐름: S1(생년월일) -> U0(PASS 안내) -> U1(이 화면). 학생 유형이 아니거나, 플래그가
  // off이거나, 법정대리인 PASS 인증을 아직 마치지 않은 상태로 직접 URL 진입 시 순서대로 되돌린다.
  useEffect(() => {
    if (memberType !== "student") {
      navigate("/signup", { replace: true });
      return;
    }
    if (!UNDER14_SIGNUP_ENABLED) {
      navigate("/signup", { replace: true });
      return;
    }
    if (!verification.pass.verified) {
      navigate("/signup/student/under14/verify", { replace: true });
    }
  }, [memberType, verification.pass.verified, navigate]);

  // T9(2026-09-03): PASS가 넘긴 학부모 휴대폰 번호(흐름 A)가 비어 있으면 — 새로고침
  // 등으로 콜백의 postMessage/보조 채널 결과를 놓친 경우 — requestId로 다시 조회한다
  // (흐름 B, api/nice-identity-result.ts). 실패하거나 값이 없으면 조용히 넘어가고,
  // 아래 guardianPhone 필드는 기존처럼 직접 입력 가능한 상태로 남는다.
  useEffect(() => {
    if (!verification.pass.verified || !verification.pass.requestId) return;
    if (verification.pass.mobile) return;

    let cancelled = false;
    fetchIdentityMobile(verification.pass.requestId).then((mobile) => {
      if (!cancelled && mobile) updateVerification("pass", { mobile });
    });

    return () => {
      cancelled = true;
    };
  }, [
    verification.pass.verified,
    verification.pass.requestId,
    verification.pass.mobile,
    updateVerification,
  ]);

  // PASS 휴대폰 번호가 확보되면 학부모 전화번호 필드를 그 번호로 채운다. PASS 값이
  // 정본이므로 사용자가 이미 뭔가 입력해 뒀어도 덮어쓴다(이 필드는 곧바로 readOnly로
  // 잠긴다 — 아래 렌더 부분).
  useEffect(() => {
    if (!verification.pass.mobile) return;

    const formatted = formatPhoneInput(verification.pass.mobile);
    if (formData.guardianPhone !== formatted) {
      updateFormData({ guardianPhone: formatted });
    }
  }, [verification.pass.mobile, formData.guardianPhone, updateFormData]);

  const requiredKeys = useMemo(
    () => STUDENT_AGREEMENT_ITEMS.map((item) => item.key),
    [],
  );
  const allChecked = useMemo(
    () => STUDENT_AGREEMENT_ITEMS.every((item) => agreements[item.key]),
    [agreements],
  );

  // --- 이메일 인증: src/lib/signupEmailAuth.js의 공용 시퀀스를 쓴다.
  // (상태 확인 → OTP 발송 → OTP 검증. 가입 중단 계정이면 이어서 가입한다)
  // 이전에는 "인증번호 보내기" 클릭이 아무 동작도 하지 않는 no-op 스텁이었다.
  async function requestEmailCode() {
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

    setEmailMessage({
      text: "이메일 중복 여부를 확인하는 중입니다.",
      status: "default",
    });

    // 비밀번호는 여기서 요구하지 않는다. 비어 있으면 임시 비밀번호로 계정이
    // 만들어지고, 실제 값은 가입을 끝내는 시점에 applySignupPassword가 채운다
    // (src/lib/signupEmailAuth.js — handleNext에서 호출한다).
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
        text: state
          ? getFriendlyEmailError(error.message)
          : MESSAGES.checkFailed,
        status: "error",
      });
      return;
    }

    if (state === EMAIL_STATE.TAKEN) {
      updateVerification("email", { checked: true, available: false });
      setEmailMessage({ text: MESSAGES.taken, status: "error" });
      return;
    }

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
  }

  // 6자리가 채워지면 곧바로 검증한다 — 별도 "확인" 버튼을 두지 않는다.
  // (휴대폰 알림톡 인증과 같은 방식. ParentForm(E-1)/StudentForm(C-1)과 동일 패턴)
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

  // TODO: 버튼 활성화 조건이 시안에 명시돼 있지 않음(§3.3 D-2: "빈 폼 기본만 존재... 확인
  // 필요"). 필수 필드 전부 입력 + 필수 약관 전부 동의를 임시 기준으로 채택 — 실제 검증 규칙은
  // 디자이너/기획 확인 후 교체할 것. noOwnPhone 체크 시 전화번호 필수 여부도 시안에 없어
  // 보수적으로 "체크 시 면제"로만 처리했다.
  const isNextEnabled =
    formData.name.trim() !== "" &&
    (formData.noOwnPhone || formData.phone.trim() !== "") &&
    formData.email.trim() !== "" &&
    formData.emailCode.trim() !== "" &&
    formData.password.trim() !== "" &&
    formData.region !== "" &&
    formData.schoolType !== "" &&
    formData.schoolName.trim() !== "" &&
    formData.guardianPhone.trim() !== "" &&
    formData.guardianConsent &&
    STUDENT_AGREEMENT_ITEMS.filter((item) => item.required).every(
      (item) => agreements[item.key],
    );

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // 제출 시퀀스는 C-1(StudentForm)과 같다: 세션 확인 → 비밀번호 반영 →
  // complete_signup_profile → C-2(StudentComplete). D-2만의 차이는 두 가지다.
  //
  //  - 법정대리인 정보(연락처·수집 동의)를 함께 보낸다.
  //  - D-1에서 받은 본인확인 requestId를 보낸다. 서버가 이 값으로
  //    identity_verifications를 검증하고 소비한다(sql/84_under14_signup.sql).
  //    이게 없으면 어렵게 붙인 NICE 본인확인이 서버에서 확인되지 않는다.
  //
  // 학생 본인 명의 번호가 없으면(noOwnPhone) 번호를 비워 보낸다 — 서버가 그
  // 경우에만 휴대폰 인증 강제를 면제한다. 번호를 적었다면 면제되지 않는다.
  async function handleNext() {
    setFormError("");
    setLoading(true);

    try {
      const normalizedName = formData.name.trim();
      const normalizedEmail = formData.email.trim().toLowerCase();
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

      // 이메일 인증 시점에는 임시 비밀번호였을 수 있다(위 requestEmailCode 주석).
      // 빠뜨리면 방금 정한 비밀번호로 로그인할 수 없다.
      const { error: passwordError } = await applySignupPassword(
        formData.password,
      );

      if (passwordError) {
        setFormError(
          "비밀번호 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      // T8 소속코드는 선택 입력이라 빈 값은 통과시키고, 값이 있을 때만 형식을
      // 본다 — "존재하는 코드인지"는 서버 판정이라 여기서는 형식만 막는다.
      if (
        formData.orgCode.trim() &&
        !isValidTenantCodeFormat(formData.orgCode)
      ) {
        setFormError("소속코드 형식을 확인해 주세요. (영문·숫자 8자)");
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
          p_identity_required_agreed: agreements.identityRequired,
          p_privacy_optional_agreed: agreements.privacyOptional,
          p_marketing_agreed: agreements.marketing,
          p_ads_agreed: agreements.ads,
          p_guardian_phone: normalizePhone(formData.guardianPhone),
          p_guardian_consent: formData.guardianConsent,
          p_identity_request_id: verification.pass.requestId ?? "",
          // T8(QA 2026-08-22): p_birth_date/p_gender는 보내지 않는다 — RPC가
          // identity_verifications에서 PASS 값을 직접 읽어 정본으로 쓴다.
          // p_org_code는 DEFAULT NULL이 있는 optional 인자다. exactOptionalPropertyTypes
          // 하에서는 undefined 값을 명시적으로 넣는 것도 금지라 키 자체를 조건부로 스프레드한다
          // (인자 생략이 명시적 null과 런타임에서 동일하다).
          ...(formData.orgCode.trim() && {
            p_org_code: normalizeTenantCode(formData.orgCode),
          }),
        },
      );

      if (profileError) {
        setFormError(getSignupRpcMessage(profileError.message));
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

      // 연결코드는 RPC가 발급해 응답에 담아준다. 여기서 넘기지 않으면 C-2가
      // DB에 없는 코드를 만들어 보여준다(StudentForm과 동일한 함정).
      if (signupResult.link_code) {
        setLinkCode(signupResult.link_code);
      }

      setSignupCompleted(true);

      // 가입 완료 후 signOut 하지 않는다 — C-2의 CTA가 로그인 상태를 요구한다
      // (2026-08-06 정책, StudentForm과 동일).
      navigate("/signup/student/complete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      {/* TODO: C-1/D-2 두 화면 모두 스펙에 타이틀 원문이 명시돼 있지 않음(§3.3 C-1/D-2에
          타이틀 문구 인용 없음) — 동일 역할의 E-1(학부모 폼) 타이틀 "회원가입 정보를
          입력해 주세요"를 임시로 재사용. 디자이너 확인 후 교체할 것. */}
      <AuthTitle
        line1={
          <span className="sm:whitespace-nowrap">
            회원가입 정보를 입력해 주세요
          </span>
        }
      />

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">
          학생 정보 <span className="text-primary">(필수)</span>
        </h2>

        <TextField
          label="이름"
          id="under14-name"
          name="name"
          size="lg"
          value={formData.name}
          onChange={(v) => updateFormData({ name: v })}
          placeholder="이름을 입력 해주세요"
        />

        <div className="flex flex-col gap-2">
          <TextField
            label="전화번호"
            id="under14-phone"
            name="phone"
            size="lg"
            value={formData.phone}
            // 자동 하이픈 포맷(010-1234-5678, QA 지시 2026-08-21) — StudentForm.jsx와 동일
            // src/lib/phoneVerification.ts formatPhoneInput을 재사용한다.
            onChange={(v) => updateFormData({ phone: formatPhoneInput(v) })}
            placeholder="전화번호를 입력 해주세요"
            disabled={formData.noOwnPhone}
            helperText={
              formData.noOwnPhone
                ? "학생 명의의 핸드폰이 없어요 - 아래 학부모 정보에 부모님 핸드폰을 기재해 주세요"
                : "하이픈은 자동으로 입력돼요."
            }
          />

          {/* C-1과 달리 인증번호 발송 링크 대신 체크박스 — 체크/해제 시 UI 변화는 시안에
              정의돼 있지 않아(§3.3 D-2 "확인 필요") 필드 비활성화만 임시로 연결했다. */}
          <InlineCheckbox
            checked={formData.noOwnPhone}
            onToggle={() =>
              updateFormData({ noOwnPhone: !formData.noOwnPhone })
            }
          >
            학생 명의의 핸드폰이 없어요
          </InlineCheckbox>
        </div>

        <TextField
          label="아이디(이메일)"
          id="under14-email"
          name="email"
          type="email"
          size="lg"
          value={formData.email}
          onChange={(v) => updateFormData({ email: v })}
          placeholder="이메일을 입력 해주세요"
          actionLabel={
            emailCooldown.active
              ? `${emailCooldown.remaining}초 후 재발송`
              : verification.email.requested
                ? "인증번호 다시 보내기"
                : "인증번호 보내기"
          }
          onAction={requestEmailCode}
          actionDisabled={emailCooldown.active || verification.email.verified}
          // 발송 이후의 안내·에러는 인증코드 필드에서 보여준다(문구 중복 방지).
          // status도 같이 내린다 — 문구 없이 error만 남으면 이 입력만 흔들린다.
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          helperText={verification.email.requested ? "" : emailMessage.text}
          status={
            verification.email.requested ? "default" : emailMessage.status
          }
        />

        {/* 6자리가 채워지면 자동 검증된다 — "확인" 버튼 없음. */}
        <TextField
          label="이메일 인증코드"
          id="under14-email-code"
          name="emailCode"
          size="lg"
          value={formData.emailCode}
          onChange={(v) =>
            updateFormData({ emailCode: v.replace(/\D/g, "").slice(0, 6) })
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
          id="under14-password"
          name="password"
          type="password"
          size="lg"
          value={formData.password}
          onChange={(v) => updateFormData({ password: v })}
          placeholder="비밀번호를 입력 해주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
          // 이메일 인증 액션을 막던 선행 조건이 사라졌으므로(2026-08-07) 비밀번호
          // 규칙 충족 여부는 이 필드가 직접 알려준다(StudentForm과 동일).
          status={
            passwordValid === null
              ? "default"
              : passwordValid
                ? "success"
                : "error"
          }
          autoComplete="new-password"
        />

        <SelectField
          label="지역"
          id="under14-region"
          name="region"
          size="lg"
          value={formData.region}
          onChange={(v) => updateFormData({ region: v })}
          options={REGION_OPTIONS}
          placeholder="지역을 선택해주세요"
        />

        <SelectField
          label="재학 구분 선택"
          id="under14-school-type"
          name="schoolType"
          size="lg"
          value={formData.schoolType}
          onChange={(v) => updateFormData({ schoolType: v })}
          options={SCHOOL_TYPE_OPTIONS}
          placeholder="재학 구분 선택"
        />

        <TextField
          label="재학 중인 학교"
          id="under14-school-name"
          name="schoolName"
          size="lg"
          value={formData.schoolName}
          onChange={(v) => updateFormData({ schoolName: v })}
          placeholder="학교명 입력"
        />

        {/* T8(QA 2026-08-22): 소속코드 — 선택 입력. 2026-09-22 tenant 전환으로 8자
            코드 형식 검증이 생겼다(handleNext). 생년월일·성별은 PASS 본인확인
            값이 정본이라 이 화면에 입력칸을 두지 않는다(파일 상단 주석). */}
        <TextField
          label="소속코드 (선택)"
          id="under14-org-code"
          name="orgCode"
          size="lg"
          value={formData.orgCode}
          onChange={(v) => updateFormData({ orgCode: v })}
          placeholder="소속코드가 없으면 입력하지 마세요"
          helperText="소속코드가 없으면 입력하지 마세요 (영문·숫자 8자)"
        />
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">
          학부모 정보 <span className="text-primary">(필수)</span>
        </h2>

        <TextField
          label="전화번호"
          id="under14-guardian-phone"
          name="guardianPhone"
          size="lg"
          value={formData.guardianPhone}
          onChange={(v) =>
            updateFormData({ guardianPhone: formatPhoneInput(v) })
          }
          placeholder="전화번호를 입력 해주세요"
          // T9(2026-09-03): PASS가 돌려준 법정대리인 휴대폰 번호가 있으면(흐름 A/B
          // 공통, 위 useEffect가 채운다) 그 번호가 정본이라 읽기전용으로 고정한다 —
          // 사용자가 임의로 바꿔 서버 저장값과 화면이 어긋나는 걸 막는다. 아직 없으면
          // (조회 실패 등) 기존처럼 직접 입력을 받는다.
          readOnly={Boolean(verification.pass.mobile)}
          helperText={
            verification.pass.mobile
              ? "본인확인에 사용한 휴대폰 번호예요. 이 번호로 저장돼요."
              : "하이픈은 자동으로 입력돼요. 본인확인에 사용한 휴대폰 번호가 있으면 그 번호로 저장돼요."
          }
        />

        <InfoCard variant="card">
          <span className="block font-medium">
            [학부모 휴대폰번호 수집 안내]
          </span>
          위닝에듀 서비스 이용에 필요한 안내와 공지사항을 제공하기 위해
          학부모(법정대리인)의 휴대폰번호를 수집합니다.
        </InfoCard>

        <InlineCheckbox
          checked={formData.guardianConsent}
          onToggle={() =>
            updateFormData({ guardianConsent: !formData.guardianConsent })
          }
        >
          법정대리인 정보를 학부모 정보로 수집합니다.
        </InlineCheckbox>
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">약관 동의</h2>

        <AgreementList
          items={STUDENT_AGREEMENT_ITEMS.map((item) => ({
            ...item,
            checked: agreements[item.key],
          }))}
          allChecked={allChecked}
          onToggleAll={() => setAllAgreements(!allChecked, requiredKeys)}
          onToggleItem={(key) => updateAgreements({ [key]: !agreements[key] })}
        />
      </section>

      {formError && (
        <p role="alert" className="w-full text-sm text-error">
          {formError}
        </p>
      )}

      {/* §3.3 D-2: "다음" 버튼 400×52px(C-1/D-1과 달리 이 버튼은 사이즈 매트릭스 불일치가
          기록돼 있지 않아 스펙에 명시된 52px/default 그대로 사용 — D-1 PASS 버튼과는 별개 판단). */}
      <PrimaryButton
        size="default"
        radius="default"
        disabled={!isNextEnabled || loading}
        onClick={handleNext}
      >
        {loading ? "처리 중…" : "다음"}
      </PrimaryButton>
    </AuthLayout>
  );
}
