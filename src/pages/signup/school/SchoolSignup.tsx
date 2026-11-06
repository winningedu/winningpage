// 스쿨멘토 학생 가입(사 #98): 1약관 동의, 2소속 확인, 3학생 정보, 4학부모 정보(선택), 5가입 완료.
// 단계마다 이전, 다음이 있고 입력값은 SignupContext에 있어 단계를 오가도 유지된다.
import { useNavigate } from "react-router";
import { AuthLayout } from "@/components/auth";
import { type SchoolStep, useSignup } from "@/context/SignupContext";
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
  const { schoolStep, setSchoolStep } = useSignup();

  function goTo(step: number) {
    setSchoolStep(step as SchoolStep);
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
        <TenantStep onPrev={() => goTo(1)} onNext={() => goTo(3)} />
      )}

      {schoolStep === 3 && (
        <StudentInfoStep onPrev={() => goTo(2)} onNext={() => goTo(4)} />
      )}
    </AuthLayout>
  );
}
