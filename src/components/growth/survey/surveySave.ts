// 학생 조사 자동 저장의 표시 로직(순수). 저장 상태 문구, 실패 분류, 프리필 안내 배너.
import type { ApiResult } from "@/lib/growth/api";
import type { AnswerOrigin } from "./surveyState";

export type SaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "saved"; savedAt: number }
  | { phase: "error" };

/** 저장 상태 문구. 저장한 적이 없으면 null(가짜 시각을 만들지 않는다). */
export function saveStatusLabel(state: SaveState, now: number): string | null {
  switch (state.phase) {
    case "idle":
      return null;
    case "saving":
      return "저장 중";
    case "error":
      return "저장 실패, 다시 시도";
    case "saved": {
      const minutes = Math.floor(Math.max(0, now - state.savedAt) / 60_000);
      if (minutes < 1) return "자동 저장됨, 방금";
      if (minutes < 60) return `자동 저장됨, ${minutes}분 전`;
      return `자동 저장됨, ${Math.floor(minutes / 60)}시간 전`;
    }
  }
}

export type SaveFailure = "locked" | "closed" | "entitlement" | "failed";

export function classifySaveFailure(
  result: Exclude<ApiResult<unknown>, { kind: "ok" }>,
): SaveFailure {
  if (result.kind === "error") {
    if (result.status === 409 && result.code === "REPORT_LOCKED")
      return "locked";
    if (result.status === 409 && result.code === "REPORT_NOT_OPEN")
      return "closed";
    if (result.status === 403 && result.code === "NO_ENTITLEMENT")
      return "entitlement";
  }
  return "failed";
}

export type PrefillBanner = { title: string; body: string };

const BANNER_COPY: Record<AnswerOrigin, (n: number) => PrefillBanner> = {
  diagnosis: (n) => ({
    title: `무료진단 응답으로 ${n}문항을 미리 채웠어요`,
    body: "무료진단에서 답한 내용이에요. 다르면 바꿔 주세요.",
  }),
  activity: (n) => ({
    title: `저장된 활동에서 확인한 ${n}문항을 미리 채웠어요`,
    body: "수행평가와 심화탐구 기록에서 가져왔어요. 고칠 수 있어요.",
  }),
  previous: (n) => ({
    title: `지난 회차 답으로 ${n}문항을 미리 채웠어요`,
    body: "지난 회차에 답한 내용이에요. 달라졌다면 바꿔 주세요.",
  }),
};

const BANNER_ORDER: readonly AnswerOrigin[] = [
  "previous",
  "diagnosis",
  "activity",
];

/** 화면 위쪽 안내. 재진입이면 복원 안내 하나, 아니면 프리필 출처별로 하나씩. */
export function prefillBanners({
  resumed,
  answered,
  nextNumber,
  origins,
}: {
  resumed: boolean;
  answered: number;
  nextNumber: number | null;
  origins: Record<string, AnswerOrigin>;
}): PrefillBanner[] {
  if (resumed) {
    const save = "답은 문항마다 자동 저장돼요.";
    return [
      {
        title: `지난번에 답한 ${answered}문항을 불러왔어요`,
        body:
          nextNumber === null
            ? save
            : `${nextNumber}번부터 이어서 답하면 돼요. ${save}`,
      },
    ];
  }
  const counts = new Map<AnswerOrigin, number>();
  for (const origin of Object.values(origins)) {
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  }
  return BANNER_ORDER.flatMap((origin) => {
    const n = counts.get(origin);
    return n ? [BANNER_COPY[origin](n)] : [];
  });
}
