import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// 번들 상품(busan-9900 등)의 구성 내역 표기 — 영수증(ReceiptModal)·결제 상세
// (PaymentDetailModal)이 공유한다(태스크6, 2026-09-01).
//
// 스냅샷을 저장하지 않고 렌더 시 bundle_items를 조회한다 — 번들 정의가
// 바뀌면 새 slug로 낸다는 원칙(부산캠퍼스 번들 설계 주석)이라 과거 주문도
// 지금의 bundle_items 값을 그대로 보여줘도 무방하다.
//
// program_key → 한글 라벨 매핑 — 코드베이스에 기존 매핑이 없어(api/_lib/
// serviceAccess.ts·카탈로그 어디에도 없음, 확인 완료) 이 용도 전용 소형
// 매핑을 둔다. 매핑에 없는 program_key는 원문 그대로 노출한다(지어내지
// 않는다). 라벨은 사용자 확정 카피(2026-09-01)로 "서비스"를 붙인다.
const PROGRAM_KEY_LABELS: Record<string, string> = {
  diagnose: "학습진단서비스",
  target: "목표관리서비스",
  growth: "성장설계서비스",
  suhaeng: "수행평가서비스",
  inquiry: "심화탐구서비스",
  selfeval: "자기평가서비스",
};

// 구성 라인 노출 순서 — 사용자 확정 카피(2026-09-01)로 list_price 정렬을
// 버리고 고정 순서를 쓴다. 부산 번들 6항목 확대(2026-10)로 성장설계, 심화탐구,
// 자기평가를 고객사 요청 문구 순서대로 더했다.
const PROGRAM_KEY_ORDER = [
  "diagnose",
  "target",
  "growth",
  "suhaeng",
  "inquiry",
  "selfeval",
];

// 수량 표기 — 회차·기간을 동시에 가진 항목(예: 수행평가 2회+1개월)은
// 기간을 표기하지 않고 "N회권"으로 합쳐 보여준다(사용자 확정 카피,
// 2026-09-01). 회차만 있으면 "N회", 기간만 있으면 "N개월"
// (bundle_items_entitlement_shape_check가 최소 하나는 있음을 보장한다).
function formatBundleQuantity(
  sessionQuota: number | null | undefined,
  durationMonths: number | null | undefined,
) {
  if (sessionQuota && durationMonths) return `${sessionQuota}회권`;
  if (sessionQuota) return `${sessionQuota}회`;
  if (durationMonths) return `${durationMonths}개월`;
  return "";
}

type BundleItemRow = {
  product_id: string;
  program_key: string;
  duration_months: number | null;
  session_quota: number | null;
  list_price: number;
};

// product_id → 구성 라인 문자열 배열("학습진단 1회" 등). 여러 product_id를
// 한 번에 조회한다(주문 하나에 번들 상품이 여러 줄 담길 수 있다).
export function useBundleCompositionMap(
  productIds: (string | null | undefined)[] | undefined,
) {
  const uniqueIds = Array.from(
    new Set((productIds ?? []).filter((id): id is string => Boolean(id))),
  );
  // 배열 레퍼런스는 렌더마다 새로 생기므로, 내용이 같으면 재요청하지 않게
  // 정렬한 문자열을 안정적인 effect 의존값으로 쓴다.
  const key = uniqueIds.slice().sort().join(",");

  const [map, setMap] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!key) {
      setMap(new Map());
      return;
    }
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("bundle_items")
        .select(
          "product_id, program_key, duration_months, session_quota, list_price",
        )
        .in("product_id", key.split(","))
        .overrideTypes<BundleItemRow[], { merge: false }>();

      if (!alive) return;

      // 조회 실패 시 구성 라인만 조용히 생략한다(팀 리드 지시) — 전체 모달을
      // 에러로 막지 않는다. 번들 아닌 주문(uniqueIds가 매칭 없음)도 data가
      // 빈 배열이라 자연히 빈 map이 된다.
      if (error || !data) {
        setMap(new Map());
        return;
      }

      const sorted = data
        .slice()
        .sort(
          (a, b) =>
            PROGRAM_KEY_ORDER.indexOf(a.program_key) -
            PROGRAM_KEY_ORDER.indexOf(b.program_key),
        );

      const next = new Map<string, string[]>();
      for (const row of sorted) {
        const label = PROGRAM_KEY_LABELS[row.program_key] || row.program_key;
        const qty = formatBundleQuantity(
          row.session_quota,
          row.duration_months,
        );
        const line = qty ? `${label} ${qty}` : label;
        const list = next.get(row.product_id) ?? [];
        list.push(line);
        next.set(row.product_id, list);
      }
      setMap(next);
    })();

    return () => {
      alive = false;
    };
  }, [key]);

  return map;
}
