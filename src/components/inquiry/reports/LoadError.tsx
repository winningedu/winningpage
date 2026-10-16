import { Link } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { InquiryApiError } from "@/lib/inquiry/queries";
import { cn } from "@/lib/utils";

export const INQUIRY_PRICING_PATH = "/pricing?service=inquiry";

export function errorCode(error: unknown): string | null {
  return error instanceof InquiryApiError && error.result.kind === "error"
    ? error.result.code
    : null;
}

type Props = { error: unknown; message: string; onRetry: () => void };

/** 조회 오류 카드. 이용권이 없으면 이용권 보기 링크, 그 외에는 다시 시도. */
export default function LoadError({ error, message, onRetry }: Props) {
  const noEntitlement = errorCode(error) === "NO_ENTITLEMENT";
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
