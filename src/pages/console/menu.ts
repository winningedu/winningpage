// 역할별 콘솔 메뉴 정의(스펙 1.4, 1.5). 담임은 adminOnly 항목을 보지 않는다.

export interface MenuItem {
  label: string;
  to: string;
  adminOnly?: boolean;
  /** 승인 대기 건수 배지를 붙이는 항목. */
  badge?: boolean;
}

export interface MenuGroup {
  label: string;
  adminOnly?: boolean;
  /** 본사 대행 중에는 숨긴다(결정 48). */
  hiddenForProxy?: boolean;
  items: MenuItem[];
}

export const CONSOLE_BASE = "/teacher";

export const menuGroups: MenuGroup[] = [
  {
    label: "개요",
    items: [{ label: "대시보드", to: CONSOLE_BASE }],
  },
  {
    label: "학생 데이터",
    items: [
      { label: "학생 관리", to: `${CONSOLE_BASE}/students` },
      { label: "이용현황", to: `${CONSOLE_BASE}/enrollment`, adminOnly: true },
      { label: "서비스별 현황표", to: `${CONSOLE_BASE}/service-status` },
    ],
  },
  {
    label: "지도와 상담",
    items: [
      { label: "개인종합코칭", to: `${CONSOLE_BASE}/coaching` },
      { label: "입시 상담코칭", to: `${CONSOLE_BASE}/admission-coaching` },
    ],
  },
  {
    label: "학생 등록과 배치",
    items: [
      {
        label: "학생불러오기-일괄설정",
        to: `${CONSOLE_BASE}/import`,
        adminOnly: true,
      },
      {
        label: "미배정 목록",
        to: `${CONSOLE_BASE}/unassigned`,
        adminOnly: true,
      },
      {
        label: "학생조회-변경-이력",
        to: `${CONSOLE_BASE}/student-history`,
        badge: true,
      },
    ],
  },
  {
    label: "교육기관관리",
    adminOnly: true,
    items: [
      { label: "교사 정보 입력관리", to: `${CONSOLE_BASE}/teachers` },
      { label: "교사 엑셀 일괄업로드", to: `${CONSOLE_BASE}/teachers/excel` },
      { label: "교사 계정 관리", to: `${CONSOLE_BASE}/accounts` },
      { label: "내정보관리", to: `${CONSOLE_BASE}/org-info` },
    ],
  },
  {
    label: "마이페이지(내 정보 및 설정)",
    hiddenForProxy: true,
    items: [{ label: "마이페이지", to: `${CONSOLE_BASE}/my` }],
  },
];

export function menuFor(kind: string): MenuGroup[] {
  const isAdminMenu = usesAdminMenu(kind);
  const proxy = kind === "hq_proxy";
  return menuGroups
    .filter(
      (g) => (isAdminMenu || !g.adminOnly) && !(proxy && g.hiddenForProxy),
    )
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => isAdminMenu || !i.adminOnly),
    }));
}

/** 관리자 메뉴가 필요한 역할이면 true(school_admin, hq_proxy). */
export function usesAdminMenu(kind: string): boolean {
  return kind !== "homeroom";
}

const allItems = menuGroups.flatMap((g) => g.items);

/** 경로에 맞는 항목. /teacher 는 정확히 일치, 나머지는 가장 긴 접두사. */
export function findMenuItem(pathname: string): MenuItem | null {
  let best: MenuItem | null = null;
  for (const item of allItems) {
    const hit =
      item.to === CONSOLE_BASE
        ? pathname === CONSOLE_BASE
        : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (hit && (!best || item.to.length > best.to.length)) best = item;
  }
  return best;
}
