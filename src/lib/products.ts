// 상품/서비스 조회 — 신뢰 소스는 Supabase `products` 테이블 하나뿐이다.
// 프론트 코드에는 가격 데이터를 하드코딩/폴백하지 않는다(사용자 요구: "가격표가
// 프론트에 있으면 안 된다"). 조회 실패 시에도 임의의 가격을 지어내지 말고
// 호출부가 loading/error 상태를 그대로 사용자에게 안내해야 한다.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

const PRODUCT_COLUMNS =
  "id, service_key, service_name, service_desc, service_sort_order, sort_order, name, list_price, price, badge, is_recommended, is_active, tenant_id, sale_ends_at";

type ProductRow = {
  id: string;
  service_key: string;
  service_name: string;
  service_desc?: string | null;
  service_sort_order?: number | null;
  sort_order?: number | null;
  name: string;
  list_price?: number | null;
  price?: number | null;
  badge?: string | null;
  is_recommended?: boolean | null;
  is_active?: boolean;
  // 소속 한정 상품 축(2026-09-01, supabase/migrations/20260901050440. tenant_id
  // FK로 전환됨). tenant_id 가 있으면 fn_matched_tenant_ids 로 얻은 목록에
  // 포함될 때만, sale_ends_at 이 있으면 그 시각 이전일 때만 노출한다 —
  // filterOrgProducts 가 이 두 컬럼을 쓴다.
  tenant_id?: string | null;
  sale_ends_at?: string | null;
};

export type ServiceProduct = {
  id: string;
  name: string;
  listPrice: number | null | undefined;
  price: number | null | undefined;
  badge: string | null | undefined;
  recommended: boolean;
  tenantId: string | null | undefined;
  saleEndsAt: string | null | undefined;
};

export type ServiceGroup = {
  key: string;
  name: string;
  desc: string;
  order: number;
  products: ServiceProduct[];
};

// Supabase products 행 → 서비스별 그룹 구조로 변환
function groupProducts(rows: ProductRow[] | null | undefined): ServiceGroup[] {
  const map = new Map<string, ServiceGroup>();
  (rows || []).forEach((r) => {
    if (!map.has(r.service_key)) {
      map.set(r.service_key, {
        key: r.service_key,
        name: r.service_name,
        desc: r.service_desc || "",
        // Number.isFinite는 타입가드가 아니므로 typeof로 좁혀야 삼항의 true 분기가 number로 좁혀진다.
        order:
          typeof r.service_sort_order === "number" &&
          Number.isFinite(r.service_sort_order)
            ? r.service_sort_order
            : 99,
        products: [],
      });
    }
    map.get(r.service_key)?.products.push({
      id: r.id,
      name: r.name,
      listPrice: r.list_price,
      price: r.price,
      badge: r.badge,
      recommended: !!r.is_recommended,
      tenantId: r.tenant_id,
      saleEndsAt: r.sale_ends_at,
    });
  });
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

// products 테이블에서 활성 상품을 조회해 서비스별로 그룹핑한 배열을 반환한다.
// serviceKey를 넘기면 해당 서비스 상품만 조회한다. orderableOnly가 true면
// is_orderable=true 인 것만 추가로 걸러 셀프서브 결제 카탈로그(ParentCheckout.tsx,
// StudentEnrollmentRequest.tsx)에서 쓴다 — 예전엔 화면마다 ALLOWED_SERVICE_KEYS
// 하드코딩 상수로 중복 유지하다 드리프트로 결제 차단 버그가 났다(is_orderable
// 컬럼 도입 배경, supabase/migrations/20260825000000). 조회 실패 시 예외를 던진다
// (호출부인 useProducts가 error 상태로 변환한다) — 조용히 빈 배열을 반환하지 않는다.
async function fetchProducts(
  serviceKey?: string | null,
  orderableOnly?: boolean,
): Promise<ServiceGroup[]> {
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("is_active", true)
    .order("service_sort_order", { ascending: true })
    .order("sort_order", { ascending: true });

  if (serviceKey) query = query.eq("service_key", serviceKey);
  if (orderableOnly) query = query.eq("is_orderable", true);

  const { data, error } = await query;
  if (error) throw error;
  return groupProducts(data);
}

// products 조회 훅. serviceKey를 넘기면 해당 서비스 상품만 조회한다(전체가 필요하면
// 인자 없이 호출). opts.orderableOnly=true면 is_orderable=true 인 상품만 돌려준다
// (위 fetchProducts 주석 참고). 반환: { services, loading, error, refetch }
// - services: 서비스별 그룹 배열(빈 배열이면 로딩/에러가 아닌 이상 "조회된 상품 없음"을 뜻함)
// - error: 조회 실패 시 Error 객체, 정상이면 null
// - refetch: 실패/빈 결과 시 재시도용
export function useProducts(
  serviceKey?: string | null,
  opts?: { orderableOnly?: boolean },
) {
  const orderableOnly = opts?.orderableOnly ?? false;
  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) reloadToken은 effect 안에서 읽지 않는 재시도(refetch) 트리거 전용 카운터다.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const grouped = await fetchProducts(serviceKey, orderableOnly);
        if (!alive) return;
        setServices(grouped);
      } catch (err) {
        if (!alive) return;
        console.warn("products 조회 실패:", err?.message || err);
        setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [serviceKey, orderableOnly, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { services, loading, error, refetch };
}

// fn_matched_tenant_ids(2026-09-01, supabase/migrations/20260901050440. tenant
// 전환으로 fn_matched_org_codes 대체) 호출 훅 — 로그인 사용자가 소속으로 확인받을
// 수 있는 tenant_id(uuid) 목록(본인 + 연결된(approved) 상대 전원 +
// p_student_profile_id 로 지정된, 호출자와 연결된 학생)을 반환한다. authenticated
// 전용 RPC라 비로그인 상태에서 호출하면 42501(permission denied)이 나므로, 세션이
// 없으면 RPC 자체를 부르지 않고 빈 배열로 확정한다(비로그인은 org 상품 전부
// 숨김이 정책이라 결과도 같다). loaded=false 인 동안은 ids가 아직 신뢰할 수 있는
// 값이 아니다 — 호출부가 이 시점에 필터링하면 org 상품이 일시적으로 사라졌다
// 나타나는 깜빡임/오탐이 생길 수 있다.
export function useMatchedTenantIds(studentProfileId?: string | null) {
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        if (!alive) return;
        setIds([]);
        setLoaded(true);
        return;
      }

      const { data, error } = await supabase.rpc("fn_matched_tenant_ids", {
        // p_student_profile_id는 DEFAULT가 있는 optional 인자다.
        // exactOptionalPropertyTypes 하에서는 명시적 null도 금지라 값이 있을 때만
        // 키를 스프레드한다(생략이 명시적 null과 런타임에서 동일하다).
        ...(studentProfileId ? { p_student_profile_id: studentProfileId } : {}),
      });
      if (!alive) return;
      if (error) {
        console.warn("fn_matched_tenant_ids 조회 실패:", error.message);
        setIds([]);
      } else {
        setIds(data || []);
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [studentProfileId]);

  return { ids, loaded };
}

// org 한정 상품(products.tenant_id) 노출 필터 — 각 화면(StudentEnrollmentRequest,
// ParentCheckout, PricingSelling 등)이 useProducts 로 받은 서비스 그룹에 이 필터를
// 한 번 더 적용한다(정본은 여전히 DB — fn_request_enrollment/fn_parent_create_
// enrollment 가 서버에서 재검증한다, 이 필터는 표시 전용). 규칙: tenant_id 가
// 없으면 노출, 있으면 matchedTenantIds 에 포함되고 sale_ends_at 이 없거나 아직
// 지나지 않았을 때만 노출한다. 필터 후 상품이 하나도 남지 않은 서비스 그룹은
// 통째로 뺀다(카탈로그에 빈 섹션을 보여주지 않는다).
export function filterOrgProducts(
  services: ServiceGroup[],
  matchedTenantIds: string[],
): ServiceGroup[] {
  const matched = new Set(matchedTenantIds);
  return services
    .map((service) => ({
      ...service,
      products: service.products.filter((p) => {
        if (!p.tenantId) return true;
        if (!matched.has(p.tenantId)) return false;
        if (p.saleEndsAt && new Date(p.saleEndsAt).getTime() <= Date.now()) {
          return false;
        }
        return true;
      }),
    }))
    .filter((service) => service.products.length > 0);
}
