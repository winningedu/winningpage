// 로그인 사용자용 "MY" 메뉴의 단일 소스. 데스크톱 메가 패널 6번째 컬럼(Header.tsx)과
// 모바일 드로어 MY 섹션(MobileNavDrawer.tsx)이 같은 목록을 쓴다 — 두 화면이 다른
// 항목을 보여 주던 문제(드로어만 수강신청·결제/환불신청 노출)를 없앤다.
//
// 역할 판정은 Header.tsx의 profile(member_type/role)에서 한 번만 하고 여기엔 결과만
// 넘긴다. 관리자는 별도 "관리자" 버튼 없이 이 목록의 "관리자 메뉴" 항목으로만 진입한다
// (2026-09-03 결정, docs/header-footer-figma-2026-09.md §6·§8).
//
// 학부모는 서비스를 이용하는 사람이 아니라 결제하는 사람이라 "나의 서비스" 탭이 없고
// "자녀 등록 및 수정" 탭이 있다(MyPage.tsx PARENT_TABS). 학생에겐 자녀가 없다.
// 탭 키는 useMyPageTab.ts의 `?tab=` 쿼리 계약을 그대로 따른다.

export type MyMenuRole = "student" | "parent" | "admin";

export type MyMenuItem = {
  label: string;
  to: string;
};

const MY_PAGE: MyMenuItem = { label: "MY페이지", to: "/mypage" };
const MY_SERVICES: MyMenuItem = {
  label: "나의 서비스",
  to: "/mypage?tab=services",
};
const MY_CHILDREN: MyMenuItem = {
  label: "자녀 등록 및 수정",
  to: "/mypage?tab=children",
};
const MY_PAYMENTS: MyMenuItem = {
  label: "신청 내역",
  to: "/mypage?tab=payments",
};
const MY_PROFILE: MyMenuItem = {
  label: "내 정보 수정",
  to: "/mypage?tab=profile",
};
const ADMIN_MENU: MyMenuItem = { label: "관리자 메뉴", to: "/admin" };

export function buildMyMenu(role: MyMenuRole): MyMenuItem[] {
  switch (role) {
    case "parent":
      return [MY_PAGE, MY_CHILDREN, MY_PAYMENTS, MY_PROFILE];
    case "admin":
      return [MY_PAGE, MY_SERVICES, MY_PAYMENTS, ADMIN_MENU, MY_PROFILE];
    default:
      return [MY_PAGE, MY_SERVICES, MY_PAYMENTS, MY_PROFILE];
  }
}

// Header.tsx가 profile에서 역할을 정하는 규칙. role=admin이 member_type보다 우선한다
// (관리자 계정도 member_type을 가질 수 있어 관리자 메뉴가 묻히면 안 된다).
export function resolveMyMenuRole(input: {
  role?: string | null;
  memberType?: string | null;
}): MyMenuRole {
  const role = (input.role ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  const memberType = (input.memberType ?? "").trim().toLowerCase();
  if (
    memberType === "parent" ||
    memberType === "학부모" ||
    memberType === "학부모회원"
  ) {
    return "parent";
  }
  return "student";
}
