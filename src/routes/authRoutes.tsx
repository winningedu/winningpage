import type { RouteObject } from "react-router";
import { Outlet } from "react-router";
import { SignupProvider } from "@/context/SignupContext";
import { requireSignupEnabledMiddleware } from "@/lib/routeMiddleware";
import FindAccount from "@/pages/FindAccount";
import FindPassword from "@/pages/FindPassword";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
// 회원가입 플로우(§5.2) — 유형 선택 → 생년월일 → 학생/학부모 분기 폼 → 완료/온보딩
import MemberType from "@/pages/signup/MemberType";
import InviteChild from "@/pages/signup/parent/InviteChild";
import InviteDone from "@/pages/signup/parent/InviteDone";
import LinkChoice from "@/pages/signup/parent/LinkChoice";
import LinkCode from "@/pages/signup/parent/LinkCode";
import LinkDone from "@/pages/signup/parent/LinkDone";
import ParentForm from "@/pages/signup/parent/ParentForm";
import ParentHome from "@/pages/signup/parent/ParentHome";
import StudentBirth from "@/pages/signup/StudentBirth";
import StudentComplete from "@/pages/signup/StudentComplete";
import StudentForm from "@/pages/signup/StudentForm";
import Under14Form from "@/pages/signup/Under14Form";
import Under14Verify from "@/pages/signup/Under14Verify";

// /signup 하위 라우트 전용 컨텍스트 경계 — 유형 선택부터 완료/온보딩까지 단계 간 데이터
// (memberType/birthDate/폼데이터/인증 상태)를 SignupProvider(§5.3)로 공유한다.
function SignupFlowLayout() {
  return (
    <SignupProvider>
      <Outlet />
    </SignupProvider>
  );
}

// 로그인·회원가입 리뉴얼(§5.2) — 헤더/푸터 포함 풀 페이지가 시안 확정이므로
// SiteLayout 안으로 편입(구 Login.jsx/Signup.jsx의 pt-16 보정 관례 그대로 재사용).
const authRoutes: RouteObject[] = [
  { path: "/login", Component: Login },
  // 아이디·비밀번호 찾기(QA 지시 2026-08-21) — SignupProvider 밖(회원가입 단계 데이터와
  // 무관)에 둔다. reset-password는 FindPassword가 보낸 이메일 링크의 redirectTo다.
  { path: "/login/find-id", Component: FindAccount },
  { path: "/login/find-password", Component: FindPassword },
  { path: "/login/reset-password", Component: ResetPassword },

  {
    Component: SignupFlowLayout,
    // 가입 오픈 여부 게이트(app_settings.signup_enabled) — /signup 하위 전체에
    // 건다(SignupFlowLayout 안 어떤 단계로 직접 진입해도 걸리도록).
    middleware: [requireSignupEnabledMiddleware],
    children: [
      { path: "/signup", Component: MemberType },
      { path: "/signup/student/birth", Component: StudentBirth },
      { path: "/signup/student", Component: StudentForm },
      {
        path: "/signup/student/under14/verify",
        Component: Under14Verify,
      },
      { path: "/signup/student/under14", Component: Under14Form },
      // 통합 가입 폼(/signup/unified, VITE_UNIFIED_SIGNUP_ENABLED)은 2026-08-25 폐기 —
      // 시안 미확정 임시 라우트였고, 정식 폼 3종(학생/14세 미만/학부모)이 가입 필수 항목
      // (생년월일·성별)을 받도록 확장되면서 레거시 폼은 필수값을 보내지 못해 가입 자체가
      // 불가능한 죽은 코드가 됐다.
      { path: "/signup/student/complete", Component: StudentComplete },
      { path: "/signup/parent", Component: ParentForm },
      { path: "/signup/parent/link", Component: LinkChoice },
      {
        path: "/signup/parent/link/add",
        Component: () => <LinkChoice mode="add" />,
      },
      { path: "/signup/parent/link/code", Component: LinkCode },
      { path: "/signup/parent/link/done", Component: LinkDone },
      { path: "/signup/parent/invite", Component: InviteChild },
      { path: "/signup/parent/invite/done", Component: InviteDone },
      { path: "/signup/parent/home", Component: ParentHome },
    ],
  },
];

export default authRoutes;
