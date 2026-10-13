// 설계와 실행 두 축을 중앙 배지로 묶는 컨설팅 구성도. 겹친 원 그림 대신 카드 두 장과
// 중앙 배지로 구성해 모바일에서 깨지지 않고, 스크린리더가 제목과 목록으로 읽는다.
// 이미지 역할(role="img")은 쓰지 않는다. 각 축의 제목은 h3 이므로 페이지 섹션 h2 아래에 둔다.
type VennSide = {
  eyebrow: string;
  title: string;
  items: string[];
};

type PremiumVennDuoProps = {
  left: VennSide;
  right: VennSide;
  center: string;
};

function VennCard({ side }: { side: VennSide }) {
  return (
    <div className="flex-1 border border-line bg-white px-6 py-7 sm:px-8">
      <h3 className="break-keep text-[1.25rem] font-semibold leading-[1.4] text-ink-strong">
        <span className="block text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-gold">
          {side.eyebrow}
        </span>
        {side.title}
      </h3>
      <ul className="mt-4 flex flex-col gap-3">
        {side.items.map((item) => (
          <li
            key={item}
            className="relative break-keep pl-4 text-[0.9375rem] leading-[1.6] text-ink before:absolute before:left-0 before:top-[0.6em] before:h-[0.3125rem] before:w-[0.3125rem] before:rounded-full before:bg-gold"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PremiumVennDuo({
  left,
  right,
  center,
}: PremiumVennDuoProps) {
  return (
    <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:gap-0">
      <VennCard side={left} />
      <p className="z-10 mx-auto -my-1 shrink-0 break-keep rounded-full bg-primary px-6 py-4 text-center text-[0.9375rem] font-semibold leading-[1.3] tracking-[0.04em] text-white lg:-mx-6 lg:my-0">
        {center}
      </p>
      <VennCard side={right} />
    </div>
  );
}
