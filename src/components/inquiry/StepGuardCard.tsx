import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";

// 선행 단계가 끝나지 않아 아직 만들 수 없는 화면에서 본문 대신 그리는 안내 카드(No.113, 114).
// 무엇이 나오는지(description)와 돌아갈 단계 버튼을 보여 준다.
type StepGuardCardProps = {
  title: string;
  description: string;
  backLabel: string;
  backTo: string;
};

export default function StepGuardCard({
  title,
  description,
  backLabel,
  backTo,
}: StepGuardCardProps) {
  return (
    <section
      aria-labelledby="inquiry-step-guard-heading"
      className="flex flex-col items-start gap-3 rounded-xl border border-line bg-background px-6 py-6"
    >
      <h2
        id="inquiry-step-guard-heading"
        className="text-app-card-title font-bold text-ink-strong"
      >
        {title}
      </h2>
      <p className="text-app-body text-ink-sub">{description}</p>
      <Link
        to={backTo}
        className={`${buttonVariants({ variant: "outline", size: "lg" })} h-10 px-5 text-app-label`}
      >
        {backLabel}
      </Link>
    </section>
  );
}
