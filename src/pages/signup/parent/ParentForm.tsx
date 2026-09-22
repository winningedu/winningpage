// [E-1] 학부모 회원가입 폼 — docs/login-signup-renewal-spec.md §3.3 E-1, 노드 2393:10666.
// 학생 폼(C-1)과 달리 지역/재학구분/학교명 없음, 약관 4행(모두동의+3항목)만 사용.
// 인증코드 필드는 6자리가 채워지는 즉시 자동 검증한다(TextField의 액션 링크 슬롯은
// 스펙대로 "인증번호 보내기"/"인증번호 다시 보내기"에만 사용하고 별도 "확인" 버튼은 두지 않음).
//
// ⚠️ 가입 완료 후 signOut 하지 않는다
//   StudentForm은 가입 직후 세션을 파기하지만 학부모는 그러면 안 된다. 바로 다음
//   화면(E-2~E-4)의 자녀 연결코드 조회가 로그인을 요구하기 때문이다
//   (api/lookup-child.js — 조회 결과에 미성년자의 이름과 학교가 들어간다).
//   여기서 signOut을 넣으면 다음 화면이 통째로 not_authenticated로 죽는다.
//
// ⚠️ 인증번호 검증은 서버가 한다
//   mock은 발송 코드를 클라이언트에 내려주고 프론트가 비교했다. 지금은
//   /api/verify-phone-code가 판정하고, 서버가 시도를 5회로 끊는다. 그래서 같은
//   코드를 반복 전송하지 않도록 마지막 시도값을 기억한다 — 지웠다 다시 입력하는
//   것만으로 시도가 깎이면 안 된다.
import { useEffect, useEffectEvent, useRef, useState } from "react";
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
import { apiFetch, getAuthHeader } from "@/lib/apiFetch";
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
  MESSAGES as EMAIL_MESSAGES,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  EMAIL_STATE,
  sendSignupEmailCode,
  toErrorMessage,
  verifySignupEmailCode,
} from "@/lib/signupEmailAuth";
import { supabase } from "@/lib/supabase";
import { isValidTenantCodeFormat, normalizeTenantCode } from "@/lib/tenantCode";
import { isValidBirthDate } from "@/lib/validators";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// T8(QA 2026-08-22): 성별 필수 필드 — 전용 라디오 컴포넌트가 없어 SelectField로
// 통일한다(StudentForm.tsx의 동명 상수와 동일한 값 — 파일 소유권이 갈려 각자 둔다).
const GENDER_OPTIONS = ["남", "여"];

type FieldStatus = "default" | "error" | "success";
interface FieldMessage {
  text: string;
  status: FieldStatus;
}

// 실계정을 만드는 화면이라 배포 노출은 플래그로 통제한다.
// (VITE_PARENT_SIGNUP_ENABLED='true')
const PARENT_SIGNUP_ENABLED =
  import.meta.env.VITE_PARENT_SIGNUP_ENABLED === "true";

const AGREEMENT_KEYS = ["service", "privacyRequired", "marketing"];
const AGREEMENT_LABELS = [
  {
    key: "service",
    label: "위닝에듀 이용약관",
    required: true,
    to: "/terms/parent/service",
  },
  {
    key: "privacyRequired",
    label: "개인정보 수집 및 이용",
    required: true,
    to: "/terms/parent/privacy",
  },
  {
    key: "marketing",
    label: "마케팅 목적의 개인정보 수집 및 이용",
    required: false,
    to: "/terms/parent/marketing",
  },
];

const RPC_ERRORS: [string, string][] = [
  [
    "duplicate_email",
    "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.",
  ],
  [
    "not_authenticated",
    "로그인 세션이 만료되었습니다. 이메일 인증을 다시 진행해 주세요.",
  ],
  ["terms_service_required", "이용약관 필수 동의가 필요합니다."],
  ["privacy_required", "개인정보 필수 동의가 필요합니다."],
  [
    "invalid_member_type",
    "회원 유형이 올바르지 않습니다. 처음부터 다시 시도해 주세요.",
  ],
  ["name_required", "이름을 입력해 주세요."],
  // sql/40 [16] — 전화번호는 계정당 하나다. 발송 단계에서 걸러지지만 동시 가입
  // 경합으로 여기까지 올 수 있다.
  ["duplicate_phone", DUPLICATE_PHONE_MESSAGE],
  // sql/40 [16]이 아직 적용되지 않은 환경에서는 unique 인덱스 위반 원문이 올라온다.
  ["profiles_phone_unique", DUPLICATE_PHONE_MESSAGE],
  // sql/40 [14] — 서버가 휴대폰 인증을 직접 확인한다. 프론트 가드를 우회했거나
  // 인증 후 30분이 지났거나, 이미 그 인증으로 가입한 경우다.
  [
    "phone_not_verified",
    "휴대폰 인증이 확인되지 않습니다. 인증번호를 다시 받아 인증해 주세요.",
  ],
  // region_required는 sql/40 [13]에서 학생 전용으로 바뀌었다. 그래도 남겨두는 이유는
  // [13]이 아직 적용되지 않은 환경에서 원인을 바로 알아보기 위해서다.
  [
    "region_required",
    "서버 스키마가 최신이 아닙니다(sql/40 [13] 미적용). 관리자에게 문의해 주세요.",
  ],
  // T8(QA 2026-08-22): 서버가 최종 판정하는 생년월일·성별 필수 검증 — validateForm이
  // 먼저 막지만, 서버 스키마가 최신이 아닌 배포 대비.
  ["birth_date_required", "생년월일을 입력해 주세요."],
  ["invalid_gender", "성별 값이 올바르지 않습니다. 다시 선택해 주세요."],
  ["gender_required", "성별을 선택해 주세요."],
  // WC073(tenant_required, 2026-09-22 tenant 전환) — StudentForm과 동일 매핑
  // 참고. 위닝에듀는 현재 발생하지 않지만 서버 스키마 선반영 대비.
  ["tenant_required", "소속 코드를 확인해 주세요."],
];

export default function ParentForm() {
  const navigate = useNavigate();
  const {
    memberType,
    setMemberType,
    formData,
    updateFormData,
    agreements,
    updateAgreements,
    setAllAgreements,
    verification,
    updateVerification,
    setParentSignupCompleted,
  } = useSignup();

  useEffect(() => {
    if (PARENT_SIGNUP_ENABLED && memberType !== "parent") {
      setMemberType("parent");
    }
  }, [memberType, setMemberType]);

  const [phoneSending, setPhoneSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [emailMessage, setEmailMessage] = useState<FieldMessage>({
    text: "",
    status: "default",
  });
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const phoneCooldown = useCooldown(PHONE_RESEND_COOLDOWN_SECONDS);
  const emailCooldown = useCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);

  // 서버가 시도를 세므로 같은 코드를 두 번 보내지 않는다.
  const lastPhoneAttempt = useRef("");
  const lastEmailAttempt = useRef("");

  const normalizedEmail = formData.email.trim().toLowerCase();
  const normalizedPhone = normalizePhone(formData.phone);

  // ── 휴대폰 ────────────────────────────────────────────────────────
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

    verifyPhoneCode(normalizedPhone, code).then((result) => {
      if (result.ok) {
        updateVerification("phone", { verified: true });
        setPhoneMessage({ text: "인증되었습니다", status: "success" });
        return;
      }

      setPhoneMessage({ text: result.message, status: "error" });

      // 시도가 소진되면 재발송 외에는 길이 없다. 다음 입력이 다시 시도되도록 푼다.
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

  async function handleSendPhoneCode() {
    if (!isValidMobile(formData.phone)) {
      setPhoneMessage({
        text: "올바른 전화번호를 입력해 주세요",
        status: "error",
      });
      return;
    }

    setPhoneSending(true);
    setPhoneMessage({ text: "", status: "default" });

    try {
      const result = await sendPhoneCode(normalizedPhone, "parent_signup");

      if (!result.ok) {
        if (result.retryAfter) phoneCooldown.start();

        // 이미 가입에 쓰인 번호라 문자가 나가지 않았다. 인증코드 필드를 열어두면
        // 사용자가 오지 않을 문자를 기다리게 된다.
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
          : "인증번호를 보냈습니다.",
        status: "default",
      });
    } finally {
      setPhoneSending(false);
    }
  }

  // ── 이메일 ────────────────────────────────────────────────────────
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

    verifySignupEmailCode({
      email: normalizedEmail,
      token,
      // verifySignupEmailCode는 담당 파일이 아니라 수정할 수 없다 —
      // exactOptionalPropertyTypes 때문에 값이 null이면 키 자체를 생략해 전달한다
      // (내부에서 `mode || OTP_MODE.SIGNUP`로 처리하므로 동작은 동일하다).
      ...(verification.email.mode !== null && {
        mode: verification.email.mode,
      }),
    }).then(({ error }) => {
      if (error) {
        updateVerification("email", { verified: false });
        setEmailMessage({ text: EMAIL_MESSAGES.codeMismatch, status: "error" });
        return;
      }

      updateVerification("email", { verified: true });
      setEmailMessage({ text: "인증되었습니다", status: "success" });
    });
  });

  useEffect(() => {
    onEmailCodeChange(formData.emailCode);
  }, [formData.emailCode]);

  async function handleSendEmailCode() {
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setEmailMessage({
        text: "올바른 이메일을 입력해 주세요",
        status: "error",
      });
      return;
    }

    // 비밀번호는 여기서 요구하지 않는다. 비어 있으면 임시 비밀번호로 계정이
    // 만들어지고, 실제 값은 가입 완료 직전 applySignupPassword가 채운다
    // (src/lib/signupEmailAuth.js).
    if (emailCooldown.active) {
      setEmailMessage({
        text: EMAIL_MESSAGES.cooldown(emailCooldown.remaining),
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
      const { state, mode, resumed, error } = await sendSignupEmailCode({
        email: normalizedEmail,
        password: formData.password,
        name: formData.name.trim(),
        memberType: "parent",
      });

      if (error) {
        console.error("이메일 인증코드 발송 오류:", error);
        updateVerification("email", { checked: false, available: false });
        setEmailMessage({
          // state가 없으면 상태 조회 자체가 실패한 것이고, 있으면 발송이 실패한 것이다.
          // error.message는 이제 signupEmailAuth.sendSignupEmailCode가 항상 채워
          // 보내지만(QA 2026-08-21 "{}" 노출 버그 대응), 방어적으로 한 번 더 확인한다.
          text: state
            ? error.message || EMAIL_MESSAGES.checkFailed
            : EMAIL_MESSAGES.checkFailed,
          status: "error",
        });
        return;
      }

      if (state === EMAIL_STATE.TAKEN) {
        updateVerification("email", { checked: true, available: false });
        setEmailMessage({ text: EMAIL_MESSAGES.taken, status: "error" });
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
        text: resumed ? EMAIL_MESSAGES.resumed : EMAIL_MESSAGES.sent,
        status: "default",
      });
    } finally {
      setEmailSending(false);
    }
  }

  function handlePasswordChange(value: string) {
    updateFormData({ password: value });
    if (!value) {
      setPasswordError("");
    } else if (!PASSWORD_REGEX.test(value)) {
      setPasswordError("영문/숫자/특수문자 포함 6자 이상");
    } else {
      setPasswordError("");
    }
  }

  const passwordStatus = !formData.password
    ? "default"
    : passwordError
      ? "error"
      : "success";
  const passwordHelper = !formData.password
    ? "영문/숫자/특수문자 포함 6자 이상"
    : passwordError || "영문/숫자/특수문자 포함 6자 이상";

  // T8(QA 2026-08-22): 생년월일 8자리 실시간 검증 — StudentBirth.tsx가 쓰는
  // isValidBirthDate(src/lib/validators)를 그대로 재사용해 두 화면의 판정이 갈리지
  // 않게 한다. passwordStatus/passwordHelper와 동일한 반응형 계산 패턴.
  const birthDateStatus = !formData.parentBirthDate
    ? "default"
    : formData.parentBirthDate.length !== 8
      ? "error"
      : isValidBirthDate(formData.parentBirthDate)
        ? "success"
        : "error";
  const birthDateHelper = !formData.parentBirthDate
    ? "생년월일 8자리 입력"
    : formData.parentBirthDate.length !== 8
      ? "생년월일 8자리를 정확히 입력해 주세요."
      : isValidBirthDate(formData.parentBirthDate)
        ? ""
        : "올바른 생년월일을 입력해 주세요.";

  const requiredAgreementsChecked =
    agreements.service && agreements.privacyRequired;
  const allChecked = AGREEMENT_KEYS.every((key) => agreements[key]);

  // T8(QA 2026-08-22): StudentForm.tsx의 validateForm/submitValidationMessage 패턴을
  // 그대로 가져온다 — 이전에는 canSubmit이 불리언만 계산해 "왜 막혔는지"를 보여주지
  // 않았는데, 생년월일·성별 두 필수 필드가 늘면서 버튼 비활성 이유를 알려줄 필요가
  // 커졌다. 기존 4개 조건(이름/전화·이메일 인증/비밀번호/필수약관)은 그대로 두고
  // 생년월일·성별만 추가한다.
  function validateForm() {
    if (!formData.name.trim()) return "이름을 입력해 주세요.";
    if (!verification.phone.verified) return "전화번호 인증을 완료해 주세요.";
    if (!verification.email.verified) return "이메일 인증을 완료해 주세요.";
    if (!PASSWORD_REGEX.test(formData.password)) {
      return "비밀번호는 영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.";
    }
    if (formData.parentBirthDate.length !== 8) {
      return "생년월일 8자리를 정확히 입력해 주세요.";
    }
    if (!isValidBirthDate(formData.parentBirthDate)) {
      return "올바른 생년월일을 입력해 주세요.";
    }
    if (!formData.gender) return "성별을 선택해 주세요.";
    // T8 소속코드는 선택 입력이라 빈 값은 통과시키고, 값이 있을 때만 형식을
    // 본다 — "존재하는 코드인지"는 서버 판정이라 여기서는 형식만 막는다.
    if (formData.orgCode.trim() && !isValidTenantCodeFormat(formData.orgCode)) {
      return "소속코드 형식을 확인해 주세요. (영문·숫자 8자)";
    }
    if (!requiredAgreementsChecked) {
      return "필수 약관에 동의해야 회원가입을 진행할 수 있습니다.";
    }
    return "";
  }

  const submitValidationMessage = validateForm();
  const canSubmit = submitValidationMessage === "";

  async function handleSubmit() {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setFormError("");

    try {
      // 이메일 OTP 검증 직후라 세션이 있어야 한다. 확인하지 않고 RPC를 부르면
      // not_authenticated만 보고 원인을 짐작해야 한다.
      const { data: userData, error: getUserError } =
        await supabase.auth.getUser();

      if (getUserError || !userData?.user?.id) {
        setFormError(
          "이메일 인증 세션을 찾을 수 없습니다. 다시 인증해 주세요.",
        );
        return;
      }

      if ((userData.user.email || "").toLowerCase() !== normalizedEmail) {
        setFormError(
          "인증한 이메일과 입력한 이메일이 다릅니다. 다시 인증해 주세요.",
        );
        return;
      }

      // 이메일 인증 시점의 계정 비밀번호는 임시값일 수 있다. 여기서 폼에 입력된
      // 값으로 맞추지 않으면 사용자가 방금 정한 비밀번호로 로그인할 수 없다.
      const { error: passwordError } = await applySignupPassword(
        formData.password,
      );

      if (passwordError) {
        setFormError(
          "비밀번호 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const { data: result, error } = await supabase.rpc(
        "complete_signup_profile",
        {
          p_name: formData.name.trim(),
          p_username: normalizedEmail,
          p_phone: normalizedPhone,
          p_email: normalizedEmail,
          // 학부모 폼은 지역/재학구분/학교명을 받지 않는다 → sql/40 [13]에서
          // 이 셋을 학생 전용 필수로 바꿨다.
          // 세 인자 모두 DEFAULT가 없어 PostgREST가 값을 요구하지만, 함수 본문이
          // coalesce(p_region, '')로 NULL을 받아준다(supabase/migrations/20260825093735_signup_identity_fields.sql:88-90).
          // 생성 타입은 DEFAULT 유무로만 nullable을 추정해 명시적 null 전달을 못 표현한다.
          p_region: null as unknown as string,
          p_school_type: null as unknown as string,
          p_school_name: null as unknown as string,
          p_member_type: "parent",
          p_terms_service_agreed: agreements.service,
          p_privacy_required_agreed: agreements.privacyRequired,
          // 아래 셋은 학부모 폼에 체크박스가 없다. 받지 않은 동의를 true로 보내면 안 된다.
          p_identity_required_agreed: false,
          p_privacy_optional_agreed: false,
          p_marketing_agreed: agreements.marketing,
          p_ads_agreed: false,
          // T8(QA 2026-08-22): 생년월일·성별 필수, 소속코드는 선택.
          p_birth_date: `${formData.parentBirthDate.slice(0, 4)}-${formData.parentBirthDate.slice(4, 6)}-${formData.parentBirthDate.slice(6, 8)}`,
          p_gender: formData.gender,
          // p_org_code는 DEFAULT NULL이 있는 optional 인자다. exactOptionalPropertyTypes
          // 하에서는 undefined 값을 명시적으로 넣는 것도 금지라 키 자체를 조건부로 스프레드한다
          // (인자 생략이 명시적 null과 런타임에서 동일하다).
          ...(formData.orgCode.trim() && {
            p_org_code: normalizeTenantCode(formData.orgCode),
          }),
        },
      );

      if (error) {
        const message = String(error.message || "").toLowerCase();
        const matched = RPC_ERRORS.find(([code]) => message.includes(code));

        setFormError(
          matched
            ? matched[1]
            : `회원 정보 저장 중 문제가 발생했습니다: ${error.message}`,
        );
        return;
      }

      // 생성 타입은 RPC 반환을 Json으로만 표현한다 — 실제 payload 모양은
      // SignupProfileRpcResult(src/lib/parentLink.ts) 참고.
      const signupResult = result as unknown as SignupProfileRpcResult;

      if (!signupResult?.ok) {
        setFormError(
          "회원 정보 저장 결과를 확인할 수 없습니다. 다시 시도해 주세요.",
        );
        return;
      }

      setParentSignupCompleted(true);

      // 가입 축하 쿠폰 발급 + 안내 알림톡 (학부모 가입에만 있는 단계,
      // 2026-08-25 회의 확정). 기다리지 않는다 — 알리고 왕복이 몇 초 걸릴 수
      // 있고, 문자가 늦거나 실패해도 가입은 이미 끝났다. 서버가 member_type 을
      // 한 번 더 확인하고 중복 발송도 막으므로 여기서 조건을 더 걸지 않는다
      // (api/signup-welcome.ts 상단 주석).
      void (async () => {
        try {
          const authHeader = await getAuthHeader();
          if (!authHeader) return;

          await apiFetch("/api/signup-welcome", {
            method: "POST",
            headers: authHeader,
          });
        } catch (error) {
          // 화면에 띄우지 않는다 — 사용자가 할 수 있는 게 없다.
          console.error("가입 축하 알림톡 요청 실패:", error);
        }
      })();

      // ⚠️ 여기서 signOut 하지 않는다 — 파일 상단 주석 참고.
      navigate("/signup/parent/link");
    } catch (error) {
      // toErrorMessage 를 거친다 — error.message 를 그대로 붙이면 auth-js 가
      // 폴백으로 넣은 "{}" 가 화면에 그대로 나간다(QA 33, 그 함수 위 주석).
      setFormError(
        `가입 처리 중 오류가 발생했습니다: ${toErrorMessage(error, "잠시 후 다시 시도해 주세요.")}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!PARENT_SIGNUP_ENABLED) {
    return (
      <AuthLayout>
        <AuthTitle line1="학부모 회원가입은 준비 중입니다" />

        <p className="w-full text-center text-sm text-ink">
          실제 계정 생성 연동이 완료된 후 오픈될 예정입니다. 잠시 후 다시 시도해
          주세요.
        </p>
      </AuthLayout>
    );
  }

  const phoneResendLabel = phoneCooldown.active
    ? `${phoneCooldown.remaining}초 후 다시 보내기`
    : "인증번호 다시 보내기";

  return (
    <AuthLayout>
      <AuthTitle
        line1={
          <span className="sm:whitespace-nowrap">
            회원가입 정보를 입력해주세요
          </span>
        }
      />

      <div className="flex w-full flex-col gap-5">
        <h2 className="w-full text-lg font-semibold text-ink">
          학부모 기본 정보 (필수)
        </h2>

        <TextField
          label="이름"
          id="name"
          name="name"
          value={formData.name}
          onChange={(value) => updateFormData({ name: value })}
          placeholder="이름을 입력 해주세요"
          required
        />

        {/* T8(QA 2026-08-22): 학부모는 학생과 달리 회원가입 흐름에서 생년월일을 아직
            입력받지 않으므로(ParentForm 진입 전 별도 단계 없음) 여기서 직접 받는다.
            검증은 StudentBirth.tsx와 같은 isValidBirthDate(src/lib/validators)를 쓴다. */}
        <TextField
          label="생년월일"
          id="parent-birth-date"
          name="parentBirthDate"
          type="text"
          inputMode="numeric"
          value={formData.parentBirthDate}
          onChange={(value) =>
            updateFormData({
              parentBirthDate: value.replace(/\D/g, "").slice(0, 8),
            })
          }
          placeholder="생년월일 8자리 입력"
          helperText={birthDateHelper}
          status={birthDateStatus}
          autoComplete="off"
          required
        />

        <SelectField
          label="성별"
          id="parent-gender"
          name="gender"
          value={formData.gender}
          onChange={(value) => updateFormData({ gender: value })}
          placeholder="성별을 선택해주세요"
          options={GENDER_OPTIONS}
          required
        />

        <TextField
          label="전화번호"
          id="phone"
          name="phone"
          type="tel"
          value={formData.phone}
          // 자동 하이픈 포맷(010-1234-5678, QA 지시 2026-08-21) — src/lib/phoneVerification.ts
          // formatPhoneInput, 멘토신청·프리미엄이용 폼과 공유하는 유틸이다. 서버 전송 값은
          // normalizedPhone(normalizePhone)이 별도로 숫자만 남긴다.
          onChange={(value) =>
            updateFormData({ phone: formatPhoneInput(value) })
          }
          placeholder="전화번호를 입력 해주세요"
          actionLabel="인증번호 보내기"
          onAction={handleSendPhoneCode}
          actionDisabled={
            phoneSending || phoneCooldown.active || verification.phone.verified
          }
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          // 상태 메시지가 없을 때는 하이픈 자동 포맷 안내를 기본으로 보여준다.
          helperText={
            verification.phone.verified
              ? ""
              : phoneMessage.text || "하이픈은 자동으로 입력돼요."
          }
          status={verification.phone.verified ? "default" : phoneMessage.status}
          required
        />

        <TextField
          label="전화번호 인증번호"
          id="phoneCode"
          name="phoneCode"
          value={formData.phoneCode}
          onChange={(value) =>
            updateFormData({ phoneCode: value.replace(/\D/g, "").slice(0, 6) })
          }
          placeholder="카카오톡으로 보낸 인증번호를 입력 해주세요"
          actionLabel={phoneResendLabel}
          onAction={handleSendPhoneCode}
          actionDisabled={
            !verification.phone.requested ||
            phoneSending ||
            phoneCooldown.active ||
            verification.phone.verified
          }
          helperText={phoneMessage.text}
          status={verification.phone.verified ? "success" : phoneMessage.status}
          disabled={
            !verification.phone.requested || verification.phone.verified
          }
        />

        <TextField
          label="아이디(이메일)"
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={(value) => updateFormData({ email: value })}
          placeholder="이메일을 입력 해주세요"
          actionLabel={
            emailCooldown.active
              ? `${emailCooldown.remaining}초 후 다시 보내기`
              : "인증번호 보내기"
          }
          onAction={handleSendEmailCode}
          actionDisabled={
            emailSending || emailCooldown.active || verification.email.verified
          }
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          helperText={verification.email.verified ? "" : emailMessage.text}
          status={verification.email.verified ? "default" : emailMessage.status}
          required
        />

        <TextField
          label="이메일 인증코드"
          id="emailCode"
          name="emailCode"
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
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handlePasswordChange}
          placeholder="비밀번호를 입력 해주세요"
          helperText={passwordHelper}
          status={passwordStatus}
          required
        />

        {/* T8(QA 2026-08-22): 소속코드 — 선택 입력. 2026-09-22 tenant 전환으로
            8자 코드 형식 검증이 생겼다(validateForm). */}
        <TextField
          label="소속코드 (선택)"
          id="parent-org-code"
          name="orgCode"
          value={formData.orgCode}
          onChange={(value) => updateFormData({ orgCode: value })}
          placeholder="소속코드가 없으면 입력하지 마세요"
          helperText="소속코드가 없으면 입력하지 마세요 (영문·숫자 8자)"
        />
      </div>

      <div className="flex w-full flex-col gap-5">
        <h2 className="w-full text-lg font-semibold text-ink">약관 동의</h2>

        <AgreementList
          items={AGREEMENT_LABELS.map((item) => ({
            ...item,
            checked: agreements[item.key],
          }))}
          allChecked={allChecked}
          onToggleAll={() => setAllAgreements(!allChecked, AGREEMENT_KEYS)}
          onToggleItem={(key) => updateAgreements({ [key]: !agreements[key] })}
        />
      </div>

      {formError && (
        <p className="w-full text-center text-sm text-red-500">{formError}</p>
      )}

      {!canSubmit && !submitting && submitValidationMessage && (
        <p role="status" className="w-full text-xs text-ink-sub">
          {submitValidationMessage}
        </p>
      )}

      <PrimaryButton
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        loading={submitting}
      >
        가입 완료하기
      </PrimaryButton>
    </AuthLayout>
  );
}
