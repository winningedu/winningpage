import { ChevronRight } from "lucide-react";
import { Fragment, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useBundleCompositionMap } from "@/components/mypage/bundleComposition";
import { formatKRW } from "@/data/pricingCatalog";
import type { ServiceGroup, ServiceProduct } from "@/lib/products";

// products.service_key → 서비스 상세 페이지 라우트.
// 링크 목적지는 products 테이블에 컬럼을 추가하지 않고 코드측 매핑으로 둔다 —
// 라우트는 src/App.jsx 소유이고, 이미 src/data/navigation.js 의 GNB 도 같은
// 목적지를 코드에 적어 두고 있어(목표관리·콜멘토·수행평가) 정본이 둘로 갈리지 않는다.
// susi(위닝 수시예측)는 상세 페이지가 아직 없어서 의도적으로 비어 있다 —
// src/App.jsx 확인 결과 /services/{goal,callmentor,performance,self-assessment,research}
// 는 있지만 수시예측 상세에 해당하는 라우트가 없다(/admission/susi 는 입시 사례
// 게시판이라 서비스 상세가 아니다). 죽은 링크를 만드는 대신 링크를 렌더하지 않는다
// (390 시안 1882-16307 에는 수시예측에도 '자세히보기'가 있으므로, 상세 페이지 신설
// 여부는 결정 대기 항목 — 라우트가 생기면 여기 한 줄 추가로 복구된다).
// diagnose(학습진단) — 과거엔 "학습진단은 무료라 결제 플로우에서 뺀다"는 정책으로
// 여기서 의도적으로 제외돼 있었으나, 이용 요금 구조 최종본(20260806)으로 정책이
// 뒤집혔다 — 학습진단도 이제 유료 상품(이용권 10,000원, 회원가입 시 1회 무료)이라
// 다른 서비스와 동일하게 취급한다. 상세 페이지 라우트는
// /services/learning-diagnosis(src/routes/diagnosisRoutes.tsx)다.
//
// 정본은 이 파일 하나뿐이다(2026-08-21 ServiceCatalog 추출 전에는 PricingSelling.tsx
// 에만 있었다) — 결제 요청 화면(StudentEnrollmentRequest.tsx)도 이 맵을 그대로 쓴다.
const SERVICE_DETAIL_ROUTES: Record<string, string> = {
  diagnose: "/services/learning-diagnosis",
  goal: "/services/goal",
  mentor: "/services/callmentor",
  suhaeng: "/services/performance",
};

/** 서비스별 단일 선택: { [serviceKey]: productId } */
export type ServiceCatalogSelection = Record<string, string>;

type ServiceCatalogProps = {
  services: ServiceGroup[];
  selected: ServiceCatalogSelection;
  /**
   * 클릭·화살표 이동·Escape 해제가 전부 이 콜백 하나로 수렴한다 — "같은
   * productId 를 다시 넘기면 해제, 다른 값이면 그 값으로 교체"가 계약이다
   * (PricingSelling.tsx 의 옛 `toggle` 함수와 동일 의미론). 화살표 이동은 이
   * 계약을 그대로 이용해 "이미 선택된 항목으로 되돌아온 경우(그룹 상품 1개)
   * 에는 호출 자체를 생략"하는 방식으로 오해제를 막는다(아래
   * handleRadioKeyDown 참고) — 별도의 "강제 선택" 콜백을 만들지 않는다.
   */
  onToggle: (serviceKey: string, productId: string) => void;
  /**
   * '자세히보기' 링크(+44×44 히트 오버레이)·셰브론 렌더 여부. 기본 false —
   * 결제 요청 화면(StudentEnrollmentRequest)의 시안에는 이 링크가 없다.
   */
  showDetailLinks?: boolean;
  /**
   * 그룹 하단 단일선택 안내문. 생략하면 렌더하지 않는다 — 두 화면이 서로 다른
   * 시안 노드의 문구 상수(PricingSelling 의 SINGLE_SELECT_NOTICE,
   * StudentEnrollmentRequest 의 SINGLE_PLAN_NOTICE)를 쓰므로 문구 자체는
   * 통합하지 않고 컨테이너가 주입한다.
   */
  planNotice?: string;
};

/**
 * 서비스 그룹 → 플랜 행(상품명·배지·취소선 정가·할인율·판매가) → 단일 선택 →
 * 안내문 표현 계층. PricingSelling.tsx(게스트)와 StudentEnrollmentRequest.tsx
 * (학생)가 공유한다 — 두 화면이 이 계층을 각자 복제하고 있던 것이 타이포 규약
 * 드리프트를 실제로 2회 유발해(7f072f45 축소가 한쪽에만 반영), 사용자 지시로
 * 이 컴포넌트 하나로 통합했다(2026-08-21). 컨테이너(게스트 카트/goCheckout,
 * 학생 학부모요청 CTA·실패 모달)는 서로 다른 코드 경로라 여기 포함하지 않는다
 * — props(services/selected/onToggle/showDetailLinks/planNotice)로만 소통한다.
 *
 * 타이포는 MyPage 수준 고정 크기로 통일돼 있다(사용자 확정 2026-08-19, 7f072f45)
 * — 반응형 확대 분기를 추가하지 않는다. h1 은 이 컴포넌트가 아니라 각 컨테이너
 * 소유다(두 화면의 문구·위계가 다르다).
 */
export default function ServiceCatalog({
  services,
  selected,
  onToggle,
  showDetailLinks = false,
  planNotice,
}: ServiceCatalogProps) {
  // org 한정 상품(부산캠퍼스 특가 등) 카드의 "구성: ..." 문구용 — bundle_items를
  // 조회해 라벨·수량을 만든다(useBundleCompositionMap, mypage/bundleComposition.ts와
  // 공유). 훅은 최상위에서만 호출해야 하므로 아래 서비스/상품 순회 루프 밖에서
  // 대상 productId를 미리 모은다(tenant_id가 없는 일반 상품은 빈 배열).
  const orgProductIds = services.flatMap((service) =>
    service.products.filter((p) => p.tenantId).map((p) => p.id),
  );
  const bundleCompositionMap = useBundleCompositionMap(orgProductIds);
  // radiogroup 키보드 규약(WAI-ARIA APG) — 화살표 이동은 포커스만 옮기는 게 아니라
  // 그 자리에서 바로 선택도 함께 바꾼다(네이티브 <input type=radio> 그룹과 동일 동작).
  // Home/End 는 넣지 않았다 — 그룹당 최대 5개(수시예측)뿐이라 화살표만으로 왕복 비용이
  // 낮고, APG 도 Home/End 를 "권장 확장"이지 필수로 두지 않는다. 필요해지면 이 함수에
  // 분기만 추가하면 된다.
  // 선택 갱신은 products 배열 인덱스로 계산한다(DOM 조회로 productId 문자열을 얻으면
  // product.id 가 숫자 PK 인 경우 dataset 은 항상 문자열이라 `selected[key] === product.id`
  // 비교가 타입 불일치로 깨질 수 있다) — 포커스 이동만 DOM 조회를 쓴다(타입 무관, 초점
  // 이동에는 실제 엘리먼트가 필요하므로).
  function handleRadioKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    serviceKey: string,
    products: ServiceProduct[],
    currentIndex: number,
  ) {
    // Escape = 그룹 선택 해제. 마우스는 재클릭으로 토글 해제가 되지만(아래 role="radio"
    // 주석 참고) 화살표 키는 "이동=선택"이라 키보드만 쓰는 사용자는 그룹 안에서 선택을
    // 완전히 뺄 방법이 없었다 — 그 격차를 메운다. preventDefault 도 실제로 해제를 수행했을
    // 때만 부른다: 상위(Header 메가메뉴 등)에서 Escape 를 다른 용도로 쓸 수 있어 무조건
    // 막으면 위험하기 때문이다(실측 결과 이 프로젝트엔 상위 Escape 리스너가 없어 — grep
    // 상 MobileNavDrawer/ColumnPreviewModal/AdmissionGuidelines/ComboField 뿐이고 이 페이지
    // 트리와 무관 — 지금은 충돌하지 않지만, 향후 상위에 리스너가 생겨도 이 조건부
    // preventDefault 덕에 선택이 없는 그룹에서는 그 리스너를 계속 막지 않는다).
    if (e.key === "Escape") {
      const currentId = selected[serviceKey];
      if (!currentId) return; // 선택 없는 그룹 — 아무 것도 하지 않는다.
      e.preventDefault();
      // onToggle(serviceKey, 현재 선택값) → "같은 값 재클릭 = 해제" 계약을 그대로
      // 이용한다. 별도의 "clear" 콜백을 만들지 않는다.
      onToggle(serviceKey, currentId);
      // 포커스는 옮기지 않는다(현재 버튼에 그대로 유지). roving tabindex는 위
      // hasSelectionInGroup/isRovingTabStop 이 selected 상태의 파생값이라 재렌더 때
      // 자동으로 "그룹에 선택 없음 → 첫 항목만 tabIndex 0" 규칙으로 돌아간다.
      return;
    }

    let delta = 0;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -1;
    else return;
    e.preventDefault(); // 기본 동작(페이지 스크롤)을 막는다.

    const nextIndex =
      (currentIndex + delta + products.length) % products.length;
    // nextIndex는 products.length에 대한 모듈러 연산 결과라 항상 유효 범위 인덱스다.
    const nextProduct = products[nextIndex]!;
    // 이미 선택된 항목으로 되돌아온 경우(그룹 상품이 1개뿐이라 어느 방향으로 이동해도
    // 같은 인덱스)에는 onToggle을 부르지 않는다 — "같은 값 재호출 = 해제" 계약이
    // 그대로 적용되면 화살표 키 한 번에 의도치 않게 선택이 풀린다.
    if (selected[serviceKey] !== nextProduct.id) {
      onToggle(serviceKey, nextProduct.id);
    }

    const group = e.currentTarget.closest('[role="radiogroup"]');
    const nextEl =
      group?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex];
    nextEl?.focus();
  }

  return (
    <>
      {services.map((service) => {
        // noUncheckedIndexedAccess — Record 인덱싱은 항상 `| undefined`다. 아래에서
        // 두 번(조건문·Link to) 다시 인덱싱하면 그 사이 좁혀진 타입이 유지되지 않아
        // `to`가 undefined 가능 타입으로 남는다 — 한 번만 읽어 재사용한다.
        const detailRoute = SERVICE_DETAIL_ROUTES[service.key];

        return (
          <section key={service.key} className="mb-16">
            {/* 아래 여백이 390 에서만 mb-3(12px)인 이유: 시안 타이포로 내리면 이 행의 높이가
            h2 lh20 로 정해져 '자세히보기' 앵커(17px) 아래 슬랙이 1.5px 뿐이다.
            44×44 오버레이(사용자 확정)가 앵커 아래로 넘치는 양 (44 − 17)/2 = 13.5px 을
            덮으려면 1.5 + 여백 ≥ 13.5, 즉 여백 ≥ 12px 이어야 한다 → mb-3.
            mb-2(8px)면 4.5px 이 아래 요소 위로 겹쳐 44px 중 일부가 실질적으로 죽는다.
            sm 이상은 행 높이가 h2 lh49 라 슬랙 (49−22)/2 = 13.5px 만으로 이미 충분하므로
            기존 8px(sm:mb-2)을 그대로 유지한다. */}
            <div className="mb-3 flex items-center gap-2 sm:mb-2">
              {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 반응형 확대
              제거, ParentCheckout SECTION_HEADING과 동일 고정 크기.
              ⚠ 아래 히트영역(자세히보기 오버레이) 주석의 "390 lh20 / sm lh49" 실측치는
              이 확대 제거 이전 크기 기준이다 — h-11·mb-3·sm:mb-2 등 실제 치수는
              바뀌지 않았고 이 h2 가 더 커졌을 뿐이라 슬랙이 줄어들 위험은 없지만,
              치수 재실측 전까지 주석 속 구체 px 값은 참고용으로만 볼 것. */}
              {/* id는 아래 플랜 목록 radiogroup의 aria-labelledby 대상이다 —
              서비스명을 그룹 라벨로 그대로 재사용해 별도 시각적 라벨을 추가하지
              않아도 스크린리더가 "N개 중 M번째, [서비스명] 라디오 버튼"으로 읽는다. */}
              <h2
                id={`plan-group-label-${service.key}`}
                className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink"
              >
                {service.name}
              </h2>
              {/* 390 시안(1882-16307, 프레임 1882:16340)의 이 줄은 자식이 정확히 둘이다 —
              서비스명 텍스트(w96) + 8px 뒤 '자세히보기' 텍스트(x104 w52 h17). 셰브론
              아이콘이 없다. 반대로 1920 시안(1882-10810)과 1280 시안(1882-15190,
              1882-15614)에는 '자세히보기' 문구가 0건이고 셰브론만 있다
              (390 은 4건 / 10810·15190·15614 는 모두 0건).
              그래서 두 표현을 하나의 Link 안에 담아(문구 sm:hidden / 셰브론 hidden sm:block)
              BP 무관하게 실제로 클릭 가능한 요소가 되게 한다. 기존에는 sm 이상에서
              셰브론이 클릭 불가 장식으로 남아 있었다.

              히트영역: 링크 박스 자체는 시안대로 두고(글자·아이콘 크기 = 시안값)
              ::after 오버레이로만 44×44 을 확보한다 — 레이아웃에 참여하지 않으므로
              검증 통과값(390 inner 350 / 플랜 행 64px / 1920 inner 1100)에 영향이 없다.
              패딩+음수마진 방식은 금지: h2 와의 시안 gap 8px(gap-2)을 음수마진이
              잠식해 8 − 11 = −3px, 즉 제목과 3px 겹친다.
              실측 링크 박스 — sm 이상 22×22(셰브론), 390 은 문구 타이포를 시안값
              (12px/lh17)으로 내린 뒤 약 52×17.
                · 세로: top-1/2 + h-11 + -translate-y-1/2 → 앵커 높이와 무관하게 두
                  밴드 모두 44px. 아래로 넘치는 양 = (44 − 앵커높이)/2 = sm 11px /
                  390 약 13.5px.
                  sm 이상은 행 높이가 h2 lh49 로 정해져 앵커 아래 슬랙 (49−22)/2 =
                  13.5px + mb-2 8px = 21.5px > 11px 이라 아래 요소를 침범하지 않는다.
                  390 은 h2 를 시안값(18px/lh20)으로 내리면서 행 높이가 20px 로 줄어
                  앵커 아래 슬랙이 1.5px 뿐이다. 그래서 오버레이를 줄이는 대신 이 행의
                  아래 여백을 390 에서만 mb-3(12px)로 키워 1.5 + 12 = 13.5px 를 확보했다
                  (위 헤더 행 주석의 산식). 실측 확인: 앵커 하단 → 설명 문단 상단 여유
                  13px, 오버레이 하단 지점이 링크로 히트된다.
                  추가 안전장치로 바로 아래 형제(설명 문단 <p> 와 플랜 목록 컨테이너)에
                  `relative` 를 붙였다 — 둘 다 이 Link 보다 DOM 뒤이고 z-index 가 auto 라
                  나중에 페인트되므로, 서브픽셀 반올림으로 1px 이라도 겹치면 그 지점의
                  히트 테스트를 아래 요소가 가져간다(레이아웃·시각 변화는 0).
                  위로 넘치는 만큼은 섹션 mb-16(64px, 첫 섹션은 컨테이너 pt-10 40px)
                  의 빈 여백이라 겹칠 대상이 없다.
                · 가로: 390 은 앵커가 이미 56.18px(≥44)이라 w-full 로 충분.
                  sm 이상은 22px 뿐이라 확장이 필요한데 좌측 여유는 h2 와의 gap 8px
                  까지다 → -left-2(−8) + w-11(44) 로 좌 8 / 우 14 비대칭 확장
                  (8 + 22 + 14 = 44 ✓). 우측은 이 행의 빈 공간이라 잠식할 대상이 없다.
                  대칭 확장(-inset 11)이면 h2 마지막 3px 이 링크 히트영역에 먹힌다.
              이 수치들은 뷰포트 폭에 의존하지 않는다(앵커 크기·gap 모두 BP 고정값)
              → 시안이 없는 구간(640~1183 / 1440~1919)에도 보간 없이 그대로 성립한다.

              showDetailLinks — 결제 요청 화면(StudentEnrollmentRequest)의 시안에는
              이 링크 자체가 없다(체크박스 카드 목록뿐). 게스트 판매 화면(PricingSelling)
              에서만 true로 켠다. */}
              {showDetailLinks && detailRoute ? (
                <Link
                  to={detailRoute}
                  aria-label={`${service.name} 자세히보기`}
                  className="relative inline-flex shrink-0 items-center text-ink after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] sm:after:-left-2 sm:after:w-11"
                >
                  {/* 390 시안(1882:16307) '자세히보기' = 12px w500 lh17 #7a7a7a.
                  #7a7a7a 는 토큰이 없어 가장 가까운 ink-sub(#808080, 차이 6)로 쓴다
                  — ink(#525252)는 차이 40 으로 훨씬 멀다.
                  rem: 12px = 0.75rem / lh17 = 1.0625rem. ls 는 시안이 주지 않아 넣지 않는다.
                  기존 13px w700 은 시안에 없는 무게였다. 밑줄은 시안 인벤토리에 명시가
                  없어 기존 표현을 유지한다(이번 작업 범위는 타이포·색·간격).
                  셰브론(sm 이상) 색도 시안 본문 기본색 ink(#525252)로 내렸다 — 같은 행의
                  서비스명이 #525252 이고, 시안에 ink-title(#181d24)을 쓰는 근거가 없다. */}
                  <span className="text-[0.75rem] font-medium leading-4.25 text-ink-sub underline underline-offset-2 sm:hidden">
                    자세히보기
                  </span>
                  <ChevronRight
                    size={22}
                    strokeWidth={3}
                    aria-hidden="true"
                    className="hidden sm:block"
                  />
                </Link>
              ) : null}
              {/* susi(위닝 수시예측)는 상세 라우트가 없어 링크를 만들 수 없다(위 상단
              SERVICE_DETAIL_ROUTES 주석 참고). 이때 셰브론만 남기면 sm 이상에서
              '눌러도 아무 일이 없는' 거짓 어포던스가 되므로 아무것도 렌더하지 않는다 —
              390 시안에도 이 서비스의 셰브론은 없고, sm 이상 시안의 셰브론은 상세
              페이지가 있다는 전제의 표기다. 상세 페이지가 생기면
              SERVICE_DETAIL_ROUTES 에 susi 를 추가하는 것만으로 문구(390)와
              셰브론(sm 이상)이 함께 되살아난다. */}
            </div>
            {/* 설명문 — 390 12px w500 lh17 #7a7a7a(→ ink-sub) / 1920 20px w500 lh28 #808080
            (시안 텍스트 3408:4881 이 1240×56 = 2줄 × lh28 로 교차확인).
            rem: 12px = 0.75rem / lh17 = 1.0625rem / 20px = 1.25rem / lh28 = 1.75rem.
            ls 는 시안 인벤토리에 없어 넣지 않는다.
            max-w-[47.5rem](760px) 를 뺀 이유: 시안 설명문 폭은 1240px(컨테이너 1252 의
            거의 전폭)이라 상한이 아니라 전폭이 정본이다. 13px 시절엔 760 상한이 무해했지만
            20px 로 올리면 시안의 2줄이 4줄로 접혀 위계가 깨진다. 우리 콘텐츠 inner 는
            최대 1100px 으로 시안 1240 보다 좁아, 상한을 없애도 시안보다 넓어질 일이 없다.
            390 은 컨테이너 inner 350 이라 760 상한이 애초에 걸리지 않았다 → 무변화.
            `relative` 는 위 '자세히보기' 44×44 오버레이와의 히트테스트 순서용이다
            (위 주석의 390 4px 넘침 항목 참고 — 시각·레이아웃 영향 없음). */}
            {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 반응형 확대 제거. */}
            {service.desc && (
              <p className="relative mb-6 text-[0.75rem] font-medium leading-4.25 text-ink-sub">
                {service.desc}
              </p>
            )}

            {/* 390 시안의 플랜 행 간격은 8px(1882:16346 이하 행 y = 0/72/144/216, 행 높이 64
            → 간격 8px)이라 space-y-2, sm 이상은 기존 space-y-3(12px)을 유지한다. */}
            {/* `relative` 는 설명문 <p> 와 같은 이유(자세히보기 오버레이 히트테스트 순서).
            설명문이 없는 서비스(desc 빈 값)에서는 이 컨테이너가 링크 바로 아래 형제가
            되므로 여기에도 필요하다.
            role="radiogroup" — 플랜은 서비스당 하나만 고를 수 있는데(단일선택) 기존엔
            개별 <button> + 정사각 체크박스 시각이라 "여러 개 고를 수 있다"는 거짓
            어포던스가 있었다(그걸 사후 수습하려고 아래 안내문이 3회 반복돼 있었다).
            <input type=radio> 로 바꾸지 않고 <button role="radio"> 를 쓴 이유:
            이미 이 버튼에 커스텀 hover/selected 배경(border-accent bg-surface-info
            ring-1) 스타일이 붙어 있어 네이티브 radio 로 바꾸면 시각을 100% 숨기고
            커스텀 인디케이터만 보이게 하는 append-only 트릭이 필요해지는데,
            button+role 조합이 시각 변경 없이 동일한 AT 결과(role="radio",
            aria-checked, group 내 posinset/setsize 자동 계산)를 주면서 코드도 더
            적다. group 내 이동은 아래 handleRadioKeyDown 이 화살표 키로 처리한다
            (roving tabindex: 그룹당 tabIndex=0 은 선택된 항목, 없으면 첫 항목뿐이라
            Tab 으로 그룹에 들어오고 나가는 건 각 1번씩이다 — WAI-ARIA APG radiogroup
            패턴). */}
            <div
              role="radiogroup"
              aria-labelledby={`plan-group-label-${service.key}`}
              className="relative space-y-2 sm:space-y-3"
            >
              {service.products.map((product, index) => {
                const isSelected = selected[service.key] === product.id;
                // roving tabindex — 그룹에 선택된 항목이 있으면 그 항목만 tabIndex 0,
                // 없으면(아직 아무것도 고르지 않은 초기 상태) 첫 항목만 0. 나머지는 -1 —
                // 그룹 전체가 Tab 정지점 하나가 되고, 그룹 안 이동은 화살표 키가 맡는다.
                const hasSelectionInGroup = Boolean(selected[service.key]);
                const isRovingTabStop = hasSelectionInGroup
                  ? isSelected
                  : index === 0;
                // 원본(ServiceProduct.listPrice)은 null/undefined 가능(무할인 상품) —
                // Number() 로 좁혀 비교한다(StudentEnrollmentRequest.tsx 옛 구현과 동일 관행).
                const hasDiscount =
                  Number(product.listPrice) > Number(product.price);
                // 390 시안(1882-16307)의 플랜 라벨은 '[1개월]' 처럼 대괄호 구간만이다.
                // 서비스명이 바로 위 헤더에 이미 있어 상품명 전문은 중복이라서다.
                // DB(products.name)는 건드리지 않고 표시 시점에만 파생시킨다. 대괄호가
                // 없는 상품명은 잘라낼 구간이 없으니 전문을 그대로 쓴다.
                const shortLabel = (product.name.match(/^\[[^\]]*\]/) || [
                  product.name,
                ])[0];
                // 390 시안은 '약 11%할인 80,000원' 처럼 한 줄 단일 텍스트다. DB badge
                // ('약 11% 할인')의 '%' 뒤 공백이 시안에 없으므로 표시 시점에만 지운다.
                const compactBadge = product.badge
                  ? product.badge.replace(/%\s+할인/, "%할인")
                  : "";
                // 플랜 행 390 시안 실측(1882:16346 metadata 재확인 — 행 outer
                // Frame 1597883375(1882:16346) = 310×64 / inner Frame 1597883431(1882:16347)
                // = 280×40 at x=15,y=12, gap 20):
                // → 시안 패딩은 전방향 균일이 아니다. 좌우 15(310 − 280 = 30 = 15×2),
                //   상하 12(12 + 40 + 12 = 64). 아래 높이 유도는 상하 12 만 쓴다.
                // → outer 310 은 시안값이고 현행 렌더 폭이 아니다. 전역 컨텐츠 규약
                //   (mx-auto max-w-content px-5)으로 390 의 행 outer 는 350 이다(실측).
                //   310 을 목표값으로 되돌리지 말 것.
                // 시안 행 높이 64 = 12 + 내용 40 + 12 이지만, Figma 의 stroke 는 레이아웃을
                // 먹지 않고 패딩 안쪽에 겹쳐 그려진다. CSS 는 border 가 폭·높이를 차지하므로
                // (auto 높이 = border 2 + 패딩 + 내용) 패딩을 12 로 두면 64 가 아니라 66 이 된다.
                // 그래서 가장자리~내용 거리를 시안 상하값과 같은 12px 로 맞추되 그 12 를
                // border 1 + 패딩 11(0.6875rem) 로 쪼갠다 → 1+11+40+11+1 = 64 ✓.
                // 1행짜리 행(내용 20px)은 1+11+20+11+1 = 44 라 min-h-[4rem](64px, border-box)
                // 가 하한으로 받쳐 64 가 된다. lg 이상은 기존 20px 패딩 유지(lg:p-5 — 전환점을
                // sm 에서 lg 로 옮긴 근거는 아래 ★ 항목).
                // p-* 는 4방향이라 좌우도 12 가 된다(시안 좌우 15 와 3px 차). 행 outer 가
                // 310 → 350 으로 넓어져 좌우 여백은 시안보다 오히려 넉넉하고, 높이 64 를
                // 정확히 맞추는 쪽을 택한 결과다 — 좌우만 15 로 떼어낼 이유가 없다.
                //
                // ★ 플랜 행의 확대 전환점은 `sm`(640) 이 아니라 `lg`(1024) 다.
                // 시안 캔버스는 390(1882:16307)과 1280(1882:15190·1882:15614) 둘뿐이고
                // 640~1023 은 시안이 정의하지 않은 파생 구간이다. 전환점을 sm 에 두면 그 구간의
                // 컨테이너 inner 가 576~960px 뿐인데 라벨이 24px 로 뛰어, 실측 14행 중
                // 640 에서 4행 / 768 에서 1행이 2줄로 접혔다(잘림·가로 스크롤은 없지만 행 높이가
                // 73/101/104px 로 갈려 위계가 들쭉날쭉했다). 그래서 이 행의 확대를 통째로
                // lg 로 옮기고 640~1023 은 390 확정 행을 그대로 쓴다 —
                // 근거 있는 두 값(390 / 1280)만 쓰고 18px 같은 중간 단계는 발명하지 않는다.
                // 함께 옮긴 클래스(이 button 하위 전부, 같은 전환점을 쓰던 항목들):
                //   행 박스 min-h-0 · gap-4 · p-5 / 좌측 그룹 gap-3 / 체크박스 h-6 w-6 +
                //   체크 아이콘 0.9375rem / 라벨 text-[1.5rem] leading-7.75 +
                //   라벨 표현 전환(shortLabel↔상품명 전문) / '추천' 배지 inline-block /
                //   금액 블록 w-auto + leading-7.75 / 정가 취소선 20px w400 lh28 /
                //   금액 한 줄 표현(hidden)↔배지·금액 분리 표현(flex).
                // 라벨만 옮기고 금액을 sm 에 두면 같은 행에서 폭을 나눠 쓰는 두 블록의 크기가
                // 640~1023 에서 어긋나므로 반드시 한 세트로 움직여야 한다.
                // 이 button 밖(서비스명 h2 · 자세히보기/셰브론 · 설명문 · 단일선택 안내 ·
                // 컨테이너 패딩 · 요약바)은 접힘과 무관하고 각자 sm 근거가 따로 있어 손대지 않았다.
                return (
                  // org 한정 상품(products.tenant_id, 2026-09-22 tenants 전환) 카드는 구성 표기 +
                  // 쿠폰 제외 고지를 button 바깥에 별도 문단으로 덧붙인다 — 그래서
                  // 이 map 반환값이 두 형제 노드가 됐고, key는 Fragment가 갖는다
                  // (button 자체의 key는 제거).
                  <Fragment key={product.id}>
                    {/* biome-ignore lint/a11y/useSemanticElements: 아래 주석대로 재클릭 시 선택 해제되는 의도적 비-네이티브 동작이다 — 네이티브 radio input은 클릭으로 해제할 수 없어 이 상품을 "건너뛴다" 표현이 불가능해진다. */}
                    <button
                      type="button"
                      // role="radio" + aria-checked — 위 radiogroup 주석 참고. posinset/setsize
                      // 는 명시하지 않는다: DOM 상 radiogroup의 직계 자식이라 브라우저/AT가
                      // 자동으로 "N개 중 M번째"를 계산한다(가상화·비직계 구조가 아니므로
                      // 수동 지정이 불필요하다).
                      // 클릭으로 선택 해제(toggle)가 되는 건 네이티브 radio 관행과 다르다 —
                      // 여기 각 서비스는 전부 "안 사도 되는" 선택형 상품이라 "이 서비스는
                      // 건너뛴다"를 표현할 방법이 필요했고, 그게 기존부터 있던 재클릭
                      // 해제였다(이번 라운드에서 새로 만든 동작이 아니다). 화살표 키 이동은
                      // 위 handleRadioKeyDown 에서 이동=선택이라 매번 그룹 안 어딘가는
                      // 선택된 상태가 되지만, 클릭/스페이스는 여전히 토글이라 "전부 해제"도
                      // 가능하다 — 의도적 절충이며 aria-checked 는 실제 상태를 그대로
                      // 반영하므로 AT 에 거짓 정보를 주지 않는다.
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isRovingTabStop ? 0 : -1}
                      onClick={() => onToggle(service.key, product.id)}
                      onKeyDown={(e) =>
                        handleRadioKeyDown(
                          e,
                          service.key,
                          service.products,
                          index,
                        )
                      }
                      className={`flex min-h-16 w-full items-center justify-between gap-5 rounded-2xl border p-2.75 text-left transition lg:min-h-0 lg:gap-4 lg:p-5 ${
                        isSelected
                          ? "border-accent bg-surface-info ring-1 ring-accent/30"
                          : "border-line bg-white hover:border-ink-sub"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2 lg:gap-3">
                        {/* 인디케이터 — 정사각 체크박스(rounded-md + 흰 체크 글리프)가 아니라
                      원형 라디오(rounded-full + 내부 dot)다. 시각도 role="radio" 의미론과
                      맞춘 것이다 — 체크박스 모양은 "여러 개 고를 수 있다"는 낡은
                      어포던스를 남기고, role/aria 만 바꾸면 마우스 사용자는 여전히
                      체크박스로 본다.
                      박스 크기(390 16px / lg 24px)와 그 근거는 그대로다 — 아래 크기
                      산식은 outer 박스 치수에 대한 것이라 원형으로 바꿔도 무효화되지
                      않는다(rounded-md → rounded-full 은 폭/높이에 영향이 없다):
                      390 좌측 그룹 예산 = 행 inner 폭 − 좌↔우 gap 20 − 금액블록 126.
                      전역 컨텐츠 규약(px-5)에서 390 컨테이너 inner = 350 이므로
                      행 inner = 350 − border 1×2(2) − 패딩 11×2(22) = 326
                      (border 를 빼는 이유: src/index.css:5 의 * { box-sizing: border-box }
                       때문에 행의 350px 안에 테두리 2px 이 포함된다.)
                      → 좌측 그룹 326 − 20 − 126 = 180px, 라벨 몫은 180 − 인디케이터 16
                      − gap 8 = 156px 로 실측 최장 '[12개월 30회 이용권]' 112.8px 을
                      넉넉히 덮는다(과거 px-10 시절 inner 310 에서는 라벨 몫이 116px
                      뿐이라 인디케이터를 16px 로 줄이는 것이 폭 제약이기도 했다.
                      규약 전환으로 그 제약은 사라졌고, 16px 은 이제 순수하게 390 시안
                      실측 근거로만 남는다). 인디케이터를 키우면 이 예산이 준다.
                      내부 dot 은 체크 글리프와 달리 "박스 테두리를 덮지 않게" 맞출
                      이유가 없다(글리프처럼 모서리가 있는 형태가 아니라 원 안의 원이라
                      여백이 나면 오히려 정상 라디오 모양이다) — outer 대비 50%
                      비율(8/16, 12/24)로 두 밴드 동일 비율을 유지했다. */}
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition lg:h-6 lg:w-6 ${
                            isSelected
                              ? "border-accent bg-white"
                              : "border-line bg-white"
                          }`}
                        >
                          {isSelected && (
                            <span className="h-2 w-2 rounded-full bg-accent lg:h-3 lg:w-3" />
                          )}
                        </span>
                        {/* 1023 이하는 대괄호 구간만(shortLabel), lg 이상은 상품명 전문
                      (1920 시안 1882-10810 / 1280 시안 1882-15190).
                      한국어 상품명이 어절 중간에서 끊기지 않도록 truncate 대신 break-keep.
                      390 타이포는 시안 실측(1882:16307 라벨 TEXT 110×20)대로
                      13px(0.8125rem) / lh 20px(1.25rem) / weight 500 이다. 15px 이면
                      '[12개월 30회 이용권]' 이 110px 을 넘어 2줄로 접혔다.
                      lg 이상은 시안(1280 = 1882:15190 / 1920 = 3408:4832) 실측
                      24px w500 lh31 #525252 ls-0.48 다(rem: 24px = 1.5rem / lh31 = 1.9375rem).
                      전환점이 sm 이 아니라 lg 인 이유는 위 button 주석의 ★ 항목 참고 —
                      shortLabel↔전문 전환도 라벨 크기와 한 세트라 같이 옮겼다. 전환점만
                      옮기고 표현을 sm 에 남기면 640~1023 이 '13px + 상품명 전문' 이라는
                      어느 시안에도 없는 제3의 상태가 된다(390 은 13px+shortLabel,
                      1280 은 24px+전문). shortLabel 의 근거(서비스명이 바로 위 h2 에 이미
                      있어 전문은 중복)는 폭에 의존하지 않으므로 1023 까지 그대로 성립한다.
                      ls 는 양쪽 밴드 모두 -0.02em(390 -0.26/13, 1280·1920 -0.48/24) →
                      단일 클래스. 390 은 ls 가 붙어 글자폭이 오히려 줄어드므로 확정
                      예산(라벨 몫 156px, 최장 라벨 112.8px)에 여유가 더 생긴다.
                      색은 양쪽 시안 모두 #525252 = ink 다(기존 ink-title 은 근거 없음). */}
                        {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 반응형
                      확대만 제거하고, shortLabel↔전문 전환(lg:hidden/hidden lg:inline)
                      은 폭 절약이 아니라 "서비스명 중복 회피"가 목적이라 그대로 둔다. */}
                        {/* QA 행238 — 13px가 작다는 지적으로 14px로 올린다. 라벨 몫 예산
                      156px 대비 최장 라벨이 13px에서 112.8px(여유 43px)이라 14px로
                      올려도(≈121.5px) 예산 안에 그대로 들어간다. */}
                        <span className="break-keep text-[0.875rem] font-medium leading-5 tracking-[-0.02em] text-ink">
                          <span className="lg:hidden">{shortLabel}</span>
                          <span className="hidden lg:inline">
                            {product.name}
                          </span>
                        </span>
                        {/* '추천' 배지는 1280·1920 시안에만 있고 390 시안(1882-16307, 1882-16017)
                      에는 0건이라 1023 이하에서 숨긴다(노출 전환점도 라벨과 한 세트로
                      sm → lg 로 옮겼다 — 배지 타이포는 BP 고정 16px 이라 13px 라벨 옆에
                      남겨 두면 배지가 라벨보다 큰 위계 역전이 생기고, 390 확정 표현에는
                      애초에 배지가 없다). 배지 개수는 BP 별로 다르다 —
                      1920 은 1882-10810 이 2건, 3408-4832 가 3건이고 1280(1882-15190,
                      1882-15614)은 3건이다. 어느 상품에 붙는지는 시안이 아니라 DB
                      (products.recommended)가 정본이라 개수 차이는 코드에 반영하지 않는다. */}
                        {/* 배지 타이포는 시안 인벤토리대로 16px w500 #ffffff
                      (rem: 16px = 1rem). 기존 11px w700 은 시안에 없는 값이다.
                      base 값은 부모가 hidden lg:inline-block 이라 렌더되지 않는다.
                      (참고: 시안 텍스트 3408:4945 의 폭 28px 은 CJK 2자 × 14px 에 더
                      가까워 14px 일 여지가 있으나, 같은 프레임의 텍스트 노드들이
                      고정 크기로 리사이즈돼 있어 폭/높이로는 판정이 불가하다 →
                      REST 스타일 실측인 인벤토리 값 16px 을 따른다.) */}
                        {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 16px → 12px. */}
                        {product.recommended && (
                          <span className="hidden shrink-0 rounded-md bg-accent px-2 py-0.5 text-[0.75rem] font-medium text-white lg:inline-block">
                            추천
                          </span>
                        )}
                      </span>

                      {/* 금액 블록 폭(126px 고정 + shrink-0, lg 이상 w-auto)은 레이아웃
                    기하라 유지한다 — 아래 lg 전용 배지·판매가가 MyPage 수준(0.8125rem)
                    으로 줄면서 더는 큰 글자를 위한 여유 lh(1.9375rem)가 필요 없어져
                    lg:leading-7.75 는 제거했다(MyPage 수준 통일, 사용자 확정
                    2026-08-19, 7f072f45). */}
                      <span className="flex w-31.5 shrink-0 flex-col items-end leading-5 lg:w-auto">
                        {/* 정가 취소선 — 390 12px w500 lh20 #d7d7d7 ls-0.24 /
                      1920 20px w400 lh28 #d9d9d9 ls-0.4.
                      #d9d9d9 는 토큰이 없어 가장 가까운 line(#d7d7d7, 차이 2)로 쓴다 —
                      390 시안이 이미 정확히 #d7d7d7 이라 두 밴드가 한 토큰으로 수렴한다.
                      390 lh20 은 부모의 leading-5 상속으로 이미 맞다.
                      rem: 12px = 0.75rem / 20px = 1.25rem / lh28 = 1.75rem.
                      ls 는 양쪽 -0.02em(-0.24/12, -0.4/20).
                      기존 12px w400 #808080(ink-sub) 은 취소선인데도 본문 보조색과 같아
                      '비활성' 위계가 드러나지 않았다. */}
                        {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 반응형 확대 제거,
                      7f072f45의 취소선 span과 동일 위계. */}
                        {hasDiscount && (
                          <span className="text-[0.75rem] font-medium tracking-[-0.02em] text-line line-through">
                            {formatKRW(product.listPrice)}
                          </span>
                        )}
                        {/* 1023 이하(390 확정 표현): 할인 라벨과 금액이 한 줄 단일 텍스트
                      ('약 11%할인 80,000원').
                      lg 이상: 시안(1920 = 1882-10810 / 1280 = 1882-15190)대로 라벨(blue)과
                      금액을 두 요소로 분리. 전환점 이동 근거는 위 button 주석 ★ 항목. */}
                        {/* 390 금액 블록 폭이 시안대로 126px 이라 이 한 줄이 126px 안에 들어가야
                      한다. 최장 문구 '40%할인 180,000원' 실측 폭은 15px 에서 141.5px 로
                      126 을 넘어 2줄이 됐다(행 높이 86px). 13px 이면 141.5×13/15 ≈ 122.6px
                      로 1줄이며, 라벨과 같은 13px 이라 390 타이포 단계도 일관된다.
                      14px 은 141.5×14/15 ≈ 132px 로 여전히 초과.
                      이 span 자체가 lg:hidden(1023 이하 전용)이고, lg 값은 아래 lg:flex
                      블록이 따로 정한다. */}
                        {/* 390 확정 타이포(13px/lh20/w500 #525252 ls-0.26)를 그대로 쓴다.
                      기존 w900 → w500, ink-title → ink 로만 내렸다. 무게가 줄고 ls 가
                      음수라 최장 문구('40%할인 180,000원') 폭은 기존 122.6px 보다 더
                      줄어들어 126px 예산이 깨질 위험이 없다. */}
                        {/* QA 행238 — 라벨(위 span)은 14px로 올렸지만 이 span은 13px을
                      유지한다. 바로 위 주석의 126px 예산 계산(14px면 최장 문구가
                      ≈132px로 넘침)이 그대로 걸리는 유일한 span이라, 여기만 올리면
                      2줄로 접혀 행 높이가 깨진다. */}
                        <span className="text-[0.8125rem] font-medium tracking-[-0.02em] text-ink lg:hidden">
                          {compactBadge
                            ? `${compactBadge} ${formatKRW(product.price)}`
                            : formatKRW(product.price)}
                        </span>
                        {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — lg 전용
                      배지・판매가를 390 한 줄 표현과 같은 위계로 내렸다. 기존 24px는
                      7f072f45 폐기 이전 확대 규약의 잔존값이었다.
                      QA 행238 — lg 컬럼은 폭 제약(w-31.5)이 없는 auto 폭이라(위 button
                      주석 참고) 라벨과 함께 14px로 올려도 줄바꿈 위험이 없다. */}
                        <span className="hidden items-center gap-2 lg:flex">
                          {product.badge && (
                            <span className="text-[0.875rem] font-medium tracking-[-0.02em] text-primary">
                              {product.badge}
                            </span>
                          )}
                          <span className="text-[0.875rem] font-medium tracking-[-0.02em] text-ink">
                            {formatKRW(product.price)}
                          </span>
                        </span>
                      </span>
                    </button>
                    {/* org 한정 상품(부산캠퍼스 특가 등) 구성 표기 — bundle_items를
                  조회하는 useBundleCompositionMap(위 컴포넌트 최상위 호출)이
                  만든 "라벨 N회권" 라인을 ' + '로 이어 붙인다(사용자 확정 카피,
                  2026-09-01). 쿠폰 제외 고지는 이 상품군에 공통인 고정 문구다. */}
                    {product.tenantId && (
                      <p className="-mt-1 mb-1 break-keep text-[0.75rem] font-medium leading-4.25 text-ink-sub">
                        구성:{" "}
                        {(bundleCompositionMap.get(product.id) ?? []).join(
                          " + ",
                        )}
                        <span className="ml-1 text-error">
                          쿠폰 적용 대상이 아닙니다.
                        </span>
                      </p>
                    )}
                  </Fragment>
                );
              })}
            </div>

            {/* 단일선택 안내 — 390 12px w500 lh17 #525252(ls 없음) /
            1920 18px w500 lh25 #525252 ls-0.36(= -0.02em)
            (시안 텍스트 3408:4956 이 1209×25 로 lh25 교차확인).
            rem: 12px = 0.75rem / lh17 = 1.0625rem / 18px = 1.125rem / lh25 = 1.5625rem.
            ls 는 1920 만 준다 — 390 시안에는 없다.
            색은 ink(#525252). 기존 12px w400 ink-sub(#808080) 는 시안보다 흐렸다.
            문구 자체는 radiogroup 전환 후에도 완전히 없애지 않았다 — 근거는
            src/data/pricingCatalog.js 의 SINGLE_SELECT_NOTICE 주석 참고(마우스만
            쓰는 사용자에겐 원형 인디케이터만으로 "단일선택"이 자명하지 않다).
            중복(같은 말 2번)만 제거했고 문장은 1개로 줄었다.
            조건 service.products.length > 1 은 이번에 손대지 않았다 — 학습진단처럼
            플랜이 1개뿐인 서비스는 애초에 고를 대상이 하나뿐이라 "선택 규칙"
            자체가 성립하지 않고, 그래서 이 조건 하나로 서비스 블록 전부가
            일관되게 처리된다(학습진단만 안내문이 없는 건 예외 분기가 아니라 이
            조건의 자연스러운 결과다 — 별도 정리가 필요한 비일관성이 아니다). */}
            {/* MyPage 수준 통일, 사용자 확정 2026-08-19(7f072f45) — 반응형 확대 제거. */}
            {planNotice && service.products.length > 1 && (
              <p className="mt-4 text-[0.75rem] font-medium leading-4.25 text-ink">
                {planNotice}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
