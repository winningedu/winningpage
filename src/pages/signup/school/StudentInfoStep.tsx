// 3단계 학생 정보(사 #101, 결정 r7, 교 결정 r10).
// 학교는 반이 숫자, 학원은 글자도 받고 그룹을 적는다. 기타 소속은 반과 번호를 받지 않는다(결정 77).
import { useEffect, useState } from "react";
import {
  AuthTitle,
  PrimaryButton,
  SelectField,
  TextField,
} from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import { usePwnedPasswordCheck } from "@/hooks/usePwnedPasswordCheck";
import { PWNED_PASSWORD_MESSAGE } from "@/lib/pwnedPassword";
import { normalizeTenantCode } from "@/lib/tenantCode";
import { runIdentityVerification } from "../identityVerification";
import { isValidPassword } from "../StudentForm";
import { INFO_MESSAGES, type SubmitError } from "./copy";
import EmailVerifyField from "./EmailVerifyField";
import Notice from "./Notice";
import PhoneVerifyField from "./PhoneVerifyField";
import { ENROLLMENT_GRADES, isValidClassNumber } from "./rules";
import StepActions from "./StepActions";

const GENDER_OPTIONS = ["남", "여"];
const SCHOOL_ORG_TYPE = "학교";

interface StudentInfoStepProps {
  onPrev: () => void;
  onNext: () => void;
  submitError: SubmitError | null;
}

export default function StudentInfoStep({
  onPrev,
  onNext,
  submitError,
}: StudentInfoStepProps) {
  const {
    formData,
    updateFormData,
    tenant,
    birthDate,
    setBirthDate,
    isUnder14,
    verification,
    updateVerification,
  } = useSignup();

  const isCatchAll = tenant?.isCatchAll === true;
  const orgType = tenant && !tenant.isCatchAll ? tenant.orgType : null;
  const isSchool = orgType === SCHOOL_ORG_TYPE;
  const showGroup = orgType !== null && !isSchool;
  const showClass = !isCatchAll;
  // 번호 중복은 소속 안에서만 본다(결정 r8). 기타 소속은 기타끼리다.
  const phoneScope =
    tenant && !tenant.isCatchAll
      ? { tenantCode: normalizeTenantCode(formData.orgCode) }
      : { catchAll: true };

  const pwnedCheck = usePwnedPasswordCheck();
  const { markPwned } = pwnedCheck;
  const rejectedAsPwned = submitError?.pwnedPassword === true;

  // 저장할 때 Supabase가 유출된 비밀번호라고 거절하면 이 단계로 돌아와 칸에 보인다.
  useEffect(() => {
    if (rejectedAsPwned) markPwned();
  }, [rejectedAsPwned, markPwned]);

  const [passVerifying, setPassVerifying] = useState(false);
  const [passError, setPassError] = useState("");

  // 14세 미만 가입은 배포마다 열고 닫는다(NICE 계약 선행). 렌더 시점에 읽는다.
  const isUnder14Open = import.meta.env.VITE_UNDER14_SIGNUP_ENABLED === "true";
  const isUnder14Blocked = isUnder14 === true && !isUnder14Open;
  const needsPass = isUnder14 === true && isUnder14Open;

  // 클릭 핸들러에서 곧장 불러야 팝업이 차단되지 않는다.
  async function handlePass() {
    if (passVerifying) return;

    setPassVerifying(true);
    setPassError("");
    try {
      const result = await runIdentityVerification({
        purpose: "under14_guardian",
      });

      if (!result.ok) {
        setPassError(result.message);
        return;
      }

      updateVerification("pass", {
        verified: true,
        requestId: result.requestId,
        verifiedAt: Date.now(),
        mobile: result.mobile,
      });
    } finally {
      setPassVerifying(false);
    }
  }

  const passwordMismatch =
    formData.passwordConfirm !== "" &&
    formData.password !== formData.passwordConfirm;
  const birthDateInvalid = birthDate.length === 8 && isUnder14 === null;
  const birthDateMessage = (() => {
    if (birthDateInvalid) return INFO_MESSAGES.invalidBirthDate;
    return isUnder14Blocked ? INFO_MESSAGES.under14Closed : "";
  })();

  const isNumberOk =
    formData.classNumber === "" || isValidClassNumber(formData.classNumber);
  // 14세 미만은 본인 번호가 선택이다. 적었다면 인증까지 마쳐야 한다(결정 72).
  const isPhoneOk =
    verification.phone.verified ||
    (isUnder14 === true && formData.phone === "");
  const canProceed =
    formData.name.trim() !== "" &&
    isValidPassword(formData.password) &&
    !passwordMismatch &&
    formData.passwordConfirm !== "" &&
    isPhoneOk &&
    !isUnder14Blocked &&
    (!needsPass || verification.pass.verified) &&
    verification.email.verified &&
    isUnder14 !== null &&
    formData.gender !== "" &&
    formData.grade !== "" &&
    (!showClass || (formData.className.trim() !== "" && isNumberOk));

  async function handleNext() {
    if (await pwnedCheck.ensureChecked(formData.password)) return;
    onNext();
  }

  function field(key: keyof typeof formData) {
    return (value: string) => updateFormData({ [key]: value });
  }

  return (
    <>
      <AuthTitle line1="학생 정보를 입력해 주세요" line1Color="ink" />

      <div className="flex w-full flex-col gap-5">
        <TextField
          label="이름"
          id="school-name"
          name="name"
          size="lg"
          value={formData.name}
          onChange={field("name")}
          autoComplete="name"
        />

        <TextField
          label="비밀번호"
          id="school-password"
          name="password"
          type="password"
          size="lg"
          value={formData.password}
          onChange={(value) => {
            pwnedCheck.reset();
            updateFormData({ password: value });
          }}
          onBlur={() => {
            if (isValidPassword(formData.password))
              pwnedCheck.checkOnBlur(formData.password);
          }}
          helperText={
            pwnedCheck.pwned
              ? PWNED_PASSWORD_MESSAGE
              : INFO_MESSAGES.passwordRule
          }
          status={
            pwnedCheck.pwned ||
            (formData.password && !isValidPassword(formData.password))
              ? "error"
              : "default"
          }
          autoComplete="new-password"
        />

        <TextField
          label="비밀번호 확인"
          id="school-password-confirm"
          name="passwordConfirm"
          type="password"
          size="lg"
          value={formData.passwordConfirm}
          onChange={field("passwordConfirm")}
          helperText={passwordMismatch ? INFO_MESSAGES.passwordMismatch : ""}
          status={passwordMismatch ? "error" : "default"}
          autoComplete="new-password"
        />

        {/* 이메일 인증번호는 발송에 시간이 걸리고, 휴대폰 인증은 10분 뒤 만료되어 이메일을 먼저 받는다. */}
        <EmailVerifyField
          idPrefix="school"
          label="이메일"
          codeLabel="이메일 인증번호"
          email={formData.email}
          onEmailChange={(email) => updateFormData({ email })}
          code={formData.emailCode}
          onCodeChange={(emailCode) => updateFormData({ emailCode })}
          name={formData.name.trim()}
          state={verification.email}
          onStateChange={(state) => updateVerification("email", state)}
        />

        <PhoneVerifyField
          idPrefix="school"
          label={isUnder14 === true ? "휴대폰번호(선택)" : "휴대폰번호"}
          codeLabel="휴대폰 인증번호"
          phone={formData.phone}
          onPhoneChange={(phone) => updateFormData({ phone })}
          purpose="signup"
          scope={phoneScope}
          state={verification.phone}
          onStateChange={(state) => updateVerification("phone", state)}
        />

        <TextField
          label="생년월일"
          id="school-birth-date"
          name="birthDate"
          size="lg"
          inputMode="numeric"
          placeholder="생년월일 8자리 입력"
          value={birthDate}
          onChange={(value) =>
            setBirthDate(value.replace(/\D/g, "").slice(0, 8))
          }
          helperText={birthDateMessage}
          status={birthDateMessage ? "error" : "default"}
          autoComplete="bday"
        />

        {needsPass && (
          <div className="flex flex-col gap-3 rounded-lg bg-surface-card p-5">
            <p className="break-keep text-sm text-ink">
              {INFO_MESSAGES.passGuide}
            </p>
            {verification.pass.verified ? (
              <p className="text-sm font-medium text-accent">
                {INFO_MESSAGES.passDone}
              </p>
            ) : (
              <PrimaryButton onClick={handlePass} loading={passVerifying}>
                PASS 간편 인증
              </PrimaryButton>
            )}
            {passError && <p className="text-xs text-error">{passError}</p>}
          </div>
        )}

        <SelectField
          label="성별"
          id="school-gender"
          name="gender"
          size="lg"
          value={formData.gender}
          onChange={field("gender")}
          options={GENDER_OPTIONS}
          placeholder="선택"
        />

        <SelectField
          label="학년"
          id="school-grade"
          name="grade"
          size="lg"
          value={formData.grade}
          onChange={field("grade")}
          options={[...ENROLLMENT_GRADES]}
          placeholder="선택"
        />

        {showGroup && (
          <TextField
            label="그룹(선택)"
            id="school-group-name"
            name="groupName"
            size="lg"
            value={formData.groupName}
            onChange={field("groupName")}
          />
        )}

        {showClass && (
          <>
            <TextField
              label="반"
              id="school-class-name"
              name="className"
              size="lg"
              // 학교는 숫자만, 학원은 글자도 받는다.
              inputMode={isSchool ? "numeric" : "text"}
              value={formData.className}
              onChange={(value) =>
                updateFormData({
                  className: isSchool ? value.replace(/\D/g, "") : value,
                })
              }
            />

            <TextField
              label="번호(선택)"
              id="school-class-number"
              name="classNumber"
              size="lg"
              inputMode="numeric"
              value={formData.classNumber}
              onChange={(value) =>
                updateFormData({
                  classNumber: value.replace(/\D/g, "").slice(0, 2),
                })
              }
            />

            <p className="break-keep text-xs text-ink-sub">
              {INFO_MESSAGES.classHint}
            </p>
          </>
        )}
      </div>

      {submitError?.message && (
        <Notice
          message={submitError.message}
          {...(submitError.hint && { hint: submitError.hint })}
        />
      )}

      <StepActions
        onPrev={onPrev}
        onNext={handleNext}
        nextDisabled={!canProceed}
      />
    </>
  );
}
