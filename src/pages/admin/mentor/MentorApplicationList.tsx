import { Download, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
import { AdminTable } from "@/pages/admin/shared/AdminEngine";
import { toastWarning } from "@/pages/admin/shared/adminToast";
import { downloadCsv, searchable } from "@/pages/admin/shared/csvExport";
import { useSensitiveActionGate } from "@/pages/admin/shared/SensitiveActionGate";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import {
  type MentorApplicationRow,
  useLoadErrorToast,
  useMentorApplicationList,
  useResetMentorList,
} from "./api";
import type { MentorApplicationsAdminProps } from "./MentorApplicationsAdmin";
import { MENTOR_APPLICATIONS_PATH } from "./paths";

export default function MentorApplicationList({
  config,
}: MentorApplicationsAdminProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // 검색어와 쪽 번호는 주소에 둬서 상세에서 돌아오면 그대로 살아난다.
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const query = useMentorApplicationList();
  const resetList = useResetMentorList();
  useLoadErrorToast(`${config.title} 조회 실패`, query.error);

  // 개인정보 반출 게이트 (QA 270, 228).
  const { requestAccess, gate } = useSensitiveActionGate();

  const rows = useMemo<MentorApplicationRow[]>(
    () => query.data?.items ?? [],
    [query.data],
  );

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchable(row).includes(q));
  }, [rows, keyword]);

  function updateParams(next: { q?: string; page?: number }) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next.q !== undefined) {
          if (next.q) params.set("q", next.q);
          else params.delete("q");
        }
        if (next.page !== undefined) {
          if (next.page > 1) params.set("page", String(next.page));
          else params.delete("page");
        }
        return params;
      },
      { replace: true },
    );
  }

  // QA 270, 228: 멘토 신청 내역 다운로드. 목록은 휴대폰을 maskedPhone 으로 가리지만
  // 게이트를 통과한 파일에는 원본을 담는다(MembersAdmin.exportMembers 와 같은 판단).
  function exportApplications() {
    const columns = config.columns.map((column) =>
      column.type === "maskedPhone" ? { ...column, type: undefined } : column,
    );

    downloadCsv(
      `${config.title}_${ymdIn(new Date(), browserTimeZone())}.csv`,
      filteredRows as unknown as Record<string, unknown>[],
      columns,
    );
  }

  function requestExport() {
    if (filteredRows.length === 0) {
      toastWarning("내보낼 데이터가 없습니다.");
      return;
    }

    requestAccess({
      action: "download",
      resourceKey: "mentorApplications",
      title: "멘토 신청 내역 다운로드",
      description: `멘토 지원자 ${filteredRows.length.toLocaleString()}건의 개인정보(이름, 대학, 휴대폰)가 CSV 파일로 저장됩니다.`,
      rowCount: filteredRows.length,
      onGranted: exportApplications,
    });
  }

  return (
    <div>
      {gate}

      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void resetList()}
            >
              <RefreshCw aria-hidden="true" />
              초기화
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={requestExport}
            >
              <Download aria-hidden="true" />
              엑셀 다운로드
            </Button>
          </div>

          <Input
            aria-label="신청 내역 검색"
            value={keyword}
            onChange={(e) => updateParams({ q: e.target.value })}
            placeholder={config.searchPlaceholder}
            className="h-9 w-80"
          />
        </div>

        <h1 className="mt-4 text-xl font-semibold">{config.title}</h1>
      </div>

      {query.isPending ? (
        <AdminTableSkeleton
          // 번호 + 설정 열 + 관리, AdminTable 머리글과 같다.
          columns={config.columns.length + 2}
          label="멘토 신청 목록을 불러오는 중입니다."
        />
      ) : (
        <AdminTable
          config={config}
          rows={filteredRows}
          page={page}
          setPage={(updater) =>
            updateParams({
              page: typeof updater === "function" ? updater(page) : updater,
            })
          }
          onEdit={(row) =>
            navigate({
              pathname: `${MENTOR_APPLICATIONS_PATH}/${row.id}`,
              search: location.search,
            })
          }
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
