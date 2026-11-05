// 서비스별 이용현황 카드(교 #32, #12). 서비스 6종 세로 막대, 높이는 범위 안 학생 대비 비율.

import {
  ClipboardCheck,
  FilePen,
  Microscope,
  Sprout,
  Target,
  UserCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { percent } from "./format";
import type { DashboardStats, ServiceKey } from "./useDashboard";

// 서비스 고정 색(교 #12)은 막대와 아이콘이 같은 토큰을 쓴다. Tailwind 가 읽도록 클래스 이름을 모두 적는다.
const SERVICES: {
  key: ServiceKey;
  name: string;
  Icon: typeof Target;
  text: string;
  bar: string;
}[] = [
  {
    key: "diagnosis",
    name: "학습진단",
    Icon: ClipboardCheck,
    text: "text-service-diagnosis-fg",
    bar: "bg-service-diagnosis-fg",
  },
  {
    key: "goal",
    name: "목표관리",
    Icon: Target,
    text: "text-service-goal-fg",
    bar: "bg-service-goal-fg",
  },
  {
    key: "growth",
    name: "성장설계",
    Icon: Sprout,
    text: "text-service-growth-fg",
    bar: "bg-service-growth-fg",
  },
  {
    key: "performance",
    name: "수행평가",
    Icon: FilePen,
    text: "text-service-performance-fg",
    bar: "bg-service-performance-fg",
  },
  {
    key: "selfeval",
    name: "자기평가",
    Icon: UserCheck,
    text: "text-service-self-assessment-fg",
    bar: "bg-service-self-assessment-fg",
  },
  {
    key: "inquiry",
    name: "심화탐구",
    Icon: Microscope,
    text: "text-service-research-fg",
    bar: "bg-service-research-fg",
  },
];

interface ServiceCardProps {
  /** null 이면 불러오는 중(뼈대). */
  stats: Pick<DashboardStats, "services" | "usage"> | null;
  caption: string;
}

export default function ServiceCard({ stats, caption }: ServiceCardProps) {
  const countOf = (key: ServiceKey) =>
    stats?.services.find((s) => s.key === key)?.count ?? 0;
  return (
    <section
      aria-label="서비스별 이용현황"
      className="flex flex-1 flex-col gap-5 rounded-2xl bg-goal-cardTone-neutral px-4 py-7"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-app-card-title font-bold text-ink-strong">
          서비스별 이용현황
        </h2>
        <p className="text-app-caption text-ink-sub">{caption}</p>
      </div>
      <ul className="flex flex-1 gap-2 md:gap-4">
        {SERVICES.map(({ key, name, Icon, text, bar }) => {
          const count = countOf(key);
          const ratio = stats ? percent(count, stats.usage.totalCount) : 0;
          return (
            <li
              key={key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2.5"
            >
              {stats ? (
                <span className="text-app-label font-semibold text-ink-strong">{`${ratio}%`}</span>
              ) : (
                <Skeleton className="h-4 w-8 bg-neutral-200" />
              )}
              <div className="relative h-[15.8rem] w-full max-w-14 flex-1 overflow-hidden rounded-xl bg-surface-muted">
                {stats && (
                  <div
                    className={`absolute inset-x-0 bottom-0 ${bar}`}
                    style={{ height: `${ratio}%` }}
                  />
                )}
              </div>
              <span
                className={`flex items-center justify-center gap-1 text-center text-app-caption font-medium ${text}`}
              >
                <Icon aria-hidden className="size-[0.875rem] shrink-0" />
                {name}
              </span>
              {stats ? (
                <span className="text-app-label text-ink-sub">{`${count}명`}</span>
              ) : (
                <Skeleton className="h-4 w-8 bg-neutral-200" />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
