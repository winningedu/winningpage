import type { RouteObject } from "react-router";
import ConsoleGate from "@/pages/console/ConsoleGate";
import ConsoleHeaderFrame from "@/pages/console/ConsoleHeaderFrame";
import ConsoleLayout from "@/pages/console/ConsoleLayout";
import ConsolePlaceholder from "@/pages/console/ConsolePlaceholder";
import FirstPasswordPage from "@/pages/console/FirstPasswordPage";
import ImportSetupPage from "@/pages/console/import-setup/ImportSetupPage";
import MyPage from "@/pages/console/MyPage";
import OrgInfoPage from "@/pages/console/OrgInfoPage";
import StudentHistoryPage from "@/pages/console/student-history/StudentHistoryPage";

// 교사 콘솔(/teacher). SiteLayout 밖이라 푸터가 없고 헤더만 ConsoleHeaderFrame 이 그린다.
// 입구 가드(ConsoleGate)가 로그인, 콘솔 권한, 임시 비밀번호 상태를 가른다.
// 첫 비밀번호 화면은 사이드바 셸 밖, 나머지는 셸(ConsoleLayout) 아래다.
// 아직 만들지 않은 화면은 ConsolePlaceholder 로 받는다(다른 화면이 생기면 그 위에 라우트를 더한다).
const teacherConsoleRoutes: RouteObject[] = [
  {
    path: "/teacher",
    Component: ConsoleHeaderFrame,
    children: [
      {
        Component: ConsoleGate,
        children: [
          { path: "first-password", Component: FirstPasswordPage },
          {
            Component: ConsoleLayout,
            children: [
              { index: true, Component: ConsolePlaceholder },
              { path: "my", Component: MyPage },
              { path: "org-info", Component: OrgInfoPage },
              { path: "import", Component: ImportSetupPage },
              { path: "student-history", Component: StudentHistoryPage },
              { path: "*", Component: ConsolePlaceholder },
            ],
          },
        ],
      },
    ],
  },
];

export default teacherConsoleRoutes;
