import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AdminPagination from "@/pages/admin/shared/AdminPagination";
import type { LoginLogResponse } from "./api";
import { memberTypeLabel } from "./labels";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstTime(iso: string): string {
  return new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString().slice(11, 16);
}

export default function LoginLogTable({
  data,
  onPage,
}: {
  data: LoginLogResponse;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">로그인 기록</h2>
        <span className="text-sm text-muted-foreground">
          전체 {data.total.toLocaleString()}건
        </span>
      </div>
      {!data.namesVisible && (
        <p className="mb-3 text-sm text-muted-foreground">
          이름은 회원 관리 보기 권한이 있는 관리자에게만 보입니다.
        </p>
      )}
      <Table aria-label="로그인 기록">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>날짜</TableHead>
            <TableHead>처음 접속</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>기관</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground"
              >
                기간 안 로그인 기록이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((row) => (
              <TableRow key={`${row.kstDate}-${row.profileId}`}>
                <TableCell>{row.kstDate}</TableCell>
                <TableCell>{kstTime(row.firstSeenAt)}</TableCell>
                <TableCell>{row.name ?? ""}</TableCell>
                <TableCell>{memberTypeLabel(row.memberType)}</TableCell>
                <TableCell>{row.tenantName ?? ""}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <AdminPagination
        page={data.page}
        totalPages={totalPages}
        onPageChange={onPage}
      />
    </div>
  );
}
