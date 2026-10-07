// 성장설계로 정리되는 것들(시안 754:71630). ServiceOutcomesPanel 을 복제하고 라벨 아래
// 보조 문구(sub)를 더했다. 공용 조각은 병렬 세션 충돌을 피하려고 고치지 않는다.
// 4장 고정이다.

export type GrowthOutcomeItem = { label: string; sub: string; icon: string };

export default function GrowthOutcomesPanel({
  items,
}: {
  items: GrowthOutcomeItem[];
}) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-6 rounded-xl border border-line bg-surface-footer px-6 py-5.5 sm:mt-10 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-line sm:px-4 lg:mt-perf-inset">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-3.5 px-4 py-2 text-center"
        >
          <img
            src={item.icon}
            alt=""
            aria-hidden="true"
            className="h-12 w-12 sm:h-19 sm:w-19"
          />
          <div>
            <p className="break-keep text-[1.125rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink">
              {item.label}
            </p>
            <p className="mt-1 break-keep text-[0.875rem] font-medium leading-[1.4] text-[#767676]">
              {item.sub}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
