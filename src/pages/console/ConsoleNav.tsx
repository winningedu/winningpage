// 사이드바(1024 이상)와 드로어(1023 이하)가 함께 쓰는 교사 카드 + 메뉴 목록.

import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type { ConsoleMe } from "./api";
import Chip from "./Chip";
import { classLabel, primaryClass } from "./classLabel";
import { findMenuItem, menuFor } from "./menu";
import TenantSwitcher from "./TenantSwitcher";

interface ConsoleNavProps {
  me: ConsoleMe;
  pendingCount: number;
  activePath: string;
  /** 항목을 눌렀을 때(드로어 닫기). */
  onNavigate?: () => void;
}

function TeacherCard({ me }: { me: ConsoleMe }) {
  const homeroom = me.kind === "homeroom";
  const primary = primaryClass(me.classes);
  const roleChip = homeroom
    ? "담임교사"
    : me.kind === "school_admin"
      ? "학교 전체 관리자"
      : "본사 대행";
  const name = me.teacher ? `${me.teacher.name} 선생님` : "본사 직원";
  return (
    <div className="flex flex-col gap-2 rounded-[0.875rem] border border-border bg-card p-4">
      {me.kind === "hq_proxy" ? (
        <TenantSwitcher
          current={me.tenant}
          className="text-app-caption font-medium text-ink-sub"
        />
      ) : (
        <p className="text-app-caption font-medium text-ink-sub">
          {me.tenant.name}
        </p>
      )}
      <p className="text-app-card-title font-bold text-ink-strong">{name}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="Info">{roleChip}</Chip>
        {homeroom ? (
          primary && <Chip tone="Neutral">{`${classLabel(primary)} 담임`}</Chip>
        ) : (
          <Chip tone="Neutral">전교 통합 관리 권한</Chip>
        )}
      </div>
      {me.teacher?.loginId && (
        <p className="text-app-caption text-ink-sub">
          {`아이디 ${me.teacher.loginId}`}
        </p>
      )}
    </div>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-error px-2 py-0.5 text-app-badge font-semibold text-primary-foreground">
      {count >= 100 ? "99+" : count}
    </span>
  );
}

export default function ConsoleNav({
  me,
  pendingCount,
  activePath,
  onNavigate,
}: ConsoleNavProps) {
  const groups = menuFor(me.kind);
  const active = findMenuItem(activePath);
  return (
    <div className="flex flex-col gap-6">
      <TeacherCard me={me} />
      <nav className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="text-app-caption font-semibold text-ink-sub">
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = active?.to === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  {...(isActive ? { "aria-current": "page" as const } : {})}
                  {...(onNavigate ? { onClick: onNavigate } : {})}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-[0.625rem] px-3 text-app-body",
                    isActive
                      ? "bg-sidebar-accent font-bold text-primary"
                      : "font-medium text-ink",
                  )}
                >
                  {item.label}
                  {item.badge && <Badge count={pendingCount} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
