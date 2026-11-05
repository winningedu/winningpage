import { Menu } from "lucide-react";
import { Link } from "react-router";
import { site } from "@/config/site";
import { useB2BAccount } from "./useB2BAccount";

const ACCOUNT_PILL =
  "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-b2b-account px-3.5 text-sm font-bold tracking-[-0.01875rem]";

// 스쿨멘토 전용 헤더(b2bMenu 사이트). 위닝은 기존 Header를 그대로 쓴다.
export default function Header() {
  const account = useB2BAccount();

  return (
    <header className="fixed left-0 top-0 z-50 h-16 w-full border-b border-black/5 bg-white">
      <div className="flex h-full items-center justify-between px-8">
        <Link to="/" className="flex shrink-0 items-center">
          <img
            src={site.logo.horizontal}
            alt={site.brandName}
            className="h-5.5 w-auto object-contain"
          />
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          {account.status === "guest" && (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className={`${ACCOUNT_PILL} bg-white text-b2b-account`}
              >
                로그인
              </Link>
              <Link
                to="/login"
                className={`${ACCOUNT_PILL} bg-b2b-account text-white`}
              >
                선생님
              </Link>
            </div>
          )}
          <button
            type="button"
            aria-label="전체 메뉴 열기"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary"
          >
            <Menu size={18} className="size-[1.125rem]" />
          </button>
        </div>
      </div>
    </header>
  );
}
