import { Fragment, useState } from "react";
import {
  CARD_DESC_MUTED_CLASS,
  CARD_TITLE_CLASS,
} from "@/components/services/serviceTokens";
import { ScrollArea } from "@/components/ui/scroll-area";

// 성장설계 단계 탭(시안 754:71627, 변형 754:71642~71645).
// ServiceTabsPanel 을 복제하고 카드에 "예시" 행을 더했다. 공용 조각은 병렬 세션 충돌을
// 피하려고 고치지 않는다. 탭은 5개, 카드는 탭마다 3장, 3열 고정이다.
// example 이 null 이면 예시 행 자체를 렌더하지 않는다.

export type GrowthTabCard = {
  title: string;
  desc: string;
  icon: string;
  example: string | null;
};

type GrowthStepTabsProps = {
  tabs: string[];
  content: Record<string, GrowthTabCard[]>;
  ariaLabel?: string;
  idPrefix: string;
};

export default function GrowthStepTabs({
  tabs,
  content,
  ariaLabel,
  idPrefix,
}: GrowthStepTabsProps) {
  const [activeTab, setActiveTab] = useState(
    () => tabs.find((tab) => content[tab]?.length) ?? tabs[0]!,
  );
  const activeCards = content[activeTab] || [];

  return (
    <>
      <ScrollArea axis="x" className="mt-8 sm:mt-10 lg:mt-11.5">
        <div
          role="tablist"
          aria-label={ariaLabel}
          className="flex w-max items-center gap-5 lg:gap-7.5"
        >
          {tabs.map((tab, index) => {
            const isDisabled = !content[tab]?.length;
            const isActive = tab === activeTab;
            return (
              <Fragment key={tab}>
                <button
                  type="button"
                  role="tab"
                  id={`${idPrefix}-tab-${index}`}
                  disabled={isDisabled}
                  aria-disabled={isDisabled || undefined}
                  aria-selected={isActive}
                  aria-controls={`${idPrefix}-tabpanel`}
                  onClick={() => !isDisabled && setActiveTab(tab)}
                  className={`shrink-0 whitespace-nowrap text-[1.125rem] leading-[1.4] ${
                    isActive
                      ? "font-semibold text-ink"
                      : "font-medium text-[#A3A3A3]"
                  } ${isDisabled ? "cursor-default" : ""}`}
                >
                  {tab}
                </button>
                {index < tabs.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="h-4 w-px shrink-0 bg-line"
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </ScrollArea>

      <div
        id={`${idPrefix}-tabpanel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tabs.indexOf(activeTab)}`}
        className="mt-8 grid grid-cols-1 items-start gap-5 sm:mt-10 sm:grid-cols-3 lg:mt-7.5 lg:gap-7.5"
      >
        {activeCards.map((card) => (
          <div
            key={`${activeTab}-${card.title}`}
            className="flex flex-col text-left"
          >
            <div className="flex aspect-453/200 items-center justify-center rounded-[0.5625rem] border border-line bg-surface-footer">
              <img
                src={card.icon}
                alt=""
                aria-hidden="true"
                className="h-27.5 w-27.5 object-contain"
              />
            </div>
            <p className={`mt-4 ${CARD_TITLE_CLASS}`}>{card.title}</p>
            <p className={`mt-3.75 ${CARD_DESC_MUTED_CLASS}`}>{card.desc}</p>
            {card.example !== null && (
              <div className="mt-4 border-l-[0.1875rem] border-primary bg-[#EEF4FF] px-4 py-3">
                <span className="text-[0.875rem] font-semibold leading-[1.5] text-primary">
                  예시
                </span>
                <p className="mt-1 break-keep text-[0.875rem] leading-[1.5] text-ink">
                  {card.example}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
