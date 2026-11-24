import { Link } from "react-router";

/**
 * 마이페이지 "나의 서비스" 탭 카드 — Figma hsokTD6OilcNEXyCR24sn4 노드 3762:18713 실측.
 * 데이터 유도(주문명 파싱, 상태·카테고리 분류)는 상위 MyServicesTab.jsx가 전담하고,
 * 이 컴포넌트는 이미 만들어진 view-model(card)만 그대로 그린다.
 *
 * "프로그램 가기 →" 등 화살표는 시안에서 별도 아이콘이 아니라 텍스트에 포함된 문자라
 * 아이콘 asset 대신 유니코드 화살표를 그대로 라벨에 붙여 렌더링한다.
 *
 */
type ServiceCardAction = {
  kind: "link" | "outline-solid" | "solid";
  label: string;
  href: string;
  disabled?: boolean;
  disabledReason?: string;
};

type ServiceCardData = {
  id: string;
  serviceName: string;
  /** '이용중' | '잔여 N회' | '이용완료' */
  statusLabel: string;
  isOngoing: boolean;
  /** 0~100 */
  progressPercent: number;
  /** 메타 한 줄 좌측(이용기간/회권/진단 완료 등) */
  metaLeft: string;
  /** 메타 한 줄 우측(남은일수/유효기간/완료일 등) */
  metaRight: string;
  actions: ServiceCardAction[];
  /** 같은 서비스로 묶인 결제 건수. 2건 이상일 때만 "결제 N건" 배지를 보여준다. */
  paymentCount: number;
  /**
   * 이용 중 카드의 메타 행을 클릭 가능하게 만든다(2026-09-01, 서비스 단위
   * 합산 카드의 grant별 분해 다이얼로그). 없으면 기존처럼 정적 텍스트.
   */
  onMetaClick?: (() => void) | undefined;
};

type ServiceCardProps = {
  card: ServiceCardData;
};

export default function ServiceCard({ card }: ServiceCardProps) {
  const {
    serviceName,
    statusLabel,
    isOngoing,
    progressPercent,
    metaLeft,
    metaRight,
    actions,
    paymentCount,
    onMetaClick,
  } = card;

  const statusPillClass = isOngoing
    ? "bg-performance-chip text-accent"
    : "bg-[#d9d9d9] text-ink-sub";

  const disabledActionReason = actions.find(
    (action) => action.disabled,
  )?.disabledReason;

  return (
    <div className="flex flex-col gap-4.75 rounded-perf-modal border border-[#d9d9d9] bg-white p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[1.25rem] font-semibold leading-[1.3] tracking-[-0.025rem] text-ink">
            {serviceName}
          </h3>
          {paymentCount > 1 && (
            <span className="text-[0.8125rem] font-medium text-ink-sub">
              결제 {paymentCount}건
            </span>
          )}
        </div>
        <span
          className={`inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-[0.875rem] font-semibold leading-[1.4] ${statusPillClass}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="h-1.5 w-full rounded-xl bg-[#d9d9d9]">
        <div
          className="h-full rounded-xl bg-primary"
          style={{ width: `${Math.round(progressPercent)}%` }}
        />
      </div>

      {onMetaClick ? (
        // 서비스 단위 합산 카드의 grant별 분해 다이얼로그 진입점(2026-09-01) —
        // 클릭 가능함을 링크 관례(hover 시 색만 짙어짐, 밑줄·아이콘 없음)로
        // 최소한만 암시한다.
        <button
          type="button"
          onClick={onMetaClick}
          className="flex items-center justify-between gap-2 text-left text-[0.875rem] leading-[1.4] tracking-[-0.0175rem] text-ink-sub transition hover:text-ink"
        >
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 text-[0.875rem] leading-[1.4] tracking-[-0.0175rem] text-ink-sub">
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </div>
      )}

      {isOngoing && actions.length === 1 ? (
        // 이용 중 카드는 액션이 1개면 텍스트 링크, 2개(리포트 보기 + 검사하기)면
        // 완료 카드와 같은 버튼 행으로 그린다.
        <Link
          to={actions[0]!.href}
          className="text-[0.875rem] font-medium leading-[1.4] tracking-[-0.0175rem] text-accent transition hover:opacity-80"
        >
          {actions[0]!.label} →
        </Link>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {actions.map((action) =>
              action.disabled ? (
                <span
                  key={`${action.kind}-${action.label}`}
                  aria-disabled="true"
                  title={action.disabledReason}
                  className="inline-flex h-8 w-33 cursor-not-allowed items-center justify-center rounded-lg bg-[#f2f2f2] text-[0.875rem] font-semibold tracking-[-0.0175rem] text-ink-sub/60"
                >
                  {action.label}
                </span>
              ) : (
                <Link
                  key={`${action.kind}-${action.label}`}
                  to={action.href}
                  className={
                    action.kind === "outline-solid"
                      ? "inline-flex h-8 w-33 items-center justify-center rounded-lg border border-[#d9d9d9] text-[0.875rem] font-semibold tracking-[-0.0175rem] text-ink-sub transition hover:bg-surface-04"
                      : "inline-flex h-8 w-33 items-center justify-center rounded-lg bg-[#e9f4ff] text-[0.875rem] font-semibold tracking-[-0.0175rem] text-accent transition hover:bg-[#d9edff]"
                  }
                >
                  {action.label}
                </Link>
              ),
            )}
          </div>
          {disabledActionReason && (
            <p className="text-[0.75rem] leading-[1.4] text-ink-sub">
              {disabledActionReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
