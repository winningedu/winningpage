// 4단계 학부모 정보(사 #103, 결정 r8, 76). 14세 이상은 선택이고 건너뛸 수 있다.
// 14세 미만은 건너뛸 수 없다. 번호는 PASS가 준 법정대리인 번호로 잠그고 수집 동의를 받는다.
import { useEffect } from "react";
import {
  AuthTitle,
  OutlineButton,
  SelectField,
  TextField,
} from "@/components/auth";
import AgreementRow from "@/components/auth/AgreementRow";
import { useSignup } from "@/context/SignupContext";
import { formatPhoneInput } from "@/lib/phoneVerification";
import { fetchIdentityMobile } from "../identityVerification";
import { GUARDIAN_MESSAGES } from "./copy";
import Notice from "./Notice";
import PhoneVerifyField from "./PhoneVerifyField";
import StepActions from "./StepActions";

const RELATION_OPTIONS = ["아버지", "어머니", "기타"];

interface GuardianStepProps {
  onPrev: () => void;
  // withGuardian이 false면 입력해 둔 학부모 정보를 보내지 않는다(건너뛰기).
  onSubmit: (withGuardian: boolean) => void;
  submitting: boolean;
  submitError: { message: string; hint?: "findId" | "inquiry" } | null;
}

export default function GuardianStep({
  onPrev,
  onSubmit,
  submitting,
  submitError,
}: GuardianStepProps) {
  const {
    formData,
    updateFormData,
    isUnder14,
    verification,
    updateVerification,
  } = useSignup();

  const isMinor = isUnder14 === true;
  const { mobile, requestId } = verification.pass;

  // PASS가 준 번호를 채운다. 콜백이 번호를 못 실어 왔으면 requestId로 다시 조회한다.
  useEffect(() => {
    if (!isMinor) return;

    if (mobile) {
      updateFormData({ guardianPhone: formatPhoneInput(mobile) });
      return;
    }

    if (requestId) {
      fetchIdentityMobile(requestId).then((fetched) => {
        if (fetched)
          updateFormData({ guardianPhone: formatPhoneInput(fetched) });
      });
    }
  }, [isMinor, mobile, requestId, updateFormData]);

  const isPhoneUnverified =
    !isMinor &&
    formData.guardianPhone !== "" &&
    !verification.guardianPhone.verified;
  const isConsentMissing = isMinor && !formData.guardianConsent;

  return (
    <>
      <AuthTitle line1="학부모 정보를 입력해 주세요" line1Color="ink" />

      <div className="flex w-full flex-col gap-5">
        <TextField
          label="학부모 이름"
          id="school-guardian-name"
          name="guardianName"
          size="lg"
          value={formData.guardianName}
          onChange={(guardianName) => updateFormData({ guardianName })}
        />

        {isMinor ? (
          <TextField
            label="학부모 휴대폰번호"
            id="school-guardian-phone"
            name="guardianPhone"
            size="lg"
            value={formData.guardianPhone}
            disabled
          />
        ) : (
          <PhoneVerifyField
            idPrefix="school-guardian"
            label="학부모 휴대폰번호"
            codeLabel="학부모 인증번호"
            phone={formData.guardianPhone}
            onPhoneChange={(guardianPhone) => updateFormData({ guardianPhone })}
            purpose="guardian_signup"
            state={verification.guardianPhone}
            onStateChange={(state) =>
              updateVerification("guardianPhone", state)
            }
          />
        )}

        <SelectField
          label="관계"
          id="school-guardian-relation"
          name="guardianRelation"
          size="lg"
          value={formData.guardianRelation}
          onChange={(guardianRelation) => updateFormData({ guardianRelation })}
          options={RELATION_OPTIONS}
          placeholder="선택"
        />

        {isMinor && (
          <AgreementRow
            required
            label={GUARDIAN_MESSAGES.consent}
            checked={formData.guardianConsent}
            onToggle={() =>
              updateFormData({ guardianConsent: !formData.guardianConsent })
            }
          />
        )}
      </div>

      {submitError && (
        <Notice
          message={submitError.message}
          {...(submitError.hint && { hint: submitError.hint })}
        />
      )}

      <StepActions
        onPrev={onPrev}
        onNext={() => onSubmit(true)}
        nextDisabled={isPhoneUnverified || isConsentMissing}
        loading={submitting}
      />

      {!isMinor && (
        <OutlineButton tone="muted" onClick={() => onSubmit(false)}>
          건너뛰기
        </OutlineButton>
      )}
    </>
  );
}
