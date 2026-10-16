import { useId } from "react";
import { Link } from "react-router";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import type { HandoffView } from "@/lib/inquiry/types";
import { growthBannerView } from "./infoLogic";

type GrowthBannerProps = {
  handoff: HandoffView | null;
  selectedPlanItemId: string | null;
  disabled: boolean;
  onSelectPlanItem: (id: string | null) => void;
};

// 성장설계 연동 배너(No.107~109)와 과제 후보 선택. 연동 값이 없으면 아무것도 그리지 않는다.
// 오래된 리포트는 안내와 성장설계로 가는 링크만 둔다(심화탐구가 재발행을 시킬 수 없다).
export default function GrowthBanner({
  handoff,
  selectedPlanItemId,
  disabled,
  onSelectPlanItem,
}: GrowthBannerProps) {
  const groupId = useId();
  const view = growthBannerView(handoff);
  if (!handoff || !view) return null;

  const showLink = view.notices.length > 0;

  return (
    <section
      aria-label="성장설계 연동"
      className="rounded-xl bg-ink-strong px-6 py-5 text-white"
    >
      {view.issuedLabel && (
        <p className="text-app-caption text-white/80">
          위닝 성장설계 리포트 {view.issuedLabel}에서 불러왔어요
        </p>
      )}
      {view.theme && (
        <p className="mt-1 text-app-card-title font-bold">{view.theme}</p>
      )}
      {(view.stageLabel || view.chips.length > 0) && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {view.stageLabel && (
            <li className="rounded-full bg-white/15 px-3 py-1 text-app-caption">
              {view.stageLabel}
            </li>
          )}
          {view.chips.map((chip) => (
            <li
              key={chip}
              className="rounded-full bg-white/15 px-3 py-1 text-app-caption"
            >
              {chip}
            </li>
          ))}
        </ul>
      )}

      {view.notices.length > 0 && (
        <div className="mt-3 text-app-label text-white/90">
          {view.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      )}
      {showLink && (
        <Link
          to={GROWTH_PATHS.home}
          className="mt-2 inline-block rounded text-app-label font-semibold underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-white/60"
        >
          성장설계 보러 가기
        </Link>
      )}

      {handoff.planItems.length > 0 && (
        <div
          role="radiogroup"
          aria-labelledby={`${groupId}-label`}
          className="mt-4 border-t border-white/20 pt-4"
        >
          <p id={`${groupId}-label`} className="text-app-label font-semibold">
            이번에 이어갈 과제
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {handoff.planItems.map((item) => (
              <PlanItemRadio
                key={item.id}
                name={groupId}
                label={item.title}
                checked={selectedPlanItemId === item.id}
                disabled={disabled}
                onSelect={() => onSelectPlanItem(item.id)}
              />
            ))}
            <PlanItemRadio
              name={groupId}
              label="과제 없이 진행"
              checked={selectedPlanItemId === null}
              disabled={disabled}
              onSelect={() => onSelectPlanItem(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function PlanItemRadio({
  name,
  label,
  checked,
  disabled,
  onSelect,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-app-label">
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="size-4 accent-white focus-visible:outline-2 focus-visible:outline-white"
      />
      {label}
    </label>
  );
}
