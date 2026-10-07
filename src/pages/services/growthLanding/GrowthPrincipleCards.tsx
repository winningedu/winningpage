import {
  CARD_DESC_CLASS,
  CARD_TITLE_CLASS,
} from "@/components/services/serviceTokens";

// 근거 없이 판정하지 않는 원칙 3장(시안 754:71631). ServiceProcessCards 를 복제해 3열,
// "원칙 N" 라벨, 흰색에서 연한 파랑으로 내려가는 카드 배경을 적용했다. 공용 조각은 병렬
// 세션 충돌을 피하려고 고치지 않는다.

export type GrowthPrincipleItem = { title: string; desc: string };

export default function GrowthPrincipleCards({
  items,
}: {
  items: GrowthPrincipleItem[];
}) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:mt-17.25 lg:grid-cols-3 lg:gap-7.5">
      {items.map((item, index) => (
        <div
          key={item.title}
          className="flex flex-col items-center justify-center gap-3.75 rounded-perf-modal bg-linear-to-b from-white to-[#DCEBFF] px-6 py-8 text-center shadow-[0_0.5rem_1.25rem_rgba(1,50,98,0.08)]"
        >
          <div className="flex flex-col items-center gap-0.75">
            <span className="text-[1rem] font-semibold leading-[1.4] text-primary">
              {`원칙 ${index + 1}`}
            </span>
            <p className={CARD_TITLE_CLASS}>{item.title}</p>
          </div>
          <p className={CARD_DESC_CLASS}>{item.desc}</p>
        </div>
      ))}
    </div>
  );
}
