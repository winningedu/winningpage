import { useId } from "react";
import { Button } from "@/components/ui/button";
import { formatKRW } from "@/data/pricingCatalog";
import type { AddonProduct } from "@/lib/products";

// row23 추가 이용권 섹션. 이용권 보유 판정은 부모(StudentEnrollmentRequest)가
// 하고, 보유한 서비스의 addon 만 넘긴다. 단가는 products.price 에서만 읽는다.
const MAX_QUANTITY = 10;

interface Props {
  addons: AddonProduct[];
  quantities: Record<string, number>;
  onChange: (productId: string, quantity: number) => void;
}

export default function AddonSection({ addons, quantities, onChange }: Props) {
  const titleId = useId();
  const rows = addons.filter((a) => typeof a.price === "number");
  const first = rows[0];
  if (!first) return null;
  // 서비스별 단가가 모두 같으면 제목에 한 번만, 다르면 행마다 보인다.
  const samePrice = rows.every((a) => a.price === first.price);

  return (
    <section aria-labelledby={titleId} className="mt-10">
      <h2 id={titleId} className="text-[1.125rem] font-semibold text-ink">
        서비스 이용고객 중 이용권 추가
        {samePrice && ` (1회당 할인가 ${formatKRW(first.price)})`}
      </h2>
      <p className="mt-1 text-[0.875rem] text-ink-sub">
        남은 횟수가 있어도 미리 추가할 수 있어요.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.map((addon) => {
          const quantity = quantities[addon.id] ?? 0;
          const price = addon.price ?? 0;
          return (
            <li
              key={addon.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5"
            >
              <div className="min-w-0">
                <p className="text-[0.8125rem] text-ink-sub">
                  {addon.serviceName}
                </p>
                <p className="text-[1rem] font-semibold text-ink">
                  {addon.name}
                </p>
                {!samePrice && (
                  <p className="text-[0.8125rem] text-ink-sub">
                    {`1회당 할인가 ${formatKRW(price)}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`${addon.serviceName} 추가 수량 줄이기`}
                    disabled={quantity <= 0}
                    onClick={() => onChange(addon.id, quantity - 1)}
                  >
                    -
                  </Button>
                  <span className="w-6 text-center text-[1rem] font-medium text-ink">
                    {quantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`${addon.serviceName} 추가 수량 늘리기`}
                    disabled={quantity >= MAX_QUANTITY}
                    onClick={() => onChange(addon.id, quantity + 1)}
                  >
                    +
                  </Button>
                </div>
                <span className="w-20 text-right text-[1rem] font-semibold text-ink">
                  {quantity > 0 ? formatKRW(price * quantity) : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
