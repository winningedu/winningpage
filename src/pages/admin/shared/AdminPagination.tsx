import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";

// 관리자 화면은 URL 이 아니라 state 로 페이지를 넘기므로 ui PaginationLink(<a>)
// 대신 Button(<button>)을 PaginationItem 안에 둔다.
export default function AdminPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // 페이지 번호 창. 기존에는 1~10을 고정 렌더했는데, 4,300페이지짜리 입결 목록에서는
  // 그 방식으로 11페이지 이후에 도달할 방법이 없다(≫ 버튼으로 끝으로 점프한 뒤에도
  // 번호줄은 1~10을 가리킨다). 현재 페이지를 가운데 두고 창을 굴린다 —
  // totalPages ≤ 10이면 예전과 완전히 같은 1..N이 나온다.
  const windowSize = Math.min(totalPages, 10);
  const windowStart = Math.min(
    Math.max(1, page - Math.floor(windowSize / 2)),
    Math.max(1, totalPages - windowSize + 1),
  );
  const pageNumbers = Array.from(
    { length: windowSize },
    (_, index) => windowStart + index,
  );
  const atFirst = page <= 1;
  const atLast = page >= totalPages;

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <Pagination aria-label="페이지 이동">
        <PaginationContent>
          <PaginationItem>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="첫 페이지"
              disabled={atFirst}
              onClick={() => onPageChange(1)}
            >
              <ChevronsLeft />
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="이전 페이지"
              disabled={atFirst}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ChevronLeft />
            </Button>
          </PaginationItem>

          {pageNumbers.map((num) => (
            <PaginationItem key={num}>
              <Button
                type="button"
                variant={page === num ? "outline" : "ghost"}
                size="icon"
                aria-label={`${num}페이지`}
                aria-current={page === num ? "page" : undefined}
                onClick={() => onPageChange(num)}
              >
                {num}
              </Button>
            </PaginationItem>
          ))}

          <PaginationItem>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="다음 페이지"
              disabled={atLast}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              <ChevronRight />
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="마지막 페이지"
              disabled={atLast}
              onClick={() => onPageChange(totalPages)}
            >
              <ChevronsRight />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      {/* 번호줄이 창(최대 10칸)만 보여주므로 지금 몇 번째인지 따로 알려준다.
          페이지가 1장뿐인 대부분의 메뉴에서는 노이즈라 2장 이상일 때만 렌더한다. */}
      {totalPages > 1 && (
        <p className="text-xs font-semibold text-muted-foreground">
          {page.toLocaleString()} / {totalPages.toLocaleString()} 페이지
        </p>
      )}
    </div>
  );
}
