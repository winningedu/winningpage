import type { ComponentProps } from "react";
import { site } from "@/config/site";
import StudentUsageAdmin from "@/pages/admin/tenants/StudentUsageAdmin";
import ServiceCreditAdjustAdmin from "./ServiceCreditAdjustAdmin";

// 서비스이용횟수조정 메뉴의 사이트별 화면. 스쿨멘토는 위닝 이용권(게이트가 보지 않는다, 결정 98.13) 대신
// 기관 이용 한도를 조정하고, 위닝은 기존 화면 그대로다.
export default function ServiceCreditAdjustEntry(
  props: ComponentProps<typeof ServiceCreditAdjustAdmin>,
) {
  return site.features.hqTenantAdmin ? (
    <StudentUsageAdmin />
  ) : (
    <ServiceCreditAdjustAdmin {...props} />
  );
}
