// 스쿨멘토 학생 가입(사 #98): 1약관 동의, 2소속 확인, 3학생 정보, 4학부모 정보(선택), 5가입 완료.
// 단계마다 이전, 다음이 있고 입력값은 SignupContext에 있어 단계를 오가도 유지된다.
import { useState } from "react";
import { useNavigate } from "react-router";
import { AuthLayout } from "@/components/auth";
import { type SchoolStep, useSignup } from "@/context/SignupContext";
import { getAuthHeader } from "@/lib/apiFetch";
import { isPwnedPasswordError } from "@/lib/pwnedPassword";
import { applySignupPassword } from "@/lib/signupEmailAuth";
import { supabase } from "@/lib/supabase";
import { submitSchoolSignup } from "./api";
import CompleteStep from "./CompleteStep";
import {
  GENERIC_SUBMIT_ERROR,
  SUBMIT_ERRORS,
  type SubmitError,
  validationError,
} from "./copy";
import GuardianStep from "./GuardianStep";
import { buildSignupBody } from "./rules";
import StudentInfoStep from "./StudentInfoStep";
import TenantStep from "./TenantStep";
import TermsStep from "./TermsStep";

const STEP_TITLES = [
  "약관 동의",
  "소속 확인",
  "학생 정보",
  "학부모 정보(선택)",
  "가입 완료",
];

export default function SchoolSignup() {
  const navigate = useNavigate();
  const signup = useSignup();
  const {
    schoolStep: savedStep,
    setSchoolStep,
    tenant,
    formData,
    verification,
    updateFormData,
    setTenant,
    updateVerification,
    setLinkCode,
    setSignupCompleted,
  } = signup;
  // 소속 없이 3, 4단계가 저장돼 있으면(새로고침 등) 소속 확인부터 다시 한다.
  const schoolStep =
    (savedStep === 3 || savedStep === 4) && !tenant ? 2 : savedStep;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);

  function goTo(step: number) {
    setSubmitError(null);
    setSchoolStep(step as SchoolStep);
  }

  function resetEmailVerification() {
    updateVerification("email", {
      requested: false,
      verified: false,
      checked: false,
      available: false,
      mode: null,
      resumed: false,
    });
    updateFormData({ emailCode: "" });
  }

  // 서버가 거절한 칸이 있는 단계로 돌려보낸다.
  function showSubmitError(code: string, field?: string) {
    const error =
      code === "VALIDATION"
        ? validationError(field)
        : (SUBMIT_ERRORS[code] ?? GENERIC_SUBMIT_ERROR);

    if (code === "UNAUTHENTICATED" || code === "EMAIL_NOT_VERIFIED") {
      resetEmailVerification();
    }
    if (
      code === "TENANT_NOT_FOUND" ||
      code === "WC068" ||
      (code === "VALIDATION" && field === "tenantCode")
    ) {
      setTenant(null);
    }
    if (code === "IDENTITY_REQUIRED") {
      updateVerification("pass", { verified: false });
    }
    if (code === "PHONE_TAKEN" || code === "PHONE_NOT_VERIFIED") {
      updateVerification("phone", { requested: false, verified: false });
    }
    if (code === "GUARDIAN_PHONE_NOT_VERIFIED") {
      updateVerification("guardianPhone", {
        requested: false,
        verified: false,
      });
    }

    setSubmitError(error);
    setSchoolStep(error.step);
  }

  function finish(linkCode: string | null) {
    setLinkCode(linkCode);
    setSignupCompleted(true);
    setSchoolStep(5);
  }

  async function handleSubmit(withGuardian: boolean) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // 새로고침하면 비밀번호는 비고 인증 세션만 남는다. 이때 보내면 계정에 임시
      // 비밀번호가 남은 채 가입이 끝나므로, 3단계에서 인증과 비밀번호를 다시 받는다.
      if (!formData.password || !verification.email.verified) {
        showSubmitError("EMAIL_NOT_VERIFIED");
        return;
      }

      // 이메일 인증으로 브라우저에 만들어진 세션이 인증한 이메일의 것인지 확인한다.
      const { data } = await supabase.auth.getUser();
      const verifiedEmail = formData.email.trim().toLowerCase();

      if (data.user?.email?.toLowerCase() !== verifiedEmail) {
        showSubmitError("EMAIL_NOT_VERIFIED");
        return;
      }

      const passwordResult = await applySignupPassword(formData.password);

      if (passwordResult.error) {
        // GoTrue가 정책 미달로 거절했다. 3단계 비밀번호 칸에서 고치게 한다.
        const code = (passwordResult.error as { code?: string }).code;

        if (isPwnedPasswordError(passwordResult.error)) {
          showSubmitError("PWNED_PASSWORD");
          return;
        }
        if (code === "weak_password") {
          showSubmitError("VALIDATION", "password");
          return;
        }
        showSubmitError("UNKNOWN");
        return;
      }

      const authHeader = await getAuthHeader();

      if (!authHeader) {
        showSubmitError("UNAUTHENTICATED");
        return;
      }

      const result = await submitSchoolSignup(
        buildSignupBody(signup, withGuardian),
        authHeader,
      );

      // 같은 계정으로 이미 가입이 끝났다. 다시 보낸 요청이므로 성공으로 본다.
      if (!result.ok && result.code === "ALREADY_SIGNED_UP") {
        finish(null);
        return;
      }

      if (!result.ok) {
        showSubmitError(result.code, result.field);
        return;
      }

      finish(result.linkCode);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <ol className="flex w-full justify-between gap-1 text-xs text-ink-sub">
        {STEP_TITLES.map((title, index) => (
          <li
            key={title}
            aria-current={index + 1 === schoolStep ? "step" : undefined}
            className={
              index + 1 === schoolStep ? "font-semibold text-primary" : ""
            }
          >
            {index + 1}. {title}
          </li>
        ))}
      </ol>

      {schoolStep === 1 && (
        <TermsStep onPrev={() => navigate("/signup")} onNext={() => goTo(2)} />
      )}

      {schoolStep === 2 && (
        <TenantStep
          onPrev={() => goTo(1)}
          onNext={() => goTo(3)}
          submitError={submitError?.step === 2 ? submitError : null}
        />
      )}

      {schoolStep === 3 && (
        <StudentInfoStep
          onPrev={() => goTo(2)}
          onNext={() => goTo(4)}
          submitError={submitError?.step === 3 ? submitError : null}
        />
      )}

      {schoolStep === 4 && (
        <GuardianStep
          onPrev={() => goTo(3)}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError?.step === 4 ? submitError : null}
        />
      )}

      {schoolStep === 5 && <CompleteStep />}
    </AuthLayout>
  );
}
