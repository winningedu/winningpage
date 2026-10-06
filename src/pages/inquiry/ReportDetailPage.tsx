// P6 에서 본문 구현. 보관함 상세는 단계 밖 화면이라 단계를 올리지 않는다.
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useInquiryScreenStep } from "@/components/inquiry/InquiryShellContext";

export default function ReportDetailPage() {
  useInquiryScreenStep(null);
  return <GoalPageHeader title="탐구 기록" />;
}
