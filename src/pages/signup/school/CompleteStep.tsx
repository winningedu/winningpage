// 5단계 가입 완료(사 #108). 버튼은 학습진단 시작하기, 서비스 둘러보기 두 개다(결정 78).
// 연결코드 안내는 위닝 가입 완료 화면과 같이 VITE_CHILD_LINK_ENABLED 로 켠다.
import { useNavigate } from "react-router";
import {
  AuthTitle,
  InfoCard,
  OutlineButton,
  PrimaryButton,
} from "@/components/auth";
import { site } from "@/config/site";
import { useSignup } from "@/context/SignupContext";

export default function CompleteStep() {
  const navigate = useNavigate();
  const { formData, linkCode, resetSignup } = useSignup();

  const childLinkEnabled = import.meta.env.VITE_CHILD_LINK_ENABLED === "true";
  const studentName = formData.name.trim();

  // 로그인 세션은 그대로 둔 채 가입 흐름 상태만 비운다.
  function leaveTo(path: string) {
    resetSignup();
    navigate(path);
  }

  return (
    <>
      <AuthTitle
        line1={`${studentName}님, ${site.brandName} 회원이 되신 것을 환영해요`}
        line1Color="ink"
      />

      {childLinkEnabled && linkCode && (
        <InfoCard variant="card" className="w-full text-center">
          코드를 학부모님께 알려주면 학부모 대시보드에 내 학습 현황이 자동으로
          연결돼요
          <span className="mt-3 block text-xl font-medium tracking-[0.2em] text-accent">
            {linkCode}
          </span>
        </InfoCard>
      )}

      <div className="flex w-full flex-col gap-3">
        <PrimaryButton onClick={() => leaveTo("/services/learning-diagnosis")}>
          학습진단 시작하기
        </PrimaryButton>
        <OutlineButton tone="muted" onClick={() => leaveTo("/")}>
          서비스 둘러보기
        </OutlineButton>
      </div>
    </>
  );
}
