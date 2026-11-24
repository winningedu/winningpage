import { Plus, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { AdminTable } from "@/pages/admin/shared/AdminEngine";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import { type PremiumBookPageRow, useDeletePage, usePageList } from "./api";
import { Heading } from "./Heading";
import { PdfPanel } from "./PdfPanel";
import { PREMIUM_BOOK_PATH } from "./paths";
import type { PremiumBookAdminConfig } from "./types";
import { useLoadErrorToast } from "./useLoadErrorToast";

// 목록 화면. 쪽 번호는 주소 검색값 page 에 두어 폼에서 뒤로 와도 같은 쪽이 열린다.
export function PremiumBookList({
  config,
}: {
  config: PremiumBookAdminConfig;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const list = usePageList();
  const remove = useDeletePage();
  useLoadErrorToast(list.error, config.title);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rows = list.data?.items ?? [];

  function setPage(updater: number | ((prev: number) => number)) {
    const next = typeof updater === "function" ? updater(page) : updater;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next <= 1) params.delete("page");
        else params.set("page", String(next));
        return params;
      },
      { replace: true },
    );
  }

  const duplicateSortOrders = useMemo(() => {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.sort_order)) dupes.add(row.sort_order);
      seen.add(row.sort_order);
    }
    return [...dupes].sort((a, b) => a - b);
  }, [rows]);

  // 폼에서 돌아올 때 같은 쪽을 열도록 지금 검색값을 들고 간다.
  const goto = (path: string) =>
    navigate(path, {
      state: { from: searchParams.size ? `?${searchParams}` : "" },
    });

  async function deleteRow(row: PremiumBookPageRow) {
    if (
      !(await confirmAdmin({
        title: "정말 삭제하시겠습니까?",
        confirmLabel: "삭제",
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      await remove.mutateAsync(row.id);
    } catch (error) {
      reportAdminError("삭제 실패", error as Error);
    }
  }

  return (
    <div>
      <Heading config={config} />
      <PdfPanel />

      {duplicateSortOrders.length > 0 && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          페이지 번호(sort_order) 중복: {duplicateSortOrders.join(", ")}. 정렬과
          표시 순서가 어긋날 수 있습니다. 아래 목록에서 먼저 정리하세요.
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => list.refetch()}
        >
          <RefreshCw aria-hidden="true" />
          초기화
        </Button>

        <Button
          type="button"
          size="lg"
          onClick={() => goto(`${PREMIUM_BOOK_PATH}/new`)}
        >
          <Plus aria-hidden="true" />
          등록
        </Button>
      </div>

      {list.isPending ? (
        <div
          role="status"
          className="bg-white p-12 text-center text-sm font-medium text-muted-foreground shadow-sm"
        >
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <AdminTable
          config={config}
          rows={rows}
          page={page}
          setPage={setPage}
          onEdit={(row) => goto(`${PREMIUM_BOOK_PATH}/${row.id}`)}
          onDelete={deleteRow}
        />
      )}
    </div>
  );
}
