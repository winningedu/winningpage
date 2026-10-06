import type { ReactNode } from "react";

// 활동 선택 화면 카드 공통 틀. 시안은 흰 바탕에 얇은 테두리 카드다.
export function CollectSection({
  title,
  description,
  children,
  sectionRef,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  sectionRef?: React.Ref<HTMLElement> | undefined;
}) {
  return (
    <section
      ref={sectionRef}
      className="rounded-xl border border-line bg-white px-6 py-6"
    >
      <h2 className="text-app-card-title font-bold text-ink-strong">{title}</h2>
      {description && (
        <p className="mt-2 text-app-label text-ink-sub">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CountRow({
  label,
  count,
  strong = false,
}: {
  label: string;
  count: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-3 last:border-b-0">
      <span className="text-app-label text-ink-sub">{label}</span>
      <span
        className={`text-app-body text-ink-strong ${strong ? "font-bold" : "font-medium"}`}
      >
        {count}건
      </span>
    </div>
  );
}

export function NoticeBox({
  tone = "info",
  children,
  role,
}: {
  tone?: "info" | "warn";
  children: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div
      role={role}
      className={`rounded-lg px-4 py-3 text-app-label text-ink-strong ${
        tone === "warn" ? "bg-surface-warning" : "bg-surface-info"
      }`}
    >
      {children}
    </div>
  );
}
