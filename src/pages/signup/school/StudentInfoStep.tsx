// 3단계 학생 정보(사 #101, 결정 r7, 교 결정 r10).
// 학교는 반이 숫자, 학원은 글자도 받고 그룹을 적는다. 기타 소속은 반과 번호를 받지 않는다(결정 77).
import { useState } from "react";
import { AuthTitle, SelectField, TextField } from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import { isValidPassword } from "../StudentForm";
import { checkUsernameAvailable } from "./api";
import { INFO_MESSAGES, USERNAME_MESSAGES } from "./copy";
import PhoneVerifyField from "./PhoneVerifyField";
import { ENROLLMENT_GRADES, isValidUsername } from "./rules";
import StepActions from "./StepActions";

const GENDER_OPTIONS = ["남", "여"];
const SCHOOL_ORG_TYPE = "학교";

interface StudentInfoStepProps {
  onPrev: () => void;
  onNext: () => void;
}

export default function StudentInfoStep({
  onPrev,
  onNext,
}: StudentInfoStepProps) {
  const {
    formData,
    updateFormData,
    tenant,
    birthDate,
    setBirthDate,
    isUnder14,
    usernameCheck,
    setUsernameCheck,
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
    tenant && !tenant.isCatchAll ? { tenantId: tenant.id } : { catchAll: true };

  const [usernameError, setUsernameError] = useState("");

  // 확인한 아이디와 지금 아이디가 같을 때만 결과가 살아 있다(고치면 버려진다).
  const usernameResult =
    usernameCheck?.value === formData.username ? usernameCheck : null;

  async function handleUsernameCheck() {
    if (!isValidUsername(formData.username)) {
      setUsernameError(USERNAME_MESSAGES.invalidFormat);
      return;
    }

    const available = await checkUsernameAvailable(formData.username);

    if (available === null) {
      setUsernameError(USERNAME_MESSAGES.failed);
      return;
    }

    setUsernameCheck({ value: formData.username, available });
  }

  const usernameField = (() => {
    if (usernameError) return { text: usernameError, status: "error" as const };
    if (!usernameResult) return { text: "", status: "default" as const };
    return usernameResult.available
      ? { text: USERNAME_MESSAGES.available, status: "success" as const }
      : { text: USERNAME_MESSAGES.taken, status: "error" as const };
  })();

  const passwordMismatch =
    formData.passwordConfirm !== "" &&
    formData.password !== formData.passwordConfirm;
  const birthDateInvalid = birthDate.length === 8 && isUnder14 === null;

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
          label="아이디"
          id="school-username"
          name="username"
          size="lg"
          value={formData.username}
          onChange={(value) => {
            updateFormData({ username: value });
            setUsernameError("");
          }}
          actionLabel="중복 확인"
          onAction={handleUsernameCheck}
          helperText={usernameField.text}
          status={usernameField.status}
          autoComplete="username"
        />

        <TextField
          label="비밀번호"
          id="school-password"
          name="password"
          type="password"
          size="lg"
          value={formData.password}
          onChange={field("password")}
          helperText={INFO_MESSAGES.passwordRule}
          status={
            formData.password && !isValidPassword(formData.password)
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

        <PhoneVerifyField
          idPrefix="school"
          label="휴대폰번호"
          codeLabel="휴대폰 인증번호"
          phone={formData.phone}
          onPhoneChange={(phone) => updateFormData({ phone })}
          purpose="signup"
          scope={phoneScope}
          state={verification.phone}
          onStateChange={(state) => updateVerification("phone", state)}
        />

        <TextField
          label="이메일"
          id="school-email"
          name="email"
          type="email"
          size="lg"
          value={formData.email}
          onChange={field("email")}
          autoComplete="email"
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
          helperText={birthDateInvalid ? INFO_MESSAGES.invalidBirthDate : ""}
          status={birthDateInvalid ? "error" : "default"}
          autoComplete="bday"
        />

        {isUnder14 !== true && (
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
        )}

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

      <StepActions onPrev={onPrev} onNext={onNext} />
    </>
  );
}
