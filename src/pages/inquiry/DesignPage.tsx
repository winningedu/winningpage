import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import DesignBody from "@/components/inquiry/design/DesignBody";
import {
  useInquiryScreenStep,
  useInquiryShell,
} from "@/components/inquiry/InquiryShellContext";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import StepGate from "@/components/inquiry/StepGate";
import StepGuardCard from "@/components/inquiry/StepGuardCard";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { inquirySessionDetailQuery } from "@/lib/inquiry/queries";

// 경로: /app/inquiry/design (화면 3, 설계 리포트)
// 세션 상세(inquirySessionDetailQuery)에서 design 과 topic 을 읽어 DesignBody 로 그린다(계약: 부록 A, C).

export default function DesignPage() {
  useInquiryScreenStep(3);
  return (
    <StepGate
      step={3}
      title="설계 리포트"
      subcopy="완성된 글이 아니라 무엇을 어떤 순서로 쓸지에 대한 설계도예요. 문장은 학생이 직접 써요."
    >
      <DesignContent />
    </StepGate>
  );
}

function DesignContent() {
  const { userId } = useSession();
  const { session } = useInquiryShell();
  const { data, error, isPending } = useQuery(
    inquirySessionDetailQuery(userId, session?.id ?? null),
  );

  if (isPending) {
    return (
      <div role="status" aria-label="불러오는 중">
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="text-app-label text-ink-strong">
        설계 리포트를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.
      </p>
    );
  }
  if (!data.design || !data.topic) {
    return (
      <StepGuardCard
        title="아직 설계 리포트가 없어요"
        description="주제 추천에서 주제를 하나 고르면 여기에 8절 설계가 나와요. 2단계 주제 추천으로 돌아가세요."
        backLabel="주제 추천으로 돌아가기"
        backTo={INQUIRY_PATHS.topics}
      />
    );
  }

  return (
    <>
      <DesignBody design={data.design} topic={data.topic} />
      <div className="flex justify-end">
        <Link
          to={INQUIRY_PATHS.write}
          className={`${buttonVariants({ size: "lg" })} h-10 px-5 text-app-label`}
        >
          작성 화면으로
        </Link>
      </div>
    </>
  );
}
