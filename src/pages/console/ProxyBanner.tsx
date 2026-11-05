import { Button } from "@/components/ui/button";

interface ProxyBannerProps {
  tenantName: string;
  onEnd: () => void;
  ending: boolean;
}

export default function ProxyBanner({
  tenantName,
  onEnd,
  ending,
}: ProxyBannerProps) {
  return (
    <div className="flex items-center justify-center gap-4 bg-surface-warning px-4 py-2 text-text-caution md:py-0 md:h-9">
      <p className="flex-1 text-center text-app-label md:flex-none">
        <strong className="block font-bold md:inline">{`본사 대행 중: ${tenantName}`}</strong>
        <span className="hidden md:inline">{"   "}</span>
        <span className="block md:inline">
          모든 조회와 수정은 본사 직원 이름으로 기록돼요.
        </span>
      </p>
      <Button
        type="button"
        disabled={ending}
        onClick={onEnd}
        className="h-8 rounded-lg bg-surface-muted px-3 text-sm leading-[1.4] font-medium text-primary hover:bg-surface-muted"
      >
        종료
      </Button>
    </div>
  );
}
