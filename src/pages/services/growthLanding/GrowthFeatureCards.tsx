import {
  CARD_DESC_MUTED_CLASS,
  CARD_TITLE_CLASS,
} from "@/components/services/serviceTokens";

// 학년별 다섯 갈래 카드(시안 754:71629). ServiceStepCards 를 복제하고 부제(subtitle)를
// 더했다. 공용 조각은 병렬 세션 충돌을 피하려고 고치지 않는다. 3장 + 2장(중앙)으로 나눈다.

export type GrowthFeatureItem = {
  title: string;
  subtitle: string;
  desc: string;
};

const FEATURE_CARD_CLASS = "rounded-xl bg-surface-footer px-6 pb-7.5 pt-8.5";

function FeatureCard({ item }: { item: GrowthFeatureItem }) {
  return (
    <div className={FEATURE_CARD_CLASS}>
      <p className={CARD_TITLE_CLASS}>{item.title}</p>
      <p className="mt-1 break-keep text-[1rem] font-semibold leading-[1.4] text-primary">
        {item.subtitle}
      </p>
      <p className={`mt-3.75 ${CARD_DESC_MUTED_CLASS}`}>{item.desc}</p>
    </div>
  );
}

export default function GrowthFeatureCards({
  items,
}: {
  items: GrowthFeatureItem[];
}) {
  const firstRow = items.slice(0, 3);
  const secondRow = items.slice(3);

  return (
    <>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-perf-inset lg:grid-cols-3 lg:gap-7.5">
        {firstRow.map((item) => (
          <FeatureCard key={item.title} item={item} />
        ))}
      </div>
      {secondRow.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mx-auto lg:mt-7.5 lg:max-w-181 lg:gap-7.5">
          {secondRow.map((item) => (
            <FeatureCard key={item.title} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
