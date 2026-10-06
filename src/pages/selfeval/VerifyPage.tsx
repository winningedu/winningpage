import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useSelfevalScreenStep } from "@/components/selfeval/SelfevalShellContext";

// 검증과 저장 화면(단계 6). 본문은 P6 가 채운다.
// 하단 고지는 SelfevalAppLayout 이 그린다.
export default function VerifyPage() {
  useSelfevalScreenStep(6);
  return <GoalPageHeader title="검증 결과" />;
}
