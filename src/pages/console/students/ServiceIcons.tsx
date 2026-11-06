// 서비스 6종 아이콘과 "n/6". 쓴 서비스는 서비스 색, 안 쓴 서비스는 회색이다.

import { cn } from "@/lib/utils";
import { SERVICES, type ServiceKey } from "./services";

interface ServiceIconsProps {
  services: Record<ServiceKey, boolean>;
  count: number;
}

export default function ServiceIcons({ services, count }: ServiceIconsProps) {
  return (
    <span className="flex items-center gap-1">
      {SERVICES.map(({ key, label, Icon, color }) => (
        <Icon
          key={key}
          aria-label={`${label} ${services[key] ? "이용" : "미이용"}`}
          role="img"
          className={cn(
            "size-[0.875rem]",
            services[key] ? color : "text-neutral-400",
          )}
        />
      ))}
      <span className="ml-1 text-app-label text-ink">{`${count}/${SERVICES.length}`}</span>
    </span>
  );
}
