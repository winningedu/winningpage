import { Link } from "react-router";
import { site } from "@/config/site";
import { CONSOLE_BASE } from "@/pages/console/menu";

interface AdminTopbarProps {
  onLogout: () => void;
}

export function AdminTopbar({ onLogout }: AdminTopbarProps) {
  return (
    <header className="fixed left-[224px] right-0 top-0 z-30 flex h-[56px] items-center justify-between border-b border-black/10 bg-white px-7 shadow-sm">
      <p className="text-[15px] font-bold text-[#3a3f45]">
        안녕하세요, <strong>관리자님.</strong>
      </p>

      <div className="flex items-center gap-3">
        {site.features.hqTenantAdmin && (
          <Link
            to={CONSOLE_BASE}
            className="inline-flex h-[32px] items-center justify-center rounded-sm border border-[#c9ced6] bg-white px-4 text-xs font-bold text-[#3a3f45] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
          >
            교사 화면으로 이동
          </Link>
        )}
        <Link
          to="/"
          className="inline-flex h-[32px] items-center justify-center rounded-sm border border-[#c9ced6] bg-white px-4 text-xs font-bold text-[#3a3f45] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
        >
          메인으로 이동
        </Link>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-[32px] items-center justify-center rounded-sm border border-[#c9ced6] bg-white px-4 text-xs font-bold text-[#8b9098] transition hover:border-black hover:text-black"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
