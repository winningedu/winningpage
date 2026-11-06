import { Link } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import ServiceBlockedNotice from "@/components/service/ServiceBlockedNotice";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/config/site";
import type { TenantBlockReason } from "@/lib/tenantBlock";
import { cn } from "@/lib/utils";

const PRICING_PATH = "/pricing?service=growth";

// 설문 저장이 이용권(기관 설정) 때문에 막혔을 때의 안내. 스쿨멘토는 구매 대신 기관 사유를 보인다(결정 99).
export default function NoEntitlementCard({
  tenantReason,
  onJoined,
}: {
  tenantReason: TenantBlockReason | null;
  onJoined: () => void;
}) {
  if (site.features.tenantServiceGate) {
    return <ServiceBlockedNotice reason={tenantReason} onJoined={onJoined} />;
  }
  return (
    <GoalCard tone="cream" className="px-5 py-4">
      <p className="text-app-body font-semibold text-ink-strong">
        성장설계 이용권이 없어 답을 저장할 수 없어요
      </p>
      <Link
        to={PRICING_PATH}
        className={cn(
          buttonVariants({ variant: "default" }),
          "mt-3 h-10 px-4 text-app-label",
        )}
      >
        이용권 알아보기
      </Link>
    </GoalCard>
  );
}
