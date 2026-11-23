// 본사 대시보드(사 #161). 기관을 고르면 그 기관과 읽기 전용 사유를 미리 고른 대행 고르기 화면으로 간다(Q4, 결정 116).
// 대행 시작은 그 화면에서 사용자가 누른다.

import { useNavigate } from "react-router";
import LoginSection from "./LoginSection";
import TenantOverview from "./TenantOverview";

export default function HqDashboardAdmin() {
  const navigate = useNavigate();
  return (
    <div className="bg-white p-10 shadow-sm">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">대시보드</h1>
      <TenantOverview
        onSelectTenant={(tenantId) =>
          navigate(
            `/teacher/proxy?${new URLSearchParams({ tenant: tenantId, reason: "read_only" })}`,
          )
        }
      />
      <LoginSection />
    </div>
  );
}
