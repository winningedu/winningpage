import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useSelfevalScreenStep } from "@/components/selfeval/SelfevalShellContext";

// 보관함(단계 밖 화면). 본문은 P6 가 채운다.
// 하단 고지는 SelfevalAppLayout 이 그린다.
export default function ArchivePage() {
  useSelfevalScreenStep(null);
  return <GoalPageHeader title="보관함" />;
}
