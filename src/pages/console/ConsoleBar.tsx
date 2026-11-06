import { Menu } from "lucide-react";

interface ConsoleBarProps {
  currentPage: string;
  onOpenMenu: () => void;
}

export default function ConsoleBar({
  currentPage,
  onOpenMenu,
}: ConsoleBarProps) {
  return (
    <div className="flex h-11 min-h-11 items-center gap-3 border-b border-border bg-background px-4 lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-full items-center gap-2 pr-3 pl-2 text-app-label font-semibold text-ink-strong"
      >
        <Menu aria-hidden className="size-6" />
        메뉴
      </button>
      <span aria-hidden className="h-4 w-px bg-border" />
      <span className="text-app-label font-medium text-ink-sub">
        {currentPage}
      </span>
    </div>
  );
}
