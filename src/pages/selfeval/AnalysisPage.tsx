import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useSelfevalScreenStep } from "@/components/selfeval/SelfevalShellContext";

// 분석 확인 화면(단계 4). 본문은 P6 가 채운다.
// 하단 고지는 SelfevalAppLayout 이 그린다.
export default function AnalysisPage() {
  useSelfevalScreenStep(4);
  return <GoalPageHeader title="분석한 내용이 맞는지 봐주세요" />;
}
