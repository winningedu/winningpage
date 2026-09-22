import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import ServiceCatalog from "@/components/pricing/ServiceCatalog";
import { formatKRW, SINGLE_SELECT_NOTICE } from "@/data/pricingCatalog";
import { saveCart } from "@/lib/cart";
import {
  filterOrgProducts,
  useMatchedTenantIds,
  useProducts,
} from "@/lib/products";
import { supabase } from "@/lib/supabase";

// 서비스별 단일 선택 맵: { [serviceKey]: productId }
type SelectedMap = Record<string, string>;

// 쿠폰 안내 블록 전용 로컬 타입 — coupons 테이블 전체 스키마(discount_amount,
// stackable, grant_type 등, CouponAdmin.tsx CouponRow 참고) 중 이 화면이 실제로
// 쓰는 열만 좁혀 받는다. 여기는 결제 로직이 아니라 목록 안내라 discount_amount 조차
// 쓰지 않는다 — 문구(title)에 금액이 이미 포함돼 있다("4만원 이상 결제 시 3,000원
// 할인" 등, CouponAdmin.tsx 운영 데이터 확정).
type PricingCoupon = {
  id: string;
  title: string;
  deadlineText: string | null;
};

// valid_until(date, 예: '2026-09-30')을 "~9월 30일까지" 형태로. coupons.valid_until은
// DATE 컬럼이라 항상 자정 기준이고, KST(UTC+9)는 UTC보다 앞서므로 로컬 Date 파싱에서
// 날짜가 하루 당겨질 일이 없다(반대 방향 타임존이면 문제가 될 수 있어 이 프로젝트
// 전제인 ko-KR 단일 로캘 한정 안전). 파싱 실패・값 없음이면 기한을 아예 표기하지 않는다.
function formatCouponDeadline(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `~${date.getMonth() + 1}월 ${date.getDate()}일까지`;
}

type CartItem = {
  id: string;
  serviceKey: string;
  serviceName: string;
  serviceDesc: string;
  name: string;
  listPrice: number;
  price: number;
  badge?: string | null | undefined;
  recommended?: boolean | undefined;
};

// 게스트(비로그인) 전용 판매 UI. 이 화면의 원래 이름은 Pricing 이었으나,
// 로그인 사용자 역할 분기가 추가되면서(2026-08-12b 팀 리드 지시) 얇은 분기
// 컨테이너 src/pages/Pricing.jsx 가 그 이름을 가져가고, 기존 본문은 그대로
// 이 파일로 옮겨졌다 — 로직·JSX·주석은 손대지 않았다(순수 이동, import
// 경로만 `../` → `../../`로 수정).
//
// 이 컴포넌트는 게스트(userId 없음) 브랜치에서만 렌더된다 — 로그인 사용자는
// Pricing.jsx 가 학생이면 StudentEnrollmentRequest, 학부모면 결제 진입 차단
// 모달, 그 외면 BlockedMemberNotice 로 미리 갈라낸다. 따라서 여기 안의
// goCheckout() 의 "로그인 안 됐으면 로그인 페이지로" 분기는 이 컴포넌트가
// 게스트 전용이 된 지금도 여전히 유효한 방어 코드다(레이스로 세션이 막
// 만료된 경우 등) — 제거하지 않는다.
//
// 로그인 후 복귀 목적지는 /checkout 이 아니라 /pricing 이다(팀 리드 지시,
// 2026-08-12 — 백도어 차단). /checkout 은 역할 분기만 할 뿐 이 카트 선택을
// 모른다 — 로그인 직후 /checkout 으로 바로 꽂아 넣으면 로그인한 사용자가
// Pricing.jsx 의 역할별 분기(학부모 차단 모달 등)를 거치지 않고 곧장
// /checkout 진입점으로 넘어가 버린다. /pricing 으로 되돌리면 useMemberType
// 기반 분기를 다시 타므로, 같은 역할 판정을 한 곳에서만 하게 된다.
export default function PricingSelling() {
  const navigate = useNavigate();
  const { services, loading, error, refetch } = useProducts();
  const hasNoServices = Boolean(error) || services.length === 0;

  // org 한정 상품(부산캠퍼스 특가 등) 노출 필터(2026-09-01) — 게스트는 세션이
  // 없어 useMatchedTenantIds 가 RPC 자체를 부르지 않고 ids=[] 로 즉시
  // 확정하므로 org 상품은 전부 숨김이 정본대로 유지된다(팀 리드 확정 —
  // 비대상·게스트에게 완전 숨김). matchedTenantIds 의 초기값도 빈 배열이라
  // RPC 응답 전에도 org 상품이 먼저 보였다 사라지는 깜빡임이 없다 — 로그인
  // 사용자가 이 화면을 보는 경로가 있다면 응답 도착 후 매칭된 상품만
  // 나타난다(StudentEnrollmentRequest.tsx 와 동일 패턴).
  const { ids: matchedTenantIds } = useMatchedTenantIds();
  const visibleServices = useMemo(
    () => filterOrgProducts(services, matchedTenantIds),
    [services, matchedTenantIds],
  );
  // 서비스별 단일 선택: { [serviceKey]: productId }
  const [selected, setSelected] = useState<SelectedMap>({});

  // 쿠폰 안내 — 이 화면은 주문(subtotal) 이전 단계라 ParentCheckout.jsx가 쓰는
  // fn_usable_coupons RPC(주문 컨텍스트 필요)를 쓸 수 없다. 대신 그 파일이 stackable
  // 플래그를 읽을 때 쓰는 것과 같은 공개 조회 패턴(`coupons public read` RLS,
  // is_active=true)으로 직접 읽는다 — 특정 주문에 적용 가능한지가 아니라 "현재 어떤
  // 쿠폰이 있는지"를 안내하는 목적이라 이 조회로 충분하다.
  const [coupons, setCoupons] = useState<PricingCoupon[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: couponError } = await supabase
        .from("coupons")
        .select("id, title, valid_until")
        .eq("is_active", true)
        .order("min_amount", { ascending: true });
      if (!alive) return;
      if (couponError) {
        console.warn("쿠폰 안내 조회 실패:", couponError.message);
        return;
      }
      setCoupons(
        (data || []).map((c) => ({
          id: c.id,
          title: c.title,
          deadlineText: formatCouponDeadline(c.valid_until),
        })),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  function toggle(serviceKey: string, productId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[serviceKey] === productId) delete next[serviceKey];
      else next[serviceKey] = productId;
      return next;
    });
  }

  // radiogroup 키보드 처리(Escape 해제・화살표 이동・roving tabindex)는
  // ServiceCatalog.tsx(handleRadioKeyDown)로 이전했다 — toggle 함수의 "같은 값
  // 재호출 = 해제" 계약을 그대로 이용해 그 컴포넌트가 클릭·화살표·Escape 셋을
  // onToggle 하나로 처리한다(ServiceCatalog.tsx onToggle prop 주석 참고).

  // 선택된 상품 목록(장바구니 형태로 enrich)
  const selectedItems = useMemo(() => {
    const items: CartItem[] = [];
    visibleServices.forEach((service) => {
      const pid = selected[service.key];
      if (!pid) return;
      const product = service.products.find((p) => p.id === pid);
      if (!product) return;
      items.push({
        id: product.id,
        serviceKey: service.key,
        serviceName: service.name,
        serviceDesc: service.desc,
        name: product.name,
        // ServiceGroup.products[].listPrice/price(lib/products.ts)는 null/undefined
        // 가능(무할인 상품) — CartItem은 항상 숫자다(saveCart 직렬화·합계 계산 전제).
        listPrice: product.listPrice ?? 0,
        price: product.price ?? 0,
        badge: product.badge,
        recommended: product.recommended,
      });
    });
    return items;
  }, [visibleServices, selected]);

  const totalPrice = selectedItems.reduce(
    (sum, it) => sum + Number(it.price || 0),
    0,
  );
  const listTotal = selectedItems.reduce(
    (sum, it) => sum + Number(it.listPrice || it.price || 0),
    0,
  );
  const discountTotal = listTotal - totalPrice;

  async function goCheckout() {
    if (selectedItems.length === 0) return;
    saveCart(selectedItems); // 선택 항목 저장 (로그인 후에도 유지)
    // 로그인 안 됐으면 로그인 페이지로 → 로그인 후 /pricing 으로 복귀
    // (역할 분기를 다시 타게 한다 — 위 상단 주석 참고).
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      navigate("/login?redirect=/pricing");
      return;
    }
    navigate("/checkout");
  }

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        {/* 타이틀. 좌우 패딩은 아래 콘텐츠 컨테이너와 같은 리듬(390 1.25rem / sm 이상 2rem). */}
        <section className="px-5 pb-4 pt-16 text-center sm:px-8">
          {/* 아이브로 — 시안 실측. 390(1882:16307) 16px w600 lh22 #0b84fd ls-0.32,
              1920(3408:4832 / 텍스트 3408:4872 높이 28 로 lh 교차확인) 20px w600 lh28 #0b84fd.
              rem: 16px = 1rem / lh22 = 1.375rem / 20px = 1.25rem / lh28 = 1.75rem.
              ls 는 두 밴드 모두 -0.02em 이다(-0.32/16 = -0.02, 1920 은 -0.4/20 = -0.02) →
              한 클래스로 통일. 기존 14px w900 은 시안에 없는 값이었다(시안 최대 무게 w700).
              MyPage 헤더 위계와 통일하기 위해 반응형 확대를 의도적으로 제거함
              (사용자 확정, 시안 그대로가 아님). */}
          <p className="text-[1rem] font-semibold leading-5.5 tracking-[-0.02em] text-accent">
            나에게 맞는 서비스를 선택해 주세요
          </p>
          {/* H1 — 390 24px w600 lh34 #525252 ls-0.48 / 1920 50px w600 lh70 #525252 ls-1
              (텍스트 3408:4873 높이 70 으로 lh 교차확인). ls 는 양쪽 모두 -0.02em
              (-0.48/24 = -0.02, -1/50 = -0.02).
              rem: 24px = 1.5rem / lh34 = 2.125rem / 50px = 3.125rem / lh70 = 4.375rem.
              색은 ink(#525252) — 시안 본문 기본색이다. ink-title(#181d24)은 시안이 실제로
              그 색을 쓰는 로그인 H1 전용이라 여기서는 쓰지 않는다.
              기존 40px w900 lh36(0.9배)은 "작고 무겁고 타이트"해서 시안 위계와 반대였다.
              MyPage 헤더 위계와 통일하기 위해 반응형 확대를 의도적으로 제거함
              (사용자 확정, 시안 그대로가 아님). */}
          <h1 className="mt-3 text-[2rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
            결제할 서비스를 선택해 주세요
          </h1>
        </section>

        {/* 서비스 섹션들.
            컨테이너는 프로젝트 공통 관용구 `mx-auto w-full max-w-content px-5 sm:px-8` 를 쓴다
            (정의: components/landing/NewsSection.jsx:13 주석, tailwind.config.js:6-11).
            max-w-content = 72.75rem = outer 1164px 이고 sm 이상에서 px-8(32×2 = 64px)이 붙어
            실제 콘텐츠 폭은 1164 − 64 = 1100px 이다. Header.jsx:683(좌표계 2 = nav·메가 컬럼)
            과 SiteFooter.jsx:64(lg+ 브랜치)가 같은 토큰 + px-8 이라 본문 좌단이 그 둘과 정확히
            일치한다 — 이게 이 규약을 쓰는 이유다. 실측(layout/본문 콘텐츠 좌단 = 헤더 nav 좌단
            = 푸터 lg 좌단): 1920 → 410, 1440 → 170, 1280 → 90(nav 는 desktop 미만이라 숨지만
            푸터와 90 일치), 768 → 32, 390 → 20.
            단 헤더 '로고'는 좌표계 1(max-w-[120rem] px-8 / 2xl:px-[7.5rem]) 위에 있어 이 규약과
            정렬 대상이 아니다 — 로고 좌단은 1920 에서 120, 1440·1280 에서 32 다(Header.jsx:22-28
            의 두 좌표계 주석 참고). 푸터 모바일 브랜치(SiteFooter.jsx:31)는 px-6 라 390 에서
            좌단 24 로 우리 20 과 4px 다르지만, 이는 랜딩 섹션(px-5 sm:px-8)들도 동일한
            전역 기존 거동이라 이 페이지에서 손대지 않는다.
            시안 1920 프레임의 콘텐츠 1596px 은 채택하지 않는다
            (사용자 확정: 결제 화면도 전역 컨텐츠 영역 규약을 따른다).
            폭별 inner = min(뷰포트 − 64, 1100): 1920/1440/1280 → 1100, 768 → 704.
            sm 미만은 상한(1164)에 걸리지 않으므로 px-5(20×2 = 40px)가 폭을 정한다 → 390 → 350.
            하단 여백: sm 이상은 고정 결제바(높이 약 5.5rem)를 피하려고 pb-40을 유지하고,
            모바일은 요약 블록이 문서 흐름에 들어오므로 pb-16으로 줄인다. */}
        <div className="mx-auto w-full max-w-content px-5 pb-16 pt-10 sm:px-8 sm:pb-40">
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
              {/* 이 버튼만 ink-title(#181d24) + w700 이 남아 있었다. 같은 파일의 타이포 주석들이
                  이미 "ink-title 은 시안 근거 없음(로그인 H1 전용 토큰)" 이라고 적고 있으므로
                  본문 기본색 ink(#525252) + 시안 최다 무게 w500 으로 정정했다.
                  크기(text-sm)는 시안에 없는 에러 분기 UI 라 현행 유지. */}
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
              showDetailLinks
              planNotice={SINGLE_SELECT_NOTICE}
            />
          )}

          {/* 쿠폰 안내 — 특정 서비스에 속한 게 아니라 결제 전반에 적용되는 전역
              쿠폰이라 서비스 반복문 밖, 요금 카드들 아래에 한 번만 둔다. 쿠폰이
              하나도 없으면(조회 실패 포함) 빈 박스를 보여주지 않는다. */}
          {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 이전 라운드에 반응형
              확대(lg 24px 제목 등)를 넣었던 건 7f072f45로 폐기된 구 규약을 되살린
              실수였다. 페이지 전역과 같은 고정 크기로 정정한다. */}
          {coupons.length > 0 && (
            <div className="mt-8 rounded-2xl border border-line bg-surface-footer p-6 text-left sm:mt-10 sm:p-8">
              <p className="text-[1rem] font-semibold text-ink">쿠폰 안내</p>
              <ul className="mt-3 space-y-1.5">
                {coupons.map((coupon) => (
                  <li
                    key={coupon.id}
                    className="text-[0.8125rem] font-medium text-ink"
                  >
                    {coupon.title}
                    {coupon.deadlineText ? ` (${coupon.deadlineText})` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[0.75rem] font-medium text-ink-sub">
                결제 시 중복할인은 적용되지 않습니다.
              </p>
            </div>
          )}
        </div>

        {/* 모바일 결제 요약 (시안 1882-16017) — 390 시안은 하단 고정 바가 아니라 마지막 서비스
            섹션 아래에 붙는 문서 흐름 밴드다. 3행(총 판매가/총 할인금액/총 결제금액) + 풀폭 CTA.
            뷰포트 좌우를 꽉 채우는 밴드라 콘텐츠 컨테이너 밖(main 직속)에 둔다.
            내부 좌우 패딩은 위 콘텐츠 컨테이너의 모바일 패딩과 같은 px-5(1.25rem)로 맞춰
            390에서 행이 콘텐츠 컬럼과 정렬되게 한다(sm 이상은 hidden 이라 base 값만 쓰인다). */}
        {selectedItems.length > 0 && (
          // 배경은 아래 sm+ 고정 바와 같은 토큰을 쓴다.
          //   배경   surface.info(#e9f4ff) — 두 요약 UI가 각자 하드코딩하던 e3eeff의 토큰 대응값
          //   금액강조 primary(#013262), CTA accent(#0B84FD) — 390 시안 실측색과 일치
          // (sm+ 고정 바의 총 할인금액도 1280 시안 실측 #013262 확인 후 primary 로 정정해
          //  두 요약 UI 의 색 역할이 이제 일치한다 — :587 주석 참고.)
          <div className="bg-surface-info px-5 py-7 sm:hidden">
            <dl className="space-y-2.5 text-[0.875rem]">
              <div className="flex items-baseline justify-between gap-4">
                {/* 390 요약 밴드(1882:16017)는 스타일 인벤토리에 항목이 없어 크기(14px)는
                    현행을 유지하고, 시안 규약에서 확실히 벗어난 것만 되돌린다:
                    값 색 ink-title(#181d24) → ink(#525252, 시안 본문 기본색). */}
                <dt className="font-medium text-ink-sub">총 판매가</dt>
                <dd className="font-bold text-ink">{formatKRW(listTotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-medium text-ink-sub">총 할인 금액</dt>
                {/* 390 시안(1882-16017)만 할인금액에 마이너스 부호가 붙는다('-273,600원').
                    요약 바를 실제로 그린 sm 이상 시안은 1280 = 1882-15190 과
                    1920 = 3408-4832 이고 둘 다 '151,400원' 처럼 부호 없이 표기하므로
                    아래 고정 바는 현행 유지. (1882-10810 에는 요약 바 자체가 없다 —
                    '총 판매가'·'총 할인금액' 문자열이 0건이라 근거로 쓸 수 없다.) */}
                <dd className="font-bold text-primary">
                  {discountTotal > 0
                    ? `-${formatKRW(discountTotal)}`
                    : formatKRW(0)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-medium text-ink-sub">총 결제 금액</dt>
                {/* w900 은 시안 무게 범위(w400~w700) 밖이라 w700 으로 내린다. */}
                <dd className="text-[1rem] font-bold text-primary">
                  {formatKRW(totalPrice)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={goCheckout}
              className="mt-5 w-full rounded-lg bg-accent py-3.5 text-[0.9375rem] font-bold text-white transition hover:brightness-95"
            >
              {formatKRW(totalPrice)} 결제하기
            </button>
          </div>
        )}
      </main>

      {/* 하단 플로팅 결제바 — sm 이상 전용(모바일은 위 인플로우 요약 블록이 대체한다). */}
      {selectedItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 hidden bg-surface-info shadow-[0_-0.375rem_1.5rem_rgba(13,27,42,0.08)] sm:block">
          {/* 요약 바 내부 컨테이너는 본문 컨테이너(:134)와 **폭 토큰 `max-w-content` +
              좌우 패딩 `px-5 sm:px-8`** 이 같아야 한다 — 클래스 문자열 전체가 같은 것은
              아니다(이쪽은 flex/items-center/justify-between/gap-6/py-5 가 더 붙고, 본문은
              pb-16 pt-10 sm:pb-40 을 쓴다). 근거는 위 본문 컨테이너 주석 참고.
              폭만 맞추고 좌우 패딩이 다르면 요약바 텍스트가 플랜 행보다 좌우로 밀려
              들어가므로, 폭 토큰과 좌우 패딩은 반드시 함께 수정해야 한다.
              base `px-5` 는 부모가 hidden sm:block(:543)이라 렌더되지 않는다 — 실제로
              적용되는 건 sm 쪽 px-8 뿐이다. 그래도 남겨 두는 이유는 본문의 좌우 패딩
              토큰과 문자 단위로 대조할 수 있게 하려는 것이고, sm 미만에서는 부모가
              숨기므로 무해하다. */}
          <div className="mx-auto flex w-full max-w-content items-center justify-between gap-6 px-5 py-5 sm:px-8">
            {/* 부모가 hidden sm:block 이라 base 값은 절대 적용되지 않는다 → 단일 gap-16. */}
            <div className="flex items-center gap-16">
              {/* 요약바 라벨 — 색 근거(ink 채택)는 유지: 1280 실측 #36393e 는 ink(#525252)가
                  ink-title(#181d24)보다 유클리드 거리로 더 가깝다(42.5 < 48.6, tailwind.config.js
                  신규 hex 추가 금지). 값 크기는 MyPage 수준 통일(사용자 확정 2026-08-19,
                  7f072f45) — 기존 24px(1280 시안 실측)는 그 규약 폐기 이전 값이라 총결제
                  위계(text-[1rem] font-semibold)로 내렸다. */}
              <div className="text-center">
                <p className="text-[1rem] font-medium leading-5.5 text-ink">
                  총 판매가
                </p>
                <p className="mt-1 text-[1rem] font-semibold leading-[1.4] text-ink">
                  {formatKRW(listTotal)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[1rem] font-medium leading-5.5 text-ink">
                  총 할인 금액
                </p>
                {/* 총 할인금액 값 색 — 1280 시안(1882:15190) 실측 #013262 = primary 다. */}
                <p className="mt-1 text-[1rem] font-semibold leading-[1.4] text-primary">
                  {formatKRW(discountTotal)}
                </p>
              </div>
            </div>
            {/* CTA 는 모바일 밴드와 동일하게 accent. 그림자 틴트도 accent(#0B84FD) rgb 로 맞춘다.
                크기는 MyPage 수준 통일(사용자 확정 2026-08-19) — 7f072f45의 결제 버튼과 동일
                위계(text-[0.875rem] font-semibold). 기존 20px는 그 규약 폐기 이전 값이었다. */}
            <button
              type="button"
              onClick={goCheckout}
              className="shrink-0 rounded-lg bg-accent px-8 py-3.5 text-[0.875rem] font-semibold leading-[1.25rem] tracking-[-0.02em] text-white shadow-[0_0.625rem_1.625rem_rgba(11,132,253,0.28)] transition hover:brightness-95"
            >
              {formatKRW(totalPrice)} 결제하기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
