// 스쿨멘토 학생 가입(사 #98): 1약관 동의, 2소속 확인, 3학생 정보, 4학부모 정보(선택), 5가입 완료.
// 단계마다 이전, 다음이 있고 입력값은 SignupContext에 있어 단계를 오가도 유지된다.
import { useState } from "react";
import { useNavigate } from "react-router";
import { AuthLayout } from "@/components/auth";
import { type SchoolStep, useSignup } from "@/context/SignupContext";
import { supabase } from "@/lib/supabase";
import { submitSchoolSignup } from "./api";
import CompleteStep from "./CompleteStep";
import { GENERIC_SUBMIT_ERROR, SUBMIT_ERRORS, type SubmitError } from "./copy";
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
    setUsernameCheck,
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

  // 서버가 거절한 칸이 있는 단계로 돌려보낸다.
  function showSubmitError(code: string) {
    const error = SUBMIT_ERRORS[code] ?? GENERIC_SUBMIT_ERROR;

    if (code === "USERNAME_TAKEN") {
      setUsernameCheck({ value: formData.username, available: false });
    }
    if (code === "TENANT_NOT_FOUND") setTenant(null);
    if (code === "IDENTITY_REQUIRED") {
      updateVerification("pass", { verified: false });
    }
    if (code === "PHONE_TAKEN" || code === "PHONE_NOT_VERIFIED") {
      updateVerification("phone", { requested: false, verified: false });
    }

    setSubmitError(error);
    setSchoolStep(error.step);
  }

  async function handleSubmit(withGuardian: boolean) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitSchoolSignup(
        buildSignupBody(signup, withGuardian),
      );

      if (!result.ok) {
        showSubmitError(result.code);
        return;
      }

      await supabase.auth.setSession(result.session);
      setLinkCode(result.linkCode);
      setSignupCompleted(true);
      setSchoolStep(5);
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
