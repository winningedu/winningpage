import { useMemo } from "react";
import { isPremiumLink } from "@/components/premium/premiumRoutesPaths";
import { site } from "@/config/site";
import ServiceCard, { type Service } from "./services/ServiceCard";

type ServicesSectionProps = {
  services?: Service[];
};

/**
 * 핵심 서비스 섹션 (명세 3.3, Figma 4885:18474)
 * - 아이브로우(accent) + 2줄 2톤 대제목(1행 #525252, 2행 #013262) + 3열×3행 카드 그리드
 * - 카드 자체(텍스트/일러스트 조립, 링크 해석)는 services/ServiceCard 에 위임한다.
 * - 노출 개수는 DB(program_categories 활성 행)가 정한다 — 6개 상한(0729 시안의 3×2 그리드
 *   기준)은 QA 2026-08-25 로 제거했다. 7개 이상이면 3열 그리드가 자연히 다음 행으로 흘러간다.
 * - 프리미엄을 숨기는 사이트(site.features.premium=false, 스쿨멘토)는 is_premium 카드와
 *   프리미엄 경로로 가는 카드를 렌더 단계에서 거른다(카드는 DB에서 오므로 데이터로는 못 막는다).
 */
export default function ServicesSection({
  services = [],
}: ServicesSectionProps) {
  const visibleServices = useMemo(
    () =>
      services
        .filter(
          (service) =>
            site.features.premium ||
            !(service.is_premium || isPremiumLink(service.link)),
        )
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [services],
  );

  if (visibleServices.length === 0) return null;

  return (
    <section aria-label="핵심 서비스" className="bg-white">
      {/* 섹션 상하 여백 — pt: 합격선배→서비스 갭 100px(6.25rem, lg), pb: 0(lg, 다음 섹션이 여백 담당) */}
      <div className="mx-auto w-full max-w-content px-5 pb-10 pt-10 sm:px-8 lg:pb-0 lg:pt-25">
        {/* 헤더 — 0729 시안 실측(px÷16=rem): 아이브로우 20px(1.25rem, accent, Regular),
            대제목 32px(2rem, lg). 대제목 자간 -0.04rem은 lg 폰트 2rem 기준 -0.02em과 동일 비율 */}
        <p className="text-[1.25rem] font-normal leading-[1.3] text-accent">
          핵심 서비스
        </p>
        {/* 대제목 2톤 — 시안: 1행 #525252, 2행 #013262. 모바일/sm은 lg 축소 비율(32/36.64≈0.8734)로 비례 축소 */}
        <h2 className="mt-1.5 text-[1.53rem] font-semibold leading-[1.4] tracking-[-0.04rem] sm:text-[1.97rem] lg:text-[2rem]">
          <span className="block text-ink">진학의 순간들을</span>
          <span className="block text-primary">
            막막하지 않도록. 필요한 만큼만.
          </span>
        </h2>

        {/* 3열×3행 카드 그리드(9카드 기본, 모바일+태블릿 1열 → lg 3열, Figma 4885:18474와 동일)
            — md(768px)에서 2열로 전환하면 카드 폭이 좁아져 설명 줄바꿈이 깨진다(태블릿 실측).
            768~1023 구간은 1열로 유지해 모바일과 같은 넉넉한 카드 폭(텍스트 공간)을 확보한다.
            lg 3열: col gap 20px(1.25rem) / row gap 24px(1.5rem), 카드 352×180(그리드가 열 폭을
            자동 산출 — max-w-content(1164px) − px-8(2rem)×2 = 1100px, (1100−2×20)/3≈352px). */}
        <ul className="mt-10 grid grid-cols-1 justify-items-center gap-6 lg:mt-9.75 lg:grid-cols-3 lg:justify-items-stretch lg:gap-x-5 lg:gap-y-6">
          {visibleServices.map((service) => (
            <li
              key={service.id}
              // @container — services/ServiceCard·ServiceCardText·ServiceIllustration의
              // 카드 폭 기준 컨테이너 쿼리(@[21rem]:, cqw) 기준점. 카드 자체(패딩 있음)가
              // 아니라 패딩 없는 이 li에 걸어야 cqw가 카드 전체 폭(패딩 포함) 기준으로
              // 잡힌다(2026-09-03 실측 — 카드에 걸면 콘텐츠 박스만큼 좁게 잡혀 이미지가
              // 의도보다 작아졌다).
              className="w-full max-w-[28.0938rem] @container lg:max-w-none"
            >
              <ServiceCard service={service} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
