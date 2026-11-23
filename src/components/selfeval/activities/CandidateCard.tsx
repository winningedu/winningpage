import type {
  ActivityRole,
  CandidateRow,
  LinkStatus,
} from "@/lib/selfeval/types";
import {
  formatDotDate,
  linkChipText,
  reasonLinesOf,
  sourceLabel,
  summarizeResult,
} from "./activitiesLogic";
import { needsConfirmState, UNLINKED_WARNING } from "./linkMapLogic";

// 활동 후보 카드 한 장(시안 14~29, 명세 No.27~32, 36). 값이 없는 줄은 그리지 않는다.
//   사용 불가: 흐리게 그리고 이유를 보여 준다. 체크 시도는 막지 않고 부모가 안내를 띄운다(시안 15).
//   이미 사용: 경고 칩을 붙이고 선택은 허용한다(시안 22, 29).
//   연계: 칩으로 유형, 단계, 강도를 보인다(명세 No.179, 185). 연계 없는 기록을 고르면 경고와 한 줄 입력(children)을 둔다(No.180).

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
  linkStatus: LinkStatus;
  /** 회원 시간대. 카드 날짜 표기 기준. */
  timeZone: string;
  /** 고른 보조 기록이 핵심과 이어지지 않았다. children 으로 설명 입력을 받는다. */
  unlinked: boolean;
  children?: React.ReactNode;
};

const CHIP = "rounded-md bg-surface-04 px-2 py-0.5 text-app-caption text-ink";

export default function CandidateCard({
  row,
  activityRole,
  checked,
  disabled,
  onToggle,
  linkStatus,
  unlinked,
  timeZone,
  children,
}: Props) {
  const { activity, fit, unavailableReason, alreadyUsed } = row;
  const unavailable = unavailableReason !== null;
  const title = activity.topic;
  const summary = summarizeResult(activity.result, SUMMARY_MAX);
  const date = formatDotDate(activity.createdAt, timeZone);
  const meta = [sourceLabel(activity.sourceProgram), date]
    .filter((v): v is string => v !== null)
    .join(", ");
  const chip =
    fit === null
      ? null
      : linkStatus === "unchecked"
        ? "연계 확인 안 됨"
        : linkStatus === "ok"
          ? linkChipText(row)
          : null;
  const reasons = reasonLinesOf(row);
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
          {chip && <span className={CHIP}>{chip}</span>}
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
          {reasons.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-surface-04 px-3 py-2 text-app-caption text-ink-sub">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {row.contribution !== undefined && row.contribution > 0 && (
            <p className="mt-2 text-app-caption text-ink-sub">
              새로 더하는 항목 {row.contribution}개
            </p>
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
      {checked && needsConfirmState(row.linkState) && (
        <p className="mt-3 text-app-caption text-ink-sub">
          확인하기 전에는 연결 문장 없이 참고 항목으로만 써요
        </p>
      )}
      {checked && unlinked && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-surface-04 px-3 py-2">
          <p className="text-app-caption font-semibold text-ink-strong">
            {UNLINKED_WARNING}
          </p>
          <p className="text-app-caption text-ink-sub">
            어떻게 이어지는지 한 줄을 쓰지 않으면 이 기록은 글을 만들 때 쓰지
            않아요
          </p>
          {children}
        </div>
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
