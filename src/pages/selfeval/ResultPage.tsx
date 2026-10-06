import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useSelfevalScreenStep } from "@/components/selfeval/SelfevalShellContext";

// 생성 결과 화면(단계 5). 본문은 P6 가 채운다.
// 하단 고지는 SelfevalAppLayout 이 그린다.
export default function ResultPage() {
  useSelfevalScreenStep(5);
  return <GoalPageHeader title="자기평가서가 완성됐습니다" />;
}
