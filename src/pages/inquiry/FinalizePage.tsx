import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import FieldsForm from "@/components/inquiry/finalize/FieldsForm";
import {
  buildSummaryRows,
  canSubmit,
  type FormState,
  initFormState,
  missingLabels,
  toRequestFields,
} from "@/components/inquiry/finalize/finalizeLogic";
import ResultCard from "@/components/inquiry/finalize/ResultCard";
import SummaryTable from "@/components/inquiry/finalize/SummaryTable";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import {
  useInquiryScreenStep,
  useInquiryShell,
} from "@/components/inquiry/InquiryShellContext";
import StepGate from "@/components/inquiry/StepGate";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { finalizeSession } from "@/lib/inquiry/api";
import { inquirySessionDetailQuery } from "@/lib/inquiry/queries";
import type { FinalizePreview } from "@/lib/inquiry/types";
import { cn } from "@/lib/utils";

const TITLE = "이 탐구를 다음 탐구의 재료로";
const SUBCOPY =
  "확정하면 이 심화탐구가 활동 기록에 쌓여요. 여기서 남긴 한계와 후속 탐구가 다음 심화탐구의 출발점이 돼요";
const PRICING = "/pricing?service=inquiry";
const BLOCKED_HINT = "비어 있는 항목을 채우면 적립할 수 있어요";

type SubmitError = {
  message: string;
  link?: { to: string; label: string };
};

function errorFor(result: {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
}): SubmitError {
  if (result.status === 400 && result.code === "INVALID_BODY") {
    const names = missingLabels(result.extra?.missing);
    return {
      message:
        names.length > 0
          ? `비어 있는 항목: ${names.join(", ")}. 채운 뒤 다시 적립해 주세요`
          : "입력한 내용을 확인해 주세요",
    };
  }
  if (result.status === 409 && result.code === "STEP_ORDER") {
    return {
      message: "평가를 먼저 마쳐야 해요",
      link: { to: INQUIRY_PATHS.evaluate, label: "평가 리포트로" },
    };
  }
  if (result.status === 403 && result.code === "NO_ENTITLEMENT") {
    return {
      message: "이용권이 있어야 적립할 수 있어요",
      link: { to: PRICING, label: "이용권 보기" },
    };
  }
  return { message: "적립하지 못했어요. 잠시 뒤 다시 시도해 주세요" };
}

function FinalizeForm({
  sessionId,
  preview,
  onDone,
}: {
  sessionId: string;
  preview: FinalizePreview;
  onDone: (replySent: boolean | null) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initFormState(preview));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const ready = canSubmit(form);

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await finalizeSession({
      sessionId,
      fields: toRequestFields(form),
    });
    setSubmitting(false);
    if (result.kind === "ok") {
      onDone(result.data.replySent);
      return;
    }
    setError(
      result.kind === "error"
        ? errorFor(result)
        : { message: "응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요" },
    );
  }

  return (
    <>
      <SummaryTable rows={buildSummaryRows(preview)} />
      <FieldsForm
        value={form}
        onChange={(key, text) => setForm((prev) => ({ ...prev, [key]: text }))}
        disabled={submitting}
      />
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-error p-4 text-app-label text-error"
        >
          <p>{error.message}</p>
          {error.link && (
            <Link to={error.link.to} className="font-semibold underline">
              {error.link.label}
            </Link>
          )}
        </div>
      )}
      {!ready && (
        <p className="text-right text-app-label text-error">{BLOCKED_HINT}</p>
      )}
      <div className="flex justify-end gap-3">
        <Link
          to={INQUIRY_PATHS.write}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-5")}
        >
          더 보완하고 다시 평가
        </Link>
        <button
          type="button"
          aria-disabled={!ready || submitting}
          onClick={() => void submit()}
          className={cn(
            buttonVariants(),
            "h-10 px-5",
            (!ready || submitting) && "cursor-not-allowed opacity-50",
          )}
        >
          확정하고 활동 기록에 적립
        </button>
      </div>
    </>
  );
}

// 가드를 통과한 뒤에만 그려 세션이 있을 때만 조회한다. 적립 직후 세션이 completed 가 돼도
// 결과 카드는 이 컴포넌트의 상태로 유지한다.
function FinalizeContent() {
  const { userId } = useSession();
  const { session, refetchBootstrap } = useInquiryShell();
  const sessionId = session?.id ?? null;
  const { data, isPending, isError, refetch } = useQuery(
    inquirySessionDetailQuery(userId ?? null, sessionId),
  );
  const [done, setDone] = useState<{ replySent: boolean | null } | null>(null);

  if (done) return <ResultCard replySent={done.replySent} />;
  if (isPending && !isError) {
    return (
      <div role="status" aria-label="불러오는 중">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6"
      >
        <p className="text-app-body text-ink-strong">
          확정할 내용을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-5")}
        >
          다시 불러오기
        </button>
      </div>
    );
  }
  if (data.session.status === "completed")
    return <ResultCard replySent={null} />;
  if (!data.finalizePreview) {
    return (
      <p className="text-app-body text-ink-sub">
        확정할 평가 내용이 아직 없어요. 평가 리포트에서 다시 확인해 주세요.
      </p>
    );
  }

  return (
    <FinalizeForm
      sessionId={data.session.id}
      preview={data.finalizePreview}
      onDone={(replySent) => {
        setDone({ replySent });
        void refetchBootstrap();
      }}
    />
  );
}

export default function FinalizePage() {
  useInquiryScreenStep(6);
  return (
    <StepGate step={6} title={TITLE} subcopy={SUBCOPY}>
      <FinalizeContent />
    </StepGate>
  );
}
