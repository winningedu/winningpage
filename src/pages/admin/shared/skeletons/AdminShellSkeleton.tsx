import { AdminSkeletonStatus } from "./AdminSkeletonStatus";
import { TableSkeletonGrid } from "./AdminTableSkeleton";
import { SkeletonBar } from "./SkeletonBar";

const MENU_ITEMS = Array.from({ length: 8 }, (_, i) => `menu-${i}`);

// 실제 셸(Admin.tsx AdminLayout, AdminSidebar, AdminTopbar)과 같은 크기와 배치다.
// Admin 청크를 끌어오지 않으려고 import하지 않고 값만 맞춰 둔다.
// status는 셸 전체에 하나만 두고 안쪽 표는 막대만 그리는 TableSkeletonGrid를 쓴다.
export function AdminShellSkeleton() {
  return (
    <AdminSkeletonStatus
      label="관리자 페이지 불러오는 중"
      className="min-h-screen bg-[#f4f4f4]"
    >
      {/* 배경색은 Admin.tsx ADMIN_SIDEBAR_THEME의 --sidebar 값(#101214) */}
      <aside
        data-part="sidebar"
        className="fixed left-0 top-0 hidden h-screen bg-[#101214] md:block md:w-56"
      >
        <div className="border-b border-white/10 px-5 py-5">
          <SkeletonBar className="h-8 w-24 bg-white/10" />
        </div>
        <div className="space-y-2 px-3 py-4">
          {MENU_ITEMS.map((key) => (
            <SkeletonBar key={key} className="h-8 w-full bg-white/10" />
          ))}
        </div>
      </aside>
      <header
        data-part="topbar"
        className="fixed left-0 right-0 top-0 flex h-14 items-center border-b border-black/10 bg-white px-4 shadow-sm md:left-56 xl:px-7"
      >
        <SkeletonBar className="h-4 w-40" />
      </header>
      <main data-part="main" className="pt-14 md:ml-56">
        <div className="min-h-[calc(100vh-3.5rem)] space-y-6 px-4 py-8 xl:px-7">
          <SkeletonBar className="h-8 w-48" />
          <TableSkeletonGrid columns={6} rows={10} />
        </div>
      </main>
    </AdminSkeletonStatus>
  );
}
