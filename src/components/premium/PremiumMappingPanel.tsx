import type { ReactNode } from "react";

// 활동 매핑 패널 - 국제학교에서 하는 활동이 국내대학 제출용 생활기록부의 어느 항목으로
// 옮겨지는지 두 열 표로 보여 준다. 화살표 기호 대신 열 머리글로 방향을 설명한다.
// 헤딩은 페이지가 감싼다. rows 가 비어 있으면 렌더하지 않는다.
type MappingRow = { from: string; to: string };

type PremiumMappingPanelProps = {
  title: string;
  fromLabel: string;
  toLabel: string;
  rows: MappingRow[];
  footer: ReactNode;
};

export default function PremiumMappingPanel({
  title,
  fromLabel,
  toLabel,
  rows,
  footer,
}: PremiumMappingPanelProps) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="border border-line bg-white px-6 py-7 sm:px-8">
      <p className="break-keep text-[0.875rem] font-semibold uppercase leading-[1.4] tracking-[0.08em] text-gold">
        {title}
      </p>
      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th
              scope="col"
              className="w-1/2 break-keep py-3 pr-3 text-[0.8125rem] font-medium leading-[1.4] text-ink-natural"
            >
              {fromLabel}
            </th>
            <th
              scope="col"
              className="w-1/2 break-keep py-3 pl-3 text-[0.8125rem] font-medium leading-[1.4] text-ink-natural"
            >
              {toLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.from} className="border-b border-line last:border-b-0">
              <td className="break-keep py-4 pr-3 text-[0.9375rem] font-medium leading-[1.5] text-ink-strong">
                {row.from}
              </td>
              <td className="break-keep py-4 pl-3 text-[0.9375rem] font-semibold leading-[1.5] text-primary">
                {row.to}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-5 break-keep border-t border-line pt-5 text-[1rem] font-semibold leading-[1.5] text-ink-strong">
        {footer}
      </p>
    </div>
  );
}
