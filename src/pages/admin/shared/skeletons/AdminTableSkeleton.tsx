import { AdminSkeletonStatus } from "./AdminSkeletonStatus";
import { SkeletonBar } from "./SkeletonBar";

interface TableSkeletonGridProps {
  columns: number;
  rows?: number | undefined;
}

// 표 모양 막대만 그린다(status 없음). 셸 스켈레톤처럼 status를 바깥에서 한 번만 두는 곳이 쓴다.
// 헤더 배경(#fafafa), 행 구분선(#edf0f4), 셀 여백은 AdminEngine 표와 같다.
export function TableSkeletonGrid({
  columns,
  rows = 10,
}: TableSkeletonGridProps) {
  const template = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  };
  // 순서가 바뀌지 않는 고정 길이 목록이라 위치 문자열을 key로 쓴다.
  const cells = Array.from({ length: columns }, (_, i) => `col-${i}`);
  const lines = Array.from({ length: rows }, (_, i) => `row-${i}`);
  return (
    <div className="bg-white">
      <div
        data-part="header"
        className="grid gap-4 border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3"
        style={template}
      >
        {cells.map((key) => (
          <SkeletonBar key={key} className="h-4 w-3/4" />
        ))}
      </div>
      {lines.map((line) => (
        <div
          key={line}
          data-part="row"
          className="grid gap-4 border-b border-[#edf0f4] px-5 py-4"
          style={template}
        >
          {cells.map((key) => (
            <SkeletonBar key={key} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

interface AdminTableSkeletonProps extends TableSkeletonGridProps {
  label?: string;
}

// 목록 표를 기다리는 동안 보이는 스켈레톤.
export function AdminTableSkeleton({
  columns,
  rows,
  label,
}: AdminTableSkeletonProps) {
  return (
    <AdminSkeletonStatus label={label}>
      <TableSkeletonGrid columns={columns} rows={rows} />
    </AdminSkeletonStatus>
  );
}
