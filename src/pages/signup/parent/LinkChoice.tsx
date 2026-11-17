// [E-2/E-5] 자녀 연결 방법 선택 — docs/login-signup-renewal-spec.md §3.3 E-2(노드 2393:11429)
// / E-5(노드 2393-11319). 두 화면은 카드 2개 구조가 동일하고 타이틀·건너뛰기 목적지만 다르므로
// mode prop으로 공용 구현한다("§3.3 E-5: 구현 시 E-2와 동일 컴포넌트에 타이틀 prop 분기로
// 처리 가능" 채택).
// mode='initial'(E-2, 학부모 가입 직후) — 건너뛰기 → /signup/parent/home(E-8, 학부모 홈 빈 상태).
// mode='add'(E-5, 이미 자녀 연결 후 추가 연결) — 건너뛰기 → 사이트 홈('/'), 플로우 종료로 보고
// resetSignup() 호출.
// icon: Figma 일러스트 에셋 미제공(§6.2) — lucide-react 아이콘 placeholder.

import { UserCheck, UserPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  ChoiceCard,
  TextLinkButton,
} from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import { linkCodeLabel } from "@/lib/parentLink";

type LinkChoiceProps = {
  mode?: "initial" | "add";
};

export default function LinkChoice({ mode = "initial" }: LinkChoiceProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { memberType, parentSignupCompleted, resetSignup } = useSignup();

  const childName = location.state?.childName || "";

  // memberType만으로는 가드가 뚫린다(선택만 하고 실제 가입은 완료하지 않은 채 URL 직접
  // 진입 가능) — ParentForm의 handleSubmit이 성공해야만 true가 되는 parentSignupCompleted를
  // 함께 요구해 학부모 온보딩(E-2~E-8) 진입을 실제 가입 완료 이후로 한정한다.
  // ⚠️ 마운트 시점 값으로 한 번만 판정한다 — StudentComplete와 같은 이유(2026-08-18).
  //   mode='add'의 건너뛰기가 resetSignup() 후 '/'로 나가는데, 가드가 플래그를 계속
  //   지켜보고 있으면 그 순간 /signup으로 되돌려 의도한 이동을 덮어쓴다.
  const entryAllowedRef = useRef(
    memberType === "parent" && parentSignupCompleted,
  );

  useEffect(() => {
    if (!entryAllowedRef.current) {
      navigate("/signup", { replace: true });
    }
  }, [navigate]);

  function handleSkip() {
    if (mode === "add") {
      resetSignup();
      navigate("/");
    } else {
      navigate("/signup/parent/home");
    }
  }

  return (
    <AuthLayout>
      {mode === "add" ? (
        <AuthTitle
          line1={childName ? `${childName} 학부모님,` : "학부모님,"}
          line1Color="ink"
          line2="자녀를 더 연결할까요?"
          line2Color="primary"
        />
      ) : (
        <AuthTitle
          line1="회원이 되신 것을 환영해요!"
          line1Color="ink"
          line2={
            <span className="sm:whitespace-nowrap">
              자녀 연결하면 학습 현황을 볼 수 있어요
            </span>
          }
          line2Color="primary"
        />
      )}

      <div className="flex w-full flex-col items-center gap-4 md:w-auto md:flex-row md:gap-5">
        <ChoiceCard
          size="md"
          icon={
            <UserCheck className="h-12 w-12 text-primary" strokeWidth={1.5} />
          }
          title="자녀가 회원이예요"
          description={`자녀 계정에서 ${linkCodeLabel()}를 입력하면 바로 연결돼요`}
          onClick={() =>
            navigate("/signup/parent/link/code", { state: { childName } })
          }
        />

        <ChoiceCard
          size="md"
          icon={
            <UserPlus className="h-12 w-12 text-primary" strokeWidth={1.5} />
          }
          title="자녀가 회원이 아니예요"
          description="문자나 링크로 초대하면 가입 시 자동으로 연결돼요"
          onClick={() =>
            navigate("/signup/parent/invite", { state: { childName } })
          }
        />
      </div>

      <TextLinkButton
        onClick={handleSkip}
        tone="muted"
        size="lg"
        weight="medium"
      >
        건너뛰기
      </TextLinkButton>
    </AuthLayout>
  );
}
