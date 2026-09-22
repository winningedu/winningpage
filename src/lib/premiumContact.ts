import { site } from "@/config/site";

// PremiumCtaBanner의 "전화 상담" 보조 버튼(secondaryCta)을 site.company.centerTel
// 하나에서 만든다 — 4개 프리미엄 페이지(특목고입학·해외대학·대학원입학·재외국민)에
// 흩어져 있던 하드코딩("051.902.0080"/"tel:0519020080")을 여기 한 곳으로 모은다.
// centerTel이 없으면(스쿨멘토) undefined를 돌려주고, 호출부는 그 값을 그대로
// secondaryCta에 넘긴다 — PremiumCtaBanner가 없으면 보조 버튼 자체를 렌더하지
// 않는다(값 없으면 렌더 안 함).
export function buildPhoneSecondaryCta():
  | { label: string; href: string }
  | undefined {
  const { centerTel } = site.company;
  if (!centerTel) return undefined;

  return {
    label: `전화 상담 ${centerTel.replaceAll("-", ".")}`,
    href: `tel:${centerTel.replaceAll("-", "")}`,
  };
}
