import type { ActivityRole, CandidateRow } from "@/lib/selfeval/types";
import { formatDotDate, sourceLabel, summarizeResult } from "./activitiesLogic";

// 활동 후보 카드 한 장(시안 14~29, 명세 No.27~32, 36). 값이 없는 줄은 그리지 않는다.
//   사용 불가: 흐리게 그리고 이유를 보여 준다. 체크 시도는 막지 않고 부모가 안내를 띄운다(시안 15).
//   이미 사용: 경고 칩을 붙이고 선택은 허용한다(시안 22, 29).

const ROLE_LABEL: Record<ActivityRole, string> = {
  core: "핵심",
  support: "보조",
};
const SUMMARY_MAX = 90;

type Props = {
  row: CandidateRow;
  /** 지금 선택에서 이 활동이 맡는 역할. 선택하지 않았으면 null. */
  activityRole: ActivityRole | null;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
};

const CHIP = "rounded-md bg-surface-04 px-2 py-0.5 text-app-caption text-ink";

export default function CandidateCard({
  row,
  activityRole,
  checked,
  disabled,
  onToggle,
}: Props) {
  const { activity, fit, unavailableReason, alreadyUsed } = row;
  const unavailable = unavailableReason !== null;
  const title = activity.topic;
  const summary = summarizeResult(activity.result, SUMMARY_MAX);
  const date = formatDotDate(activity.createdAt);
  const meta = [sourceLabel(activity.sourceProgram), date]
    .filter((v): v is string => v !== null)
    .join(", ");
  const checkboxLabel = `${title ?? activity.subject ?? "활동"} 선택`;

  return (
    <article
      className={`rounded-xl border bg-white px-5 py-4 ${
        checked ? "border-primary" : "border-line/60"
      } ${unavailable ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {activityRole && (
            <span className="rounded-md bg-primary px-2 py-0.5 text-app-badge font-semibold text-white">
              {ROLE_LABEL[activityRole]}
            </span>
          )}
          {activity.subject && <span className={CHIP}>{activity.subject}</span>}
          {meta && (
            <span className="text-app-caption text-ink-sub">{meta}</span>
          )}
          {unavailable && (
            <span className="text-app-caption font-semibold text-destructive">
              사용 불가
            </span>
          )}
          {alreadyUsed && (
            <span className="rounded-md bg-surface-badge px-2 py-0.5 text-app-caption font-semibold text-ink-strong">
              이미 사용
            </span>
          )}
        </div>
        <input
          type="checkbox"
          aria-label={checkboxLabel}
          aria-disabled={disabled || unavailable ? true : undefined}
          checked={checked}
          onChange={() => {
            if (!disabled) onToggle();
          }}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        />
      </div>

      {title && (
        <h3 className="mt-2 text-app-body font-bold text-ink-strong">
          {title}
        </h3>
      )}
      {summary && <p className="mt-1 text-app-label text-ink-sub">{summary}</p>}

      {unavailable ? (
        <p className="mt-3 rounded-lg bg-surface-04 px-3 py-2 text-app-caption text-ink-sub">
          {unavailableReason}
        </p>
      ) : (
        <>
          {fit && fit.reasons.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-surface-04 px-3 py-2 text-app-caption text-ink-sub">
              {fit.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {fit && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-app-caption text-ink-sub">적합도</span>
              <div
                role="progressbar"
                aria-label="적합도"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fit.score}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-04"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, fit.score))}%` }}
                />
              </div>
              <span className="w-8 text-right text-app-caption font-semibold text-ink-strong">
                {fit.score}
              </span>
            </div>
          )}
        </>
      )}
      {alreadyUsed && checked && (
        <p className="mt-3 text-app-caption text-ink-sub">
          이전 자기평가서에서 쓴 활동이에요. 다시 써도 되지만 내용이 겹칠 수
          있어요.
        </p>
      )}
    </article>
  );
}
