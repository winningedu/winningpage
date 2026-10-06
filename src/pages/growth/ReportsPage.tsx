import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useGrowthScreenStep } from "@/components/growth/GrowthShellContext";

// 플레이스홀더. 이 화면의 내용은 담당 동료가 채운다.
// 단계 알림(useGrowthScreenStep)은 사이드바 진행단계가 의존하므로 내용을 바꿔도 유지한다.
// 경로: /app/growth/reports (단계 밖 화면이라 null)
export default function ReportsPage() {
  useGrowthScreenStep(null);

  return <GoalPageHeader title="지난 리포트" />;
}
