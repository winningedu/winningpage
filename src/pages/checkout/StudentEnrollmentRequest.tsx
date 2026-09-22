import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import successCheck from "@/assets/checkout/success-check-60.svg";
import ConfirmModal from "@/components/checkout/ConfirmModal";
import ServiceCatalog from "@/components/pricing/ServiceCatalog";
import { useAuth } from "@/context/AuthProvider";
import { formatKRW } from "@/data/pricingCatalog";
import { apiFetch, getAuthHeader } from "@/lib/apiFetch";
import { getApprovedParentLink } from "@/lib/parentLink";
import {
  filterOrgProducts,
  useMatchedTenantIds,
  useProducts,
} from "@/lib/products";
import { supabase } from "@/lib/supabase";

// 부산캠퍼스 특가(2026-09-01, supabase/migrations/20260901050445) 학생당 1회
// 구매 제한 — 서버는 WC066 으로 이미 막지만(fn_request_enrollment), UX상
// 미노출이 정본이라(팀 리드 지시) 이미 구매(paid/waiting_deposit)한 학생에게는
// 애초에 카드 자체를 보여주지 않는다. 이 상품은 service_key='special' 로
// 유일해 그 값으로 그룹을 식별한다(다른 서비스와 충돌 없음).
const BUSAN_9900_SERVICE_KEY = "special";

// 학생 — 결제 요청(수강신청) 화면. Figma 실측 재작업(2026-08-12b, 팀 리드가
// get_design_context 로 직접 뽑은 전문 기준 — 이전 라운드는 Figma 접근 없이
// 산문 설명만으로 만들어져 폐기됐다). 3921:7066(선택) / 3921:7480(학부모
// 미연결 실패 모달) / 3921:7792(완료) 3개 상태를 한 컴포넌트 안에서 status
// 전환으로 담는다(팀 리드 지시 — 별도 라우트를 만들지 않는다). 여기서는
// 결제를 하지 않는다 — "요청"만 만들고 학부모가 마이페이지에서 수락+결제한다
// (sql/68·sql/69 제품 규칙 확정, ParentCheckout.jsx 상단 `?order=` 진입
// 규약 주석과 짝). /pricing 도 학생 로그인 시 이 컴포넌트를 그대로 재사용한다
// (Pricing.jsx 역할 분기 참고 — 화면을 두 벌 만들지 않는다).
//
// 상품 그룹핑 — 팀 리드 스펙 문구는 program_key(target/mentor/suhaeng/diagnose) 기준이지만
// 기존 조회 훅(src/lib/products.js)은 service_key(goal/mentor/suhaeng/diagnose)로
// 그룹핑한다(Pricing.jsx 가 이미 이 훅을 그렇게 쓴다). dev DB 실측 결과 이 4개
// 서비스는 service_key ↔ program_key 가 1:1 대응이라(goal↔target, mentor↔mentor,
// suhaeng↔suhaeng, diagnose↔diagnose) 그룹 구성 결과가 동일하므로 기존 훅을 그대로
// 재사용한다. diagnose는 학습진단 유료 게이팅(20260821, 이용 요금 구조 최종본
// 20260806)으로 추가된 4번째 서비스다 — 회원가입 시 1회 무료 이후에만 이 결제
// 경로가 필요해진다.
//
// 카탈로그 필터 — 예전엔 여기 ALLOWED_SERVICE_KEYS 하드코딩 상수를 뒀는데
// ParentCheckout.tsx 가 같은 상수를 별도로 들고 있다 드리프트로 diagnose 가
// 한쪽에서 빠지는 버그가 났다(결제 차단). 이제 useProducts(orderableOnly: true)로
// DB 컬럼 products.is_orderable 을 정본으로 쓴다(supabase/migrations/20260825000000).

// 그룹당 1개 선택 안내 — 시안 실측 문구(3921:7066, 목표관리·수행평가 섹션
// 하단에만 있고 콜멘토엔 없다 — 아래 렌더 조건 `products.length > 1`이 이를
// 자연스럽게 처리한다). src/data/pricingCatalog.js 의 SINGLE_SELECT_NOTICE 와
// 다른 문구다 — 그 상수는 Pricing.jsx 전용 시안(1882 시리즈) 실측이고 이 화면은
// 별도 시안 노드(3921 시리즈)에서 뽑은 문구라 여기서만 쓰는 로컬 상수로 둔다.
// (주의: 팀 리드가 저해상도 스크린샷으로 "여러 옵션"이라 오독해 앞서 다르게
// 지시했었다 — 정본은 "여러 플랜"이다, 이번 실측으로 정정.)
const SINGLE_PLAN_NOTICE =
  "한 서비스 내에서 여러 플랜을 동시 선택할 수 없어요. 하나의 플랜만 선택 가능합니다.";

// 학부모 미연결 실패 모달(시안 3921:7480) 본문 — 시안 원문 그대로(3줄 줄바꿈
// 유지). 제목의 시안 오타 "실패했습니다.," → "실패했습니다."로 정정(사용자 확정).
const FAIL_MODAL_BODY = (
  <>
    아직 연결된 학부모 계정이 없어요.
    <br />
    마이페이지에 있는 내 연결코드를
    <br />
    학부모님께 알려드리면 결제 요청을 보낼 수 있어요.
  </>
);

// 서버 제출 실패(학부모 미연결 이외의 사유) — 제목은 기존 승인 문구
// ("결제요청에 실패했습니다.") 재사용. 본문은 신규 문구(사용자 승인 대기).
const GENERIC_SUBMIT_FAIL = {
  title: "결제요청에 실패했습니다.",
  body: "잠시 후 다시 시도해 주세요.",
};

// WC043(fn_request_enrollment 의 중복 open 요청 게이트, sql/71) 응답 —
// 같은 학생·학부모 쌍에 이미 응답 대기 중인 요청이 있다는 뜻이다. 신규
// 문구(사용자 승인 대기).
const DUPLICATE_REQUEST_FAIL = {
  title: "이미 진행 중인 결제 요청이 있어요.",
  body: "학부모님의 확인을 기다리고 있어요. 마이페이지에서 요청 현황을 확인해 주세요.",
};

interface SelectedItem {
  id: string;
  serviceKey: string;
  serviceName: string;
  name: string;
  listPrice: number;
  price: number;
}

interface SubmitError {
  title: string;
  body: string;
}

interface CompletedOrder {
  id: string;
  amount: number;
  parentName: string | null;
}

export default function StudentEnrollmentRequest() {
  const navigate = useNavigate();
  const {
    services: filteredServices,
    loading,
    error,
    refetch,
  } = useProducts(undefined, { orderableOnly: true });

  // org 한정 상품 노출 필터(2026-09-01) — 학생 본인 기준(fn_matched_tenant_ids 를
  // 인자 없이 호출 → 본인 + 연결된 학부모의 소속). 표시 전용, 정본은
  // fn_request_enrollment 의 서버 재검증(api/request-enrollment.ts WC064 매핑).
  const { ids: matchedTenantIds } = useMatchedTenantIds();
  const orgFilteredServices = useMemo(
    () => filterOrgProducts(filteredServices, matchedTenantIds),
    [filteredServices, matchedTenantIds],
  );

  // 서비스별 단일 선택: { [serviceKey]: productId } — Pricing.jsx 와 동일 규칙
  // (그룹당 1개, 서로 다른 그룹은 동시 선택 가능).
  const [selected, setSelected] = useState<Record<string, string>>({});
  // 세션은 AuthProvider(전역 단일 구독)에서 읽는다(명세 B-3 §4).
  const { user } = useAuth();

  // 부산캠퍼스 특가 학생당 1회 구매 제한(위 상단 주석) — 본인 orders 는 RLS로
  // 조회 가능하다. 서버(fn_request_enrollment WC066)가 정본이고 이건 UX 전용.
  const [hasPurchasedBusan9900, setHasPurchasedBusan9900] = useState(false);
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    (async () => {
      const { data, error: purchaseError } = await supabase
        .from("orders")
        .select("id, order_items(product_slug)")
        .eq("student_profile_id", user.id)
        .in("status", ["paid", "waiting_deposit"]);
      if (!alive) return;
      if (purchaseError) {
        console.warn("구매 이력 조회 실패:", purchaseError.message);
        return;
      }
      const purchased = (data || []).some((o) =>
        (o.order_items || []).some(
          (it: { product_slug: string | null }) =>
            it.product_slug === "busan-9900",
        ),
      );
      setHasPurchasedBusan9900(purchased);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const visibleServices = useMemo(
    () =>
      hasPurchasedBusan9900
        ? orgFilteredServices.filter((s) => s.key !== BUSAN_9900_SERVICE_KEY)
        : orgFilteredServices,
    [orgFilteredServices, hasPurchasedBusan9900],
  );

  const [submitting, setSubmitting] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  // { title, body } | null — 학부모 미연결 이외의 서버 제출 실패(일반 오류/중복 요청).
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  // null = 선택 화면, {id, amount} = 완료 화면(시안 3921-7792).
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(
    null,
  );

  const hasNoServices = Boolean(error) || filteredServices.length === 0;

  function toggle(serviceKey: string, productId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[serviceKey] === productId) delete next[serviceKey];
      else next[serviceKey] = productId;
      return next;
    });
  }

  // radiogroup 키보드 처리(Escape 해제·화살표 이동·roving tabindex)는
  // ServiceCatalog.tsx(handleRadioKeyDown)로 이전했다 — PricingSelling.tsx와
  // 이 화면이 같은 상호작용 규약을 공유하므로 컴포넌트 하나로 통합했다
  // (2026-08-21 ServiceCatalog 추출, 사용자 지시).

  const selectedItems = useMemo(() => {
    const items: SelectedItem[] = [];
    visibleServices.forEach((service) => {
      const pid = selected[service.key];
      if (!pid) return;
      const product = service.products.find((p) => p.id === pid);
      if (!product) return;
      items.push({
        id: product.id,
        serviceKey: service.key,
        serviceName: service.name,
        name: product.name,
        // 다운스트림 합계 계산(listTotal/subtotal)이 이미 `|| 0` 폴백을 쓰므로
        // null/undefined를 0으로 정규화해도 값 의미는 동일하다.
        listPrice: product.listPrice ?? 0,
        price: product.price ?? 0,
      });
    });
    return items;
  }, [visibleServices, selected]);

  const listTotal = selectedItems.reduce(
    (s, i) => s + Number(i.listPrice || i.price || 0),
    0,
  );
  const subtotal = selectedItems.reduce((s, i) => s + Number(i.price || 0), 0);
  const discountTotal = listTotal - subtotal;

  const canSubmit = selectedItems.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      // 학부모 연결 판정 — 버튼은 처음부터 비활성화하지 않는다(시안 B는 "시도 후
      // 실패" 모달이다, 팀 리드 지시). 연결이 없으면 여기서 모달을 띄우고 중단한다.
      // (서버도 같은 판정을 다시 한다 — 이 클라이언트 조회는 UX 용이고, 신뢰
      // 경계는 api/request-enrollment.js 다.)
      const parentLink = await getApprovedParentLink(user.id);
      if (!parentLink) {
        setShowFailModal(true);
        return;
      }

      const authHeader = await getAuthHeader();
      if (!authHeader) {
        setShowFailModal(true);
        return;
      }

      let response: Response | undefined;
      let payload:
        | {
            error?: string;
            orderId?: string;
            amount?: number;
            parentName?: string | null;
          }
        | undefined;
      try {
        response = await apiFetch("/api/request-enrollment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          // id 만 보낸다 — parentProfileId·금액류는 서버가 신뢰하지 않고 무시한다
          // (api/request-enrollment.js 신뢰 경계 주석 참고).
          body: JSON.stringify({
            items: selectedItems.map((i) => ({ id: i.id })),
          }),
        });
        payload = await response.json();
      } catch {
        setSubmitError(GENERIC_SUBMIT_FAIL);
        return;
      }

      if (!response.ok) {
        if (payload?.error === "no_linked_parent") {
          setShowFailModal(true);
          return;
        }
        if (payload?.error === "duplicate_open_request") {
          setSubmitError(DUPLICATE_REQUEST_FAIL);
          return;
        }
        setSubmitError(GENERIC_SUBMIT_FAIL);
        return;
      }

      // 서버가 실제로 만든 주문의 id/금액을 그대로 쓴다(표시가는 서버 신뢰값).
      // response.ok=true 경로에서 payload/orderId/amount는 기존에도 항상 있다고
      // 가정해온 값 — 타입만 좁힌다(런타임 동작 변경 없음, 실제 누락 가능성은 보고).
      setCompletedOrder({
        id: payload!.orderId!,
        amount: payload!.amount!,
        parentName: payload!.parentName ?? null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // 완료 화면으로 넘어갈 때 맨 위로 올린다. 요청 폼은 상품 목록이 길어 대부분
  // 아래쪽까지 스크롤한 상태에서 제출하는데, 라우트 이동이 아니라 같은 페이지의
  // 상태 전환이라 브라우저가 스크롤 위치를 그대로 유지한다 — 그러면 완료 화면의
  // 제목이 화면 밖에 있어 "아무 일도 안 일어난" 것처럼 보인다.
  useEffect(() => {
    if (!completedOrder) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [completedOrder]);

  // 화면 3 — 완료(시안 3921:7792). 헤더/푸터는 렌더하지 않는다 — SiteLayout
  // (App.jsx 의 /checkout·/pricing 공통 레이아웃 라우트)이 이미 전역으로 감싼다.
  if (completedOrder) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5 py-16 lg:px-50 lg:py-25">
        <div className="flex w-full flex-col items-center gap-10 lg:gap-perf-inset">
          <div className="flex flex-col items-center gap-5">
            <img
              src={successCheck}
              alt=""
              aria-hidden="true"
              className="size-12 lg:size-perf-inset"
            />
            {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 반응형 확대 제거,
                7f072f45 h1과 동일 위계. */}
            <h1 className="whitespace-nowrap text-center text-[2rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
              결제 요청이 완료 되었어요!
            </h1>
          </div>

          <dl className="w-full max-w-156.5 space-y-1 rounded-perf-modal border border-line px-3 py-5">
            <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
              <dt className="shrink-0 text-[0.875rem] font-medium text-ink">
                주문번호
              </dt>
              {/* orders.id 형식(order_<timestamp>_<hex>)을 그대로 쓴다 — 시안의
                  '1234567-1234567'은 더미다. 길어서 줄바꿈되도 값을 자르지 않는다. */}
              <dd className="min-w-0 break-all text-right text-[0.875rem] font-medium text-ink">
                {completedOrder.id}
              </dd>
            </div>
            {/* 연결된 학부모 — api/request-enrollment.ts 가 조회한 parentName을
                그대로 표시만 한다(QA F2, 2026-08-27). */}
            <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
              <dt className="shrink-0 text-[0.875rem] font-medium text-ink">
                연결된 학부모
              </dt>
              <dd className="min-w-0 break-all text-right text-[0.875rem] font-medium text-ink">
                {completedOrder.parentName ?? "—"}
              </dd>
            </div>
            {/* 부가가치세 행 없음(사용자 확정) — orders 스키마엔 부가세 컬럼이
                없고, 시안의 부가세 값도 총액과 동일한 더미였다. */}
            <div className="flex items-center justify-between gap-4 bg-white px-4 py-3">
              <dt className="text-[0.875rem] font-medium text-ink">
                총 결제 금액
              </dt>
              <dd className="text-[0.875rem] font-medium text-ink">
                {formatKRW(completedOrder.amount)}
              </dd>
            </div>
          </dl>

          <div className="flex w-full max-w-100 flex-col items-center">
            <button
              type="button"
              onClick={() => navigate("/mypage?tab=payments")}
              className="flex h-13 w-full items-center justify-center rounded-xl bg-ink-title text-[1rem] font-semibold text-white transition hover:brightness-125"
            >
              마이페이지에서 확인하기
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        <section className="px-5 pb-4 pt-16 text-center sm:px-8">
          <p className="text-[1.125rem] font-medium leading-[1.4] text-ink-sub">
            나에게 맞는 서비스를 선택해주세요
          </p>
          {/* 시안(3921:7066) 원문은 "결제할 서비스를 선택해주세요"이지만 의도적으로
              "결제 요청할"로 바꿨다(사용자 승인, 2026-08-12b) — 이 화면은 결제가
              아니라 결제 "요청"만 만든다(실제 결제는 학부모가 마이페이지에서
              한다). 시안 원문 그대로 두면 학생이 자신이 바로 결제하는 것으로
              오해할 수 있어 정정했다. 시안과 비교하다 되돌리지 말 것.
              MyPage 헤더 위계와 통일하기 위해 반응형 확대를 의도적으로 제거함
              (사용자 확정, 시안 그대로가 아님). */}
          <h1 className="mt-3 text-[2rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#1e293b]">
            결제 요청할 서비스를 선택해주세요
          </h1>
        </section>

        <div className="mx-auto w-full max-w-content px-5 pb-40 pt-10 sm:px-8">
          {loading && (
            <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm font-bold text-ink-sub">
              요금 정보를 불러오는 중입니다.
            </div>
          )}

          {!loading && hasNoServices && (
            <div className="rounded-2xl border border-error/30 bg-white p-10 text-center">
              <p className="text-sm font-bold text-error">
                요금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
              <button
                type="button"
                onClick={refetch}
                className="mt-4 rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-card"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading && !error && (
            <ServiceCatalog
              services={visibleServices}
              selected={selected}
              onToggle={toggle}
              planNotice={SINGLE_PLAN_NOTICE}
            />
          )}
        </div>
      </main>

      {/* 하단 고정 요약 + CTA — 시안 노드 없음(선택 화면 하단 요약은 이 화면
          범위 밖). 기존 구현의 톤(ParentCheckout.jsx 결제 금액 섹션과 동일한
          판매가/할인/총액 dl + 버튼)을 유지한다. */}
      {selectedItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white shadow-[0_-0.375rem_1.5rem_rgba(13,27,42,0.08)]">
          <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <dl className="flex items-center gap-6 text-[0.875rem] font-medium leading-5 text-ink">
              {discountTotal > 0 && (
                <div>
                  <dt className="text-ink-sub">할인 금액</dt>
                  <dd className="text-primary">-{formatKRW(discountTotal)}</dd>
                </div>
              )}
              <div>
                <dt className="text-ink-sub">총 결제 금액</dt>
                <dd className="text-[1.125rem] font-semibold">
                  {formatKRW(subtotal)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full shrink-0 rounded-xl py-3.5 text-[0.875rem] font-semibold leading-5 transition sm:w-auto sm:px-8 ${
                canSubmit
                  ? "bg-primary text-white hover:brightness-125"
                  : "cursor-not-allowed border border-line bg-surface-card text-ink"
              }`}
            >
              {submitting ? "요청하는 중…" : "결제 요청"}
            </button>
          </div>
        </div>
      )}

      {/* 화면 2 — 실패 모달(시안 3921:7480) */}
      {showFailModal && (
        <ConfirmModal
          title="결제요청에 실패했습니다."
          onClose={() => setShowFailModal(false)}
        >
          {FAIL_MODAL_BODY}
        </ConfirmModal>
      )}

      {/* 서버 제출 실패(학부모 미연결 이외) — 일반 오류/중복 요청(WC043) 공용 모달. */}
      {submitError && (
        <ConfirmModal
          title={submitError.title}
          onClose={() => setSubmitError(null)}
        >
          {submitError.body}
        </ConfirmModal>
      )}
    </>
  );
}
