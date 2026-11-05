import type { RouteObject } from "react-router";
import AssignPoolPage from "@/pages/console/assign-pool/AssignPoolPage";
import AdmissionCoachingPage from "@/pages/console/admission-coaching/AdmissionCoachingPage";
import ConsoleGate from "@/pages/console/ConsoleGate";
import ConsoleHeaderFrame from "@/pages/console/ConsoleHeaderFrame";
import ConsoleLayout from "@/pages/console/ConsoleLayout";
import ConsolePlaceholder from "@/pages/console/ConsolePlaceholder";
import DashboardPage from "@/pages/console/dashboard/DashboardPage";
import EnrollmentPage from "@/pages/console/enrollment/EnrollmentPage";
import CoachingPage from "@/pages/console/coaching/CoachingPage";
import CoachingPrintPage from "@/pages/console/coaching/CoachingPrintPage";
import FirstPasswordPage from "@/pages/console/FirstPasswordPage";
import ImportSetupPage from "@/pages/console/import-setup/ImportSetupPage";
import MyPage from "@/pages/console/MyPage";
import OrgInfoPage from "@/pages/console/OrgInfoPage";
import ProxySelectPage from "@/pages/console/proxy-select/ProxySelectPage";
import ServiceStatusPage from "@/pages/console/service-status/ServiceStatusPage";
import StudentHistoryPage from "@/pages/console/student-history/StudentHistoryPage";
import StudentListPage from "@/pages/console/students/StudentListPage";
import TeacherAccountsPage from "@/pages/console/teachers/TeacherAccountsPage";
import TeacherExcelPage from "@/pages/console/teachers/TeacherExcelPage";
import TeacherRosterPage from "@/pages/console/teachers/TeacherRosterPage";

// 교사 콘솔(/teacher). SiteLayout 밖이라 푸터가 없고 헤더만 ConsoleHeaderFrame 이 그린다.
// 입구 가드(ConsoleGate)가 로그인, 콘솔 권한, 임시 비밀번호 상태를 가른다.
// 첫 비밀번호와 본사 학교 고르기(W5a) 화면은 사이드바 셸 밖, 나머지는 셸(ConsoleLayout) 아래다.
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
          { path: "proxy", Component: ProxySelectPage },
          // W9c 인쇄 창은 사이드바 셸 밖이다
          { path: "coaching/print", Component: CoachingPrintPage },
          {
            Component: ConsoleLayout,
            children: [
              { index: true, Component: DashboardPage },
              { path: "my", Component: MyPage },
              { path: "coaching", Component: CoachingPage },
              { path: "org-info", Component: OrgInfoPage },
              { path: "import", Component: ImportSetupPage },
              { path: "students", Component: StudentListPage },
              { path: "unassigned", Component: AssignPoolPage },
              { path: "student-history", Component: StudentHistoryPage },
              { path: "teachers", Component: TeacherRosterPage },
              { path: "teachers/excel", Component: TeacherExcelPage },
              { path: "accounts", Component: TeacherAccountsPage },
              { path: "enrollment", Component: EnrollmentPage },
              {
                path: "admission-coaching",
                Component: AdmissionCoachingPage,
              },
              {
                path: "service-status/:service?",
                Component: ServiceStatusPage,
              },
              { path: "*", Component: ConsolePlaceholder },
            ],
          },
        ],
      },
    ],
  },
];

export default teacherConsoleRoutes;
