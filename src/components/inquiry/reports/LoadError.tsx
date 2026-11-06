import { Link } from "react-router";
import ServiceBlockedNotice from "@/components/service/ServiceBlockedNotice";
import { Button, buttonVariants } from "@/components/ui/button";
import { site } from "@/config/site";
import { InquiryApiError } from "@/lib/inquiry/queries";
import { parseTenantReason, type TenantBlockReason } from "@/lib/tenantBlock";
import { cn } from "@/lib/utils";

export const INQUIRY_PRICING_PATH = "/pricing?service=inquiry";

export function errorCode(error: unknown): string | null {
  return error instanceof InquiryApiError && error.result.kind === "error"
    ? error.result.code
    : null;
}

/** 오류 응답이 실은 스쿨멘토 기관 거부 사유. 위닝 응답에는 없어 null 이다. */
export function tenantReasonOfError(error: unknown): TenantBlockReason | null {
  return error instanceof InquiryApiError && error.result.kind === "error"
    ? parseTenantReason(error.result.extra?.tenantReason)
    : null;
}

type Props = { error: unknown; message: string; onRetry: () => void };

/** 조회 오류 카드. 이용권이 없으면 이용권 보기 링크, 그 외에는 다시 시도. */
export default function LoadError({ error, message, onRetry }: Props) {
  const noEntitlement = errorCode(error) === "NO_ENTITLEMENT";
  // 스쿨멘토는 이용권을 사지 않는다(결정 99). 구매 링크 대신 기관 사유를 보인다.
  if (noEntitlement && site.features.tenantServiceGate) {
    return <ServiceBlockedNotice reason={tenantReasonOfError(error)} />;
  }
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6"
    >
      <p className="text-app-body text-ink-strong">
        {noEntitlement ? "심화탐구 이용권이 필요해요." : message}
      </p>
      {noEntitlement ? (
        <Link
          to={INQUIRY_PRICING_PATH}
          className={cn(buttonVariants(), "h-10 px-5 text-app-label")}
        >
          이용권 보기
        </Link>
      ) : (
        <Button variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
