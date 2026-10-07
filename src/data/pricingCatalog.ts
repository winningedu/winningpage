// 가격 표시 유틸 (가격 데이터 없음)
// ------------------------------------------------------------------
// 이 파일에는 상품/가격/쿠폰 데이터가 없다. 가격의 유일한 신뢰 소스는
// Supabase `products`(상품/가격) · `coupons`(쿠폰) 테이블이며, 서버
// (api/create-order)가 DB 가격으로 결제 금액을 재계산한다.
// 프론트에서 상품/가격을 조회하려면 src/lib/products.js(fetchProducts,
// useProducts)를 사용할 것 — 이 파일에 폴백 데이터를 되살리지 말 것.

// 단일 선택 안내 문구 (플랜이 2개 이상인 서비스 하단)
// 기존엔 같은 말("동시 선택 불가" / "하나만 선택 가능")을 두 문장으로 반복했다 —
// 컨트롤이 정사각 체크박스라 규칙을 컨트롤이 못 전달해서 문구가 그걸 사후 수습하고
// 있었기 때문이다(src/pages/Pricing.jsx 플랜 목록 radiogroup 전환 주석 참고).
// role="radio" 로 바꾼 지금은 스크린리더가 "라디오 버튼"이라 읽어 규칙을 이미
// 전달하므로 반복은 걷어냈지만, 문구 자체는 완전히 지우지 않았다 — 마우스만 쓰는
// 사용자는 aria 속성을 듣지 못하고, 원형 인디케이터만으로 "단일선택"이 자명하다고
// 단정하기엔 이 페이지 이전 상태(정사각 체크박스)가 바로 그 자명함이 깨졌던 사례다.
export const SINGLE_SELECT_NOTICE =
  "한 서비스 내에서는 하나의 플랜만 선택할 수 있어요";

// 서비스별 추가 안내문(키 = products.service_key) — ServiceCatalog serviceNotices 로
// 넘긴다. 콜멘토는 고객사 가격표(2026-10-07)에 따라 2026년 말부터 제공 예정이라
// 카탈로그에는 보이되 선택·결제는 막는다(products.is_orderable=false).
export const SERVICE_NOTICES: Record<string, string> = {
  mentor: "위닝 콜멘토 서비스는 2026년 말부터 제공될 예정입니다.",
};

export function formatKRW(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}
