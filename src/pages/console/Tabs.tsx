// 콘솔 탭 줄(스펙 0.4). 선택한 탭은 굵은 글씨와 밑줄로 보인다.

import { cn } from "@/lib/utils";

interface TabsProps {
  items: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}

export default function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      className="flex gap-8 border-b border-line px-4 md:px-8 lg:px-12"
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              "-mb-px border-b-2 pb-3 text-app-body",
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
