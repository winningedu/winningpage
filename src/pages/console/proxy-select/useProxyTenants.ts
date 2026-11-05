// GET /api/console/proxy/tenants. 대행할 수 있는 본사 관리자만 목록을 받는다.
// 200 이 아니면 대행 권한이 없는 계정이라 null 이다(입구 가드와 W5a 가 같은 결과를 쓴다).

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "../api";

export interface ProxyTenant {
  id: string;
  code: string;
  name: string;
}

export const PROXY_TENANTS_KEY = ["console", "proxy-tenants"] as const;

export function useProxyTenants(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: PROXY_TENANTS_KEY,
    queryFn: async (): Promise<ProxyTenant[] | null> => {
      const res = await consoleRequest("/api/console/proxy/tenants");
      if (res.status !== 200) return null;
      return (res.body as { tenants: ProxyTenant[] }).tenants;
    },
    retry: false,
    refetchOnWindowFocus: false,
    ...options,
  });
}
