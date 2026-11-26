import {
  ChartColumn,
  CreditCard,
  GraduationCap,
  House,
  Layers,
  type LucideIcon,
  Megaphone,
  UserCog,
  Users,
} from "lucide-react";

// 사이드바를 아이콘만 남게 접었을 때 대분류(Admin.tsx MENU_GROUPS title)마다 그리는 아이콘.
// 대분류를 늘리면 여기에도 한 줄 더한다. 없는 대분류는 제목 첫 글자로 그린다.
// \u00b7 은 「매출\u00b7결제관리」 제목의 가운뎃점이다(소스에 문자를 직접 적지 않는다).
export const ADMIN_GROUP_ICONS: Record<string, LucideIcon> = {
  통계: ChartColumn,
  "메인화면 관리": House,
  "입시정보 관리": GraduationCap,
  "고객안내 관리": Megaphone,
  "서비스 관리": Layers,
  회원관리: Users,
  "매출\u00b7결제관리": CreditCard,
  직원관리: UserCog,
};
