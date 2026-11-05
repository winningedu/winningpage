// 표 아래 쪽 이동(스펙 0.4). 쪽 표시 문구와 처음, 이전, 쪽 번호, 다음, 끝 버튼.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const NUMBER_WINDOW = 5;

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
}: PaginationProps) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const first = Math.max(
    1,
    Math.min(
      page - Math.floor(NUMBER_WINDOW / 2),
      pageCount - NUMBER_WINDOW + 1,
    ),
  );
  const numbers = Array.from(
    { length: Math.min(NUMBER_WINDOW, pageCount) },
    (_, i) => first + i,
  );
  const step =
    "flex h-8 items-center px-2 text-app-label text-ink disabled:opacity-40";
  return (
    <nav
      aria-label="쪽 이동"
      className="flex flex-wrap items-center justify-center gap-1 py-6"
    >
      <span className="mr-2 text-app-label font-medium text-ink">
        {`${page} / ${pageCount} 페이지, ${from}~${to}번째`}
      </span>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(1)}
        className={step}
      >
        처음
      </button>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={step}
      >
        <ChevronLeft aria-hidden className="size-4" />
        이전
      </button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          aria-current={n === page ? "page" : undefined}
          onClick={() => onChange(n)}
          className={cn(
            "size-8 rounded-lg text-app-label text-ink",
            n === page && "border border-border font-semibold text-ink-strong",
          )}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className={step}
      >
        다음
        <ChevronRight aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(pageCount)}
        className={step}
      >
        끝
      </button>
    </nav>
  );
}
