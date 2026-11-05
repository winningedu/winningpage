// 빵부스러기, 제목, 부제, 기준 시각, 우측 동작, 휴대폰 안내 줄(결정 43)을 가진 화면 머리.

import { ChevronRight } from "lucide-react";
import type { ConsoleMe } from "./api";
import { gradeLabel, primaryClass } from "./classLabel";
import { useConsoleMe } from "./useConsoleMe";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  asOf?: string;
  /** 768 이상에서만 보이는 동작(휴대폰에서는 숨긴다). */
  actions?: React.ReactNode;
  /** 휴대폰(768 미만)에서만 보이는 PC 전용 안내 줄. */
  notice?: string;
}

function crumbsFor(me: ConsoleMe): string[] {
  if (me.kind !== "homeroom") return [me.tenant.name, "전체"];
  const primary = primaryClass(me.classes);
  return primary
    ? [me.tenant.name, gradeLabel(primary.grade), `${primary.name}반`]
    : [me.tenant.name];
}

export default function PageHeader({
  title,
  subtitle,
  asOf,
  actions,
  notice,
}: PageHeaderProps) {
  const { me } = useConsoleMe();
  const crumbs = crumbsFor(me);
  return (
    <header className="flex max-w-content flex-col gap-4 px-4 pt-6 pb-6 md:px-8 md:pt-10 lg:px-12 lg:pt-14 lg:pb-10">
      <div className="flex items-start gap-4">
        <div className="flex flex-col gap-3">
          <nav aria-label="현재 위치">
            <ol className="flex items-center gap-1">
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={crumb} className="flex items-center gap-1">
                    {i > 0 && (
                      <ChevronRight
                        aria-hidden
                        className="size-[0.875rem] text-ink-sub"
                      />
                    )}
                    {last ? (
                      <span
                        aria-current="page"
                        className="text-app-label font-semibold text-ink-strong"
                      >
                        {crumb}
                      </span>
                    ) : (
                      <span className="text-app-caption text-ink-sub">
                        {crumb}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <h1 className="text-app-title font-bold text-ink-strong">{title}</h1>
          {subtitle && <p className="text-app-body text-ink-sub">{subtitle}</p>}
          {asOf && <p className="text-app-caption text-ink-sub">{asOf}</p>}
        </div>
        {actions && <div className="ml-auto max-md:hidden">{actions}</div>}
      </div>
      {notice && (
        <p className="text-app-body text-ink-sub md:hidden">{notice}</p>
      )}
    </header>
  );
}
