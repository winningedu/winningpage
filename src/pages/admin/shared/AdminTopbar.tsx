import { Link } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";
import { CONSOLE_BASE } from "@/pages/console/menu";

interface AdminTopbarProps {
  onLogout: () => void;
}

export function AdminTopbar({ onLogout }: AdminTopbarProps) {
  return (
    <header className="fixed left-56 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-black/10 bg-white px-7 shadow-sm">
      <p className="text-[0.9375rem] font-semibold text-[#3a3f45]">
        안녕하세요, <strong>관리자님.</strong>
      </p>

      <div className="flex items-center gap-3">
        {site.features.hqTenantAdmin && (
          <Link
            to={CONSOLE_BASE}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "px-4 text-xs",
            )}
          >
            선생님 화면으로 이동
          </Link>
        )}
        <Link
          to="/"
          className={cn(buttonVariants({ variant: "outline" }), "px-4 text-xs")}
        >
          메인으로 이동
        </Link>

        <Button
          type="button"
          variant="outline"
          onClick={onLogout}
          className="px-4 text-xs"
        >
          로그아웃
        </Button>
      </div>
    </header>
  );
}
