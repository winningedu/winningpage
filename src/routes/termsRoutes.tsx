import type { RouteObject } from "react-router";
import TermsDocPage from "@/pages/terms/TermsDocPage";

// 가입 약관 8종(§5.2) — 학생 5종 + 학부모 3종. 본문은 public.terms(code)에서 읽고,
// 이용약관·개인정보 페이지는 도입부(가입약관/요약) 뒤에 공통 전문을 이어 붙인다.
// showEffectiveDate는 시안에 시행일 캡션이 있는 페이지만 켠다.
const TERMS_PAGES: Array<
  { path: string } & Parameters<typeof TermsDocPage>[0]
> = [
  {
    path: "/terms/student/service",
    code: "student_service",
    appendCode: "service_fulltext",
  },
  {
    path: "/terms/student/privacy",
    code: "student_privacy",
    appendCode: "privacy_policy",
    showEffectiveDate: true,
  },
  {
    path: "/terms/student/identity",
    code: "student_identity",
    showEffectiveDate: true,
  },
  { path: "/terms/student/marketing", code: "student_marketing" },
  // 스쿨멘토 가입: 서비스 전환 시 위닝에듀로 정보를 옮기는 것에 관한 안내.
  { path: "/terms/student/db-transfer", code: "student_db_transfer" },
  {
    path: "/terms/student/promotion",
    code: "student_promotion",
    showEffectiveDate: true,
  },
  {
    path: "/terms/parent/service",
    code: "parent_service",
    appendCode: "service_fulltext",
    showEffectiveDate: true,
  },
  {
    path: "/terms/parent/privacy",
    code: "parent_privacy",
    appendCode: "privacy_policy",
    showEffectiveDate: true,
  },
  {
    path: "/terms/parent/marketing",
    code: "parent_marketing",
    showEffectiveDate: true,
  },
];

const termsRoutes: RouteObject[] = TERMS_PAGES.map(({ path, ...props }) => ({
  path,
  Component: () => <TermsDocPage {...props} />,
}));

export default termsRoutes;
