// P6 에서 본문 구현. 지금은 단계를 셸에 알리고 선행 조건 미충족 안내만 그린다.
import { useInquiryScreenStep } from "@/components/inquiry/InquiryShellContext";
import StepGate from "@/components/inquiry/StepGate";

export default function WritePage() {
  useInquiryScreenStep(4);
  return <StepGate step={4} title="보고서 작성" />;
}
