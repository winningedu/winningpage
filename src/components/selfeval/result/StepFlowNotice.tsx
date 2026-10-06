import { Loader2 } from "lucide-react";
import { Link } from "react-router";
import { CARD } from "@/components/growth/start/cardStyles";
import {
  routeForStep,
  SELFEVAL_PATHS,
} from "@/components/selfeval/selfevalPaths";
import { Button } from "@/components/ui/button";
import {
  MAX_MODEL_ATTEMPTS_PER_STEP,
  MAX_REGENERATIONS,
  type SessionStep,
} from "@/lib/selfeval/types";
import type { FlowState } from "./generationFlow";

// 모델 단계(분석, 생성, 검증)의 진행 중, 실패, 종결, 한도 안내 카드(시안 35, 51).
// 세 화면이 같은 상태 머신을 쓰므로 문구만 kind 로 갈라 한 곳에서 그린다.

export type FlowKind = "analysis" | "write" | "verify";

const RUNNING_TEXT: Record<FlowKind, string> = {
  analysis: "11개 항목으로 정리하는 중",
  write: "1차 작성본을 만드는 중",
  verify: "28개 확인 문장을 점검하는 중",
};

const FAILED_TITLE: Record<FlowKind, string> = {
  analysis: "분석하지 못했어요",
  write: "작성본을 만들지 못했어요",
  verify: "검증을 마치지 못했어요",
};

const TITLE = "text-app-card-title font-bold text-ink-strong";
const BODY = "mt-1 text-app-label text-ink-sub";
const LINK = "font-semibold text-accent underline underline-offset-2";

type Props = {
  kind: FlowKind;
  sessionId: string;
  state: FlowState<unknown>;
  onRetry: () => void;
};

function failedBody(kind: FlowKind, state: FlowState<unknown>): string {
  if (kind === "verify") {
    const restored = state.reversed
      ? " 이용 횟수 1회는 자동으로 복구됐어요."
      : "";
    return `한 번 더 요청했지만 결과를 받지 못했어요.${restored} 잠시 뒤 다시 검증해 주세요.`;
  }
  return state.errorMessage ?? "잠시 뒤 다시 시도해 주세요.";
}

export default function StepFlowNotice({
  kind,
  sessionId,
  state,
  onRetry,
}: Props) {
  const { phase } = state;

  if (phase === "running" || phase === "waiting" || phase === "idle") {
    return (
      <section className={CARD} role="status" aria-label="진행 중">
        <div className="flex items-center gap-3">
          <Loader2
            aria-hidden="true"
            className="size-5 animate-spin text-primary"
          />
          <p className={TITLE}>{RUNNING_TEXT[kind]}</p>
        </div>
        <p className={BODY}>
          {phase === "waiting"
            ? "같은 작업이 이미 진행 중이라 끝나기를 기다리고 있어요."
            : "최대 1분쯤 걸려요. 화면을 닫지 말고 기다려 주세요."}
        </p>
      </section>
    );
  }

  if (phase === "terminal") {
    return (
      <section className={CARD} role="alert">
        <p className={TITLE}>이 자기평가서는 종결됐어요</p>
        <p className={BODY}>
          시도 상한에 닿아 이 자기평가서는 종결됐어요.
          {kind === "write" && " 차감된 이용 횟수는 복구돼요."}
        </p>
        <Link
          to={SELFEVAL_PATHS.home}
          className={`${LINK} mt-4 inline-block text-app-label`}
        >
          처음 화면으로
        </Link>
      </section>
    );
  }

  if (phase === "blocked") {
    const noRegenerate = state.errorCode === "REGENERATE_EXHAUSTED";
    return (
      <section className={CARD} role="alert">
        <p className={TITLE}>
          {noRegenerate ? "다시 생성을 쓸 수 없어요" : "이용 횟수가 없어요"}
        </p>
        <p className={BODY}>
          {noRegenerate
            ? `다시 생성을 ${MAX_REGENERATIONS}회 모두 썼어요. 직접 고치거나 검증으로 넘어가 주세요.`
            : "이용권을 구매하면 이어서 쓸 수 있어요."}
        </p>
        {!noRegenerate && (
          <Link
            to="/pricing?service=selfeval"
            className={`${LINK} mt-4 inline-block text-app-label`}
          >
            이용권 보러 가기
          </Link>
        )}
      </section>
    );
  }

  if (phase === "failed") {
    const orderStep = state.orderStep;
    const retryLabel =
      kind === "verify"
        ? "다시 검증하기"
        : state.attempts !== null
          ? `다시 시도(${state.attempts}/${MAX_MODEL_ATTEMPTS_PER_STEP})`
          : "다시 시도";
    return (
      <section className={CARD} role="alert">
        <p className={TITLE}>{FAILED_TITLE[kind]}</p>
        <p className={BODY}>{failedBody(kind, state)}</p>
        {orderStep !== null ? (
          <Link
            to={routeForStep(orderStep as SessionStep, sessionId)}
            className={`${LINK} mt-4 inline-block text-app-label`}
          >
            진행 중인 화면으로
          </Link>
        ) : (
          <Button
            type="button"
            size="lg"
            className="mt-4 h-10 px-5 text-app-label font-semibold"
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        )}
      </section>
    );
  }

  return null;
}
