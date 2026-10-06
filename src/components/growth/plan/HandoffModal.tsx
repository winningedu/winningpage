import AppModal from "@/components/goal/AppModal";
import type { ProgramHandoff } from "@/lib/growth/api";
import { buildHandoffRows, handoffSubtitle } from "./planLogic";

type Props = {
  handoff: ProgramHandoff | null;
  issuedAt: string | null;
  onClose: () => void;
  onConfirm: (handoff: ProgramHandoff) => void;
};

const SERVICE_NAME = { self: "자기평가서", deep: "심화탐구" } as const;

export default function HandoffModal({
  handoff,
  issuedAt,
  onClose,
  onConfirm,
}: Props) {
  const name =
    handoff && handoff.program !== "school"
      ? SERVICE_NAME[handoff.program]
      : "";
  const rows = handoff ? buildHandoffRows(handoff, issuedAt) : [];

  return (
    <AppModal
      open={handoff !== null}
      onClose={onClose}
      title={`위닝 ${name}로 이동할까요?`}
      subtitle={handoffSubtitle(name)}
      submitLabel="이동하기"
      onSubmit={() => handoff && onConfirm(handoff)}
    >
      <section aria-label="함께 넘어가는 값" className="flex flex-col gap-3">
        <h3 className="text-app-label font-semibold text-ink-strong">
          이 값이 전달돼요
        </h3>
        <dl className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-app-caption text-ink-sub">{row.label}</dt>
              <dd className="text-app-label text-ink-strong">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="rounded-lg bg-surface-04 px-3 py-2 text-app-caption text-ink-sub">
          위닝 프로그램을 쓰지 않아도 돼요. 직접 체크로 완료할 수도 있어요.
        </p>
      </section>
    </AppModal>
  );
}
