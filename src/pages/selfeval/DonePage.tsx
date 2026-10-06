import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useSelfevalScreenStep } from "@/components/selfeval/SelfevalShellContext";

// 최종 저장 완료 화면(단계 6). 본문은 P6 가 채운다.
// 하단 고지는 SelfevalAppLayout 이 그린다.
export default function DonePage() {
  useSelfevalScreenStep(6);
  return <GoalPageHeader title="최종본을 저장했습니다" />;
}
