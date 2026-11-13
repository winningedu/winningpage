// [B-1] 회원유형 선택 — docs/login-signup-renewal-spec.md §3.3 B-1, 노드 2393:7714.
// 학생 회원 / 학부모 회원 선택 → SignupContext에 memberType 저장 후 다음 단계로 이동.
// 학생: /signup/student/birth (B-2, 생년월일 입력 → 연령 분기).
// 학부모: /signup/parent (E-1) — §3.3 B-2 주석대로 학부모는 만 19세 이상 전제라 생년월일
// 단계를 거치지 않는다(§5.2 라우트 표에도 /signup/parent/birth 없음).
// icon: Figma 일러스트 에셋(image 282/283)은 T1 단계에서 재추출되지 않아 제공되지 않는다
// (§6.2) — 임시로 lucide-react 아이콘을 자리표시자로 사용. 실제 일러스트 확보 시 교체 필요.

import { GraduationCap, Users } from "lucide-react";
import { useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  ChoiceCard,
  TextLinkButton,
} from "@/components/auth";
import { site } from "@/config/site";
import { useSignup } from "@/context/SignupContext";

export default function MemberType() {
  const navigate = useNavigate();
  const { resetForMemberType } = useSignup();

  // 유형을 다시 고르는 경우(뒤로가기 등)를 포함해 항상 이 화면이 유형 "전환"의 진입점이므로
  // setMemberType 대신 resetForMemberType을 사용한다 — 이전 유형에서 남은 formData/agreements/
  // verification/signupCompleted/parentSignupCompleted를 함께 초기화해 상태 오염을 막는다
  // (SignupContext 계약 참고). 학부모 카드는 VITE_PARENT_SIGNUP_ENABLED가 꺼져 있어도 일단
  // /signup/parent로 이동시킨다(ParentForm이 "준비 중" 안내를 자체 표시). memberType이
  // 'parent'로 확정되더라도, 학부모 온보딩(E-2~E-8) 각 화면은 parentSignupCompleted 가드로
  // 별도 보호되므로 ParentForm에서 실제 가입을 완료하지 않는 한 하위 화면으로 진입할 수 없다.
  function handleSelect(memberType: "student" | "parent") {
    resetForMemberType(memberType);

    if (memberType === "student") {
      // 학교 가입은 생년월일을 학생 정보 단계에서 받는다.
      navigate(
        site.features.schoolSignup
          ? "/signup/student"
          : "/signup/student/birth",
      );
    } else {
      navigate("/signup/parent");
    }
  }

  return (
    <AuthLayout>
      <AuthTitle
        line1="성공적인 진학의 시작,"
        line1Color="primary"
        line2={
          <span className="sm:whitespace-nowrap">
            {site.brandName}에 오신 것을 환영해요
          </span>
        }
        line2Color="ink"
      />

      <div className="flex w-full flex-col items-center gap-3 md:w-auto md:flex-row">
        <ChoiceCard
          size="lg"
          icon={
            <GraduationCap
              className="h-14 w-14 text-primary"
              strokeWidth={1.5}
            />
          }
          title="학생 회원"
          description="진학 성공을 준비하는 학생이라면"
          onClick={() => handleSelect("student")}
        />

        <ChoiceCard
          size="lg"
          icon={<Users className="h-14 w-14 text-primary" strokeWidth={1.5} />}
          title="학부모회원"
          description="학생 회원의 자녀가 있다면"
          onClick={() => handleSelect("parent")}
        />
      </div>

      <p className="text-base text-ink">
        {site.brandName} 회원이신가요?{" "}
        <TextLinkButton
          as="link"
          to="/login"
          tone="primary"
          size="md"
          weight="semibold"
        >
          로그인
        </TextLinkButton>
      </p>
    </AuthLayout>
  );
}
